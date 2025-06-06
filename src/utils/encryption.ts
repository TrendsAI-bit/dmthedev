import { box, randomBytes, sign } from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import bs58 from 'bs58';
import { sha512 } from '@noble/hashes/sha512';

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

export interface DerivedKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
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
 * 🔑 DERIVE KEYPAIR FROM WALLET SIGNATURE (CORRECTED)
 * Uses Ed25519 signature keypair with standardized message format
 */
export async function deriveKeypairFromWallet(wallet: any): Promise<DerivedKeypair> {
  console.log("🔑 Deriving Ed25519 keypair from wallet signature...");
  
  if (!wallet?.publicKey || !wallet?.signMessage) {
    throw new Error("Wallet does not support required methods");
  }

  const walletAddress = wallet.publicKey.toBase58();
  const messageToSign = `DM_DEV_DERIVE_KEY:${walletAddress}`;
  
  console.log("📝 Signing standardized message:", messageToSign);
  const signedMessage = await wallet.signMessage(
    new TextEncoder().encode(messageToSign)
  );
  
  console.log("✅ Got wallet signature");
  
  // Use Ed25519 signature keypair (NOT box keypair)
  const hash = sha512(signedMessage);
  const seed = hash.slice(0, 32); // Ed25519 seed
  const derivedKeypair = sign.keyPair.fromSeed(seed);
  
  console.log("✅ Derived Ed25519 keypair from signature");
  console.log("🔑 Derived Public Key (base58):", toBase58(derivedKeypair.publicKey));
  
  return derivedKeypair;
}

/**
 * 🔐 ENCRYPTION: Uses recipient's stored derived public key + ephemeral key
 */
export function encryptMessage(message: string, recipientDerivedPublicKeyBase58: string): EncryptedData {
  console.log("🔐 Starting encryption with recipient's derived public key");
  
  if (!message) throw new Error("Message cannot be empty");
  if (!recipientDerivedPublicKeyBase58) throw new Error("Recipient derived public key is required");
  
  const nonce = randomBytes(box.nonceLength);
  console.log("✅ Generated nonce");
  
  const ephemeralKeypair = box.keyPair();
  console.log("✅ Generated ephemeral keypair");
  
  const recipientDerivedPublicKey = fromBase58(recipientDerivedPublicKeyBase58);
  console.log("✅ Decoded recipient's derived public key");

  const sharedKey = box.before(recipientDerivedPublicKey, ephemeralKeypair.secretKey);
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
 * 🔓 DECRYPTION: Uses derived secret key + ephemeral key (with backwards compatibility)
 */
export async function decryptMessage(
  encryptedData: EncryptedData, 
  wallet: any
): Promise<Uint8Array> {
  console.log(`🔓 Starting decryption for wallet: ${wallet.name}`);
  
  // Method 1: Try new Ed25519 signature-derived approach
  try {
    console.log("🎯 Trying Method 1: Ed25519 signature-derived key approach");
    
    // Derive the same Ed25519 keypair that was used for encryption
    const derivedKeypair = await deriveKeypairFromWallet(wallet);
    console.log("✅ Re-derived Ed25519 keypair from wallet signature");

    // Extract encrypted data
    const nonce = fromBase64(encryptedData.nonce);
    const ciphertext = fromBase64(encryptedData.ciphertext);
    const ephemeralPublicKey = fromBase64(encryptedData.ephemeralPublicKey);
    
    console.log("📏 Data lengths - nonce:", nonce.length, "ephemeral:", ephemeralPublicKey.length);
    
    // Create shared key using ephemeral public key + derived secret key
    console.log("🤝 Creating shared key with box.before()...");
    const sharedKey = box.before(ephemeralPublicKey, derivedKeypair.secretKey);
    console.log("✅ Created shared key");

    // Decrypt
    console.log("🔓 Attempting decryption with box.open.after()...");
    const decryptedBytes = box.open.after(ciphertext, nonce, sharedKey);
    
    if (decryptedBytes) {
      console.log("✅ Method 1 SUCCESS! Decryption with Ed25519 derived key:", decryptedBytes.length, "bytes");
      return decryptedBytes;
    } else {
      console.log("❌ Method 1 failed - trying fallback methods...");
    }
    
  } catch (error) {
    console.log("❌ Method 1 error:", error, "- trying fallback methods...");
  }

  // Method 2: Try old box.keyPair approach for backwards compatibility
  try {
    console.log("🔄 Trying Method 2: Old box.keyPair fallback");
    
    const walletAddress = wallet.publicKey.toBase58();
    const messageToSign = `DM_DEV_DECRYPT:${walletAddress}`;
    console.log("📝 Signing old message format:", messageToSign);
    
    const msgBytes = new TextEncoder().encode(messageToSign);
    const signature = await wallet.signMessage(msgBytes, 'utf8');

    // Use old box.keyPair approach
    const hash = sha512(signature);
    const privateKey = hash.slice(0, 32);
    const keypair = box.keyPair.fromSecretKey(privateKey);
    
    const nonce = fromBase64(encryptedData.nonce);
    const ciphertext = fromBase64(encryptedData.ciphertext);
    const ephemeralPublicKey = fromBase64(encryptedData.ephemeralPublicKey);
    
    const sharedKey = box.before(ephemeralPublicKey, keypair.secretKey);
    const decryptedBytes = box.open.after(ciphertext, nonce, sharedKey);
    
    if (decryptedBytes) {
      console.log("✅ Method 2 SUCCESS! Decryption with old box.keyPair approach:", decryptedBytes.length, "bytes");
      return decryptedBytes;
    }
    
  } catch (error) {
    console.log("❌ Method 2 error:", error);
  }

  // Method 3: Try other signature variations for backwards compatibility
  const fallbackMessages = [
    `DM_THE_DEV_DECRYPT:${wallet.publicKey.toBase58()}`,
    `Derive private key for ${wallet.publicKey.toBase58()}`,
    `Sign to decrypt message for ${wallet.publicKey.toBase58()}`,
  ];
  
  for (let i = 0; i < fallbackMessages.length; i++) {
    try {
      console.log(`🔄 Trying Method ${3 + i}: "${fallbackMessages[i]}"`);
      
      const msgBytes = new TextEncoder().encode(fallbackMessages[i]);
      const signature = await wallet.signMessage(msgBytes, 'utf8');
      
      const sharedSecret = sha512(signature).slice(0, 32);
      
      const nonce = fromBase64(encryptedData.nonce);
      const ciphertext = fromBase64(encryptedData.ciphertext);
      const ephemeralPublicKey = fromBase64(encryptedData.ephemeralPublicKey);
      
      const sharedKey = box.before(ephemeralPublicKey, sharedSecret);
      const decryptedBytes = box.open.after(ciphertext, nonce, sharedKey);
      
      if (decryptedBytes) {
        console.log(`✅ Method ${3 + i} SUCCESS! Decryption with fallback message:`, decryptedBytes.length, "bytes");
        return decryptedBytes;
      }
      
    } catch (error) {
      console.log(`❌ Method ${3 + i} error:`, error);
    }
  }

  throw new Error("All decryption methods failed. This message may have been encrypted with an incompatible key or is corrupted.");
}

/**
 * 🧪 TEST FUNCTION: Tests the Ed25519 signature-derived key approach
 */
export async function testEncryptionDecryption(): Promise<boolean> {
  try {
    console.log("🧪 Testing Ed25519 signature-derived key encryption/decryption approach...");
    
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
    console.log("🔑 Testing Ed25519 keypair derivation...");
    const derivedKeypair = await deriveKeypairFromWallet(mockWallet);
    const derivedPublicKeyBase58 = bs58.encode(derivedKeypair.publicKey);
    console.log("✅ Derived Ed25519 public key for encryption");

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
      console.log("✅ Test PASSED! Ed25519 signature-derived key encryption/decryption works correctly.");
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