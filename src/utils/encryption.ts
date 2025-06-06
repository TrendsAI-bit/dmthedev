import { box, randomBytes } from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import bs58 from 'bs58';
import { sha512 } from '@noble/hashes/sha512';

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

function safeDecodeBase64(value: string, fieldName: string): Uint8Array {
  try {
    return decodeBase64(value);
  } catch (error: any) {
    throw new Error(`Invalid base64 in ${fieldName}: ${error.message || 'Unknown error'}`);
  }
}

function safelyDecodeBytes(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) {
    console.warn('⚠️ Empty bytes received');
    return '[❌ Empty data]';
  }

  try {
    // First check if it's JSON by looking at first character
    const firstByte = bytes[0];
    const lastByte = bytes[bytes.length - 1];
    const mightBeJson = firstByte === 123 && lastByte === 125; // '{' and '}'

    // Log attempt to decode
    console.log('Attempting UTF-8 decode of', bytes.length, 'bytes');
    console.log('First byte:', firstByte, 'Last byte:', lastByte);
    
    // Attempt UTF-8 decoding
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!text) {
      throw new Error('Empty text after decoding');
    }

    // If it might be JSON, try to parse and format it
    if (mightBeJson) {
      try {
        const parsed = JSON.parse(text);
        console.log('✅ Successfully parsed JSON:', parsed);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        console.warn('⚠️ JSON parse failed:', e);
      }
    }
    
    console.log('✅ Successfully decoded UTF-8 text');
    return text;
  } catch (e) {
    console.warn('⚠️ UTF-8 decode failed:', e);
    
    // Create both hex and base64 representations
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const base64 = encodeBase64(bytes);
    
    console.log('🧾 Hex dump:', hex);
    console.log('📝 Base64:', base64);

    // Return a formatted preview with both representations
    return `[⚠️ Binary data (${bytes.length} bytes)]\n` +
           `Base64: ${base64.slice(0, 32)}...\n` +
           `Hex: ${hex.slice(0, 48)}...`;
  }
}

function safeDecryptToString(decryptedBytes: Uint8Array | null): string {
  if (!decryptedBytes) {
    return '[❌ Failed to decrypt]';
  }
  return safelyDecodeBytes(decryptedBytes);
}

function validateEncryptedData(data: EncryptedData): void {
  try {
    if (!data.ciphertext || !data.nonce || !data.ephemeralPublicKey) {
      throw new Error('Missing required encryption fields');
    }

    const ciphertext = safeDecodeBase64(data.ciphertext, 'ciphertext');
    const nonce = safeDecodeBase64(data.nonce, 'nonce');
    const ephemeralPublicKey = safeDecodeBase64(data.ephemeralPublicKey, 'ephemeralPublicKey');

    if (nonce.length !== box.nonceLength) {
      throw new Error(`Invalid nonce length: ${nonce.length}`);
    }
    if (ephemeralPublicKey.length !== box.publicKeyLength) {
      throw new Error(`Invalid public key length: ${ephemeralPublicKey.length}`);
    }
    if (ciphertext.length === 0) {
      throw new Error('Empty ciphertext');
    }

    console.log('Validation passed:', {
      ciphertext: bytesToHex(ciphertext),
      nonce: bytesToHex(nonce),
      ephemeralPublicKey: bytesToHex(ephemeralPublicKey)
    });
  } catch (error: any) {
    console.error('Validation error:', error);
    throw new Error(`Invalid encrypted data: ${error.message || 'Unknown error'}`);
  }
}

// Add message format versioning
function encodeMessageWithVersion(message: string): Uint8Array {
  // Add version prefix to help with future format changes
  const versionedMessage = JSON.stringify({
    version: 'v1',
    text: message,
    timestamp: new Date().toISOString()
  });
  return new TextEncoder().encode(versionedMessage);
}

// Add utility functions for consistent data handling
function isBase64(str: string): boolean {
  if (!str) return false;
  try {
    return btoa(atob(str)) === str;
  } catch {
    return false;
  }
}

function toBase64(data: Uint8Array): string {
  return encodeBase64(data);
}

function fromBase64(base64: string): Uint8Array {
  return decodeBase64(base64);
}

function fromBase58(b58: string): Uint8Array {
  return bs58.decode(b58);
}

function toBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

/**
 * 🔑 DERIVE KEYPAIR FROM WALLET SIGNATURE
 */
export async function deriveKeypairFromWallet(wallet: any): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }> {
  console.log("🔑 Deriving keypair from wallet signature...");
  
  if (!wallet?.publicKey || !wallet?.signMessage) {
    throw new Error("Wallet does not support required methods");
  }

  const walletAddress = wallet.publicKey.toBase58();
  const signedMessage = await wallet.signMessage(
    new TextEncoder().encode(`DM_DEV_DECRYPT:${walletAddress}`)
  );
  
  console.log("✅ Got wallet signature");
  
  const hash = sha512(signedMessage);
  const privateKey = hash.slice(0, 32); // Ed25519 private key
  const keypair = box.keyPair.fromSecretKey(privateKey);
  
  console.log("✅ Derived keypair from signature");
  return keypair;
}

/**
 * 🔐 ENCRYPTION: Uses signature-derived public key + ephemeral key
 */
export function encryptMessage(message: string, derivedPublicKeyBase58: string): EncryptedData {
  console.log("🔐 Starting encryption with signature-derived public key");
  
  const nonce = randomBytes(box.nonceLength);
  console.log("✅ Generated nonce");
  
  const ephemeralKeypair = box.keyPair();
  console.log("✅ Generated ephemeral keypair");
  
  const derivedPublicKey = bs58.decode(derivedPublicKeyBase58);
  console.log("✅ Decoded signature-derived public key");

  const sharedKey = box.before(derivedPublicKey, ephemeralKeypair.secretKey);
  console.log("✅ Created shared key with box.before()");
  
  // Wrap the message in versioned JSON
  const messageToEncrypt = JSON.stringify({
    v: 2,
    data: message,
  });
  const messageBytes = new TextEncoder().encode(messageToEncrypt);
  
  const ciphertext = box.after(messageBytes, nonce, sharedKey);
  console.log("✅ Encrypted message with box.after()");

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  console.log("✅ Encryption completed successfully");
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    ephemeralPublicKey: toBase64(ephemeralKeypair.publicKey),
  };
}

/**
 * 🔓 DECRYPTION: Uses signature-derived secret key + ephemeral key
 */
export async function decryptMessage(
  encryptedData: EncryptedData,
  wallet: any,
  encryptedForPublicKey?: string
): Promise<Uint8Array> {
  console.log(`🔓 Starting signature-based decryption for wallet: ${wallet.name}`);
  
  // Step 1: Derive the same keypair that was used for encryption
  const keypair = await deriveKeypairFromWallet(wallet);
  console.log("✅ Re-derived keypair from wallet signature");

  // Step 2: Verify that our derived key matches the encryption target (if provided)
  if (encryptedForPublicKey) {
    const derivedPublicKeyBase58 = bs58.encode(keypair.publicKey);
    if (derivedPublicKeyBase58 !== encryptedForPublicKey) {
      console.warn("⚠️ Derived key does not match encryption target!");
      console.warn("Expected:", encryptedForPublicKey);
      console.warn("Derived:", derivedPublicKeyBase58);
      throw new Error(`Key mismatch: This message was encrypted for key ${encryptedForPublicKey.slice(0,8)}...${encryptedForPublicKey.slice(-8)}, but your derived key is ${derivedPublicKeyBase58.slice(0,8)}...${derivedPublicKeyBase58.slice(-8)}`);
    } else {
      console.log("✅ Derived key matches encryption target");
    }
  }

  // Step 3: Extract encrypted data
  const nonce = fromBase64(encryptedData.nonce);
  const ciphertext = fromBase64(encryptedData.ciphertext);
  const ephemeralPublicKey = fromBase64(encryptedData.ephemeralPublicKey);
  
  console.log("📏 Data lengths - nonce:", nonce.length, "ephemeral:", ephemeralPublicKey.length);
  
  // Step 4: Create shared key using ephemeral public key + derived secret key
  console.log("🤝 Creating shared key with box.before()...");
  const sharedKey = box.before(ephemeralPublicKey, keypair.secretKey);
  console.log("✅ Created shared key");

  // Step 5: Decrypt
  console.log("🔓 Attempting decryption with box.open.after()...");
  const decryptedBytes = box.open.after(ciphertext, nonce, sharedKey);
  
  if (!decryptedBytes) {
    throw new Error("Decryption failed: incorrect key or message corrupted.");
  }

  console.log("✅ Decryption successful!", decryptedBytes.length, "bytes");
  return decryptedBytes;
}

/**
 * 🧪 TEST FUNCTION: Tests the signature-derived key approach
 */
export async function testEncryptionDecryption(): Promise<boolean> {
  try {
    console.log("🧪 Testing signature-derived key encryption/decryption approach...");
    
    // Create a test keypair to simulate a wallet
    const testWallet = box.keyPair();
    const testWalletAddress = bs58.encode(testWallet.publicKey);
    
    // Mock wallet object
    const mockWallet = {
      publicKey: { toBase58: () => testWalletAddress },
      signMessage: async (message: Uint8Array) => {
        // Simulate signing by creating a deterministic signature
        const combinedData = new Uint8Array(message.length + testWallet.secretKey.length);
        combinedData.set(message, 0);
        combinedData.set(testWallet.secretKey, message.length);
        return sha512(combinedData).slice(0, 64);
      },
      name: "TestWallet"
    };
    
    // Test message
    const testMessage = "Hello, this is a test message!";
    console.log("📝 Original message:", testMessage);
    
    // 1. DERIVE KEYPAIR (what recipient would do)
    console.log("🔑 Testing keypair derivation...");
    const derivedKeypair = await deriveKeypairFromWallet(mockWallet);
    const derivedPublicKeyBase58 = bs58.encode(derivedKeypair.publicKey);
    console.log("✅ Derived public key for encryption");
    
    // 2. ENCRYPTION PROCESS
    console.log("🔐 Testing encryption...");
    const encrypted = encryptMessage(testMessage, derivedPublicKeyBase58);
    console.log("✅ Encryption successful");
    
    // 3. DECRYPTION PROCESS
    console.log("🔓 Testing decryption...");
    const decrypted = await decryptMessage(encrypted, mockWallet);
    
    // Decode the result
    const decodedText = new TextDecoder("utf-8").decode(decrypted);
    const parsed = JSON.parse(decodedText);
    const decryptedMessage = parsed.data;
    
    console.log("📝 Decrypted message:", decryptedMessage);
    
    if (decryptedMessage === testMessage) {
      console.log("✅ Test PASSED! Signature-derived key encryption/decryption works correctly.");
      return true;
    } else {
      console.log("❌ Test FAILED! Messages don't match.");
      return false;
    }
    
  } catch (error) {
    console.error("❌ Test error:", error);
    return false;
  }
} 