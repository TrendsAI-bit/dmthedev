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
  return btoa(String.fromCharCode.apply(null, Array.from(data)));
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert base64 to base58 for Phantom
function base64toBase58(base64: string): string {
    const uint8array = fromBase64(base64);
    return bs58.encode(uint8array);
}

// Helper to convert base58 to Uint8Array for Phantom
function base58toUint8Array(base58String: string): Uint8Array {
    return bs58.decode(base58String);
}

export async function encryptMessage(message: string, recipientPublicKey: string): Promise<EncryptedData> {
  try {
    console.log("Starting v2 encryption process");
    
    if (!message) throw new Error("Message cannot be empty");
    if (!recipientPublicKey) throw new Error("Recipient public key is required");

    // Wrap the message in a versioned JSON object for robustness.
    const messageToEncrypt = JSON.stringify({
      v: 2,
      data: message,
    });

    const messageBytes = new TextEncoder().encode(messageToEncrypt);
    const encrypted = await performEncryption(messageBytes, recipientPublicKey);
    
    const result = {
      ciphertext: toBase64(encrypted.ciphertext),
      nonce: toBase64(encrypted.nonce),
      ephemeralPublicKey: toBase64(encrypted.ephemeralPublicKey)
    };

    if (!isBase64(result.ciphertext) || !isBase64(result.nonce) || !isBase64(result.ephemeralPublicKey)) {
      throw new Error("Invalid base64 encoding in encryption result");
    }

    console.log("✅ v2 Encryption completed successfully");
    return result;
  } catch (error) {
    console.error("Encryption failed:", error);
    throw error;
  }
}

/**
 * Decrypts a message using Phantom's x25519_decrypt method.
 * This is the correct, secure way to decrypt with Phantom.
 * @param encryptedData The encrypted data object.
 * @param walletAdapter The wallet adapter instance from useWallet().wallet.adapter.
 */
export async function decryptMessage(
  encryptedData: EncryptedData, 
  walletAdapter: any
): Promise<Uint8Array> {
  try {
    console.log(`Starting decryption for wallet: ${walletAdapter.name}`);

    if (!walletAdapter.connected) {
      throw new Error("Wallet is not connected.");
    }

    if (walletAdapter.name !== 'Phantom') {
      throw new Error(`Decryption is not supported for ${walletAdapter.name} yet. Only Phantom is supported.`);
    }

    // Access the provider directly from the window object. This is more robust
    // than relying on private properties of the adapter, which was causing errors.
    const provider = (window as any).phantom?.solana;

    if (!provider || !provider.isPhantom) {
      throw new Error("Phantom wallet provider not found. Please ensure your wallet is unlocked and connected.");
    }
    
    if (!provider.request) {
        throw new Error("The wallet's provider does not support the `request` method.");
    }
    
    // Phantom's x25519_decrypt method requires the data to be base58 encoded.
    const payload = {
      nonce: base64toBase58(encryptedData.nonce),
      publicKey: base64toBase58(encryptedData.ephemeralPublicKey),
      encryptedMessage: base64toBase58(encryptedData.ciphertext),
    };

    console.log("Requesting decryption from Phantom provider via window object...");
    
    const decryptedResponse = await provider.request({
      method: "x25519_decrypt",
      params: payload
    });

    // The result from Phantom is a base58 encoded string.
    const decryptedMessageBase58 = decryptedResponse.decryptedMessage;
    if (!decryptedMessageBase58) {
      throw new Error("Decryption with Phantom failed. The result was empty.");
    }

    const decryptedBytes = base58toUint8Array(decryptedMessageBase58);

    console.log("✅ Phantom wallet decryption successful via window provider");
    return decryptedBytes;
    
  } catch (error) {
    console.error("Phantom wallet decryption failed:", error);
    throw error;
  }
}

async function performEncryption(messageBytes: Uint8Array, recipientPublicKeyB58: string) {
  // Convert recipient's public key from Base58
  const recipientPublicKey = bs58.decode(recipientPublicKeyB58);
  if (recipientPublicKey.length !== box.publicKeyLength) {
    throw new Error('Invalid recipient public key length');
  }

  // Generate ephemeral keypair
  const ephemeralKeypair = box.keyPair();

  // Generate nonce
  const nonce = randomBytes(box.nonceLength);
  
  // Generate shared key
  const sharedKey = box.before(recipientPublicKey, ephemeralKeypair.secretKey);

  // Encrypt the message
  const ciphertext = box.after(messageBytes, nonce, sharedKey);
  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    ciphertext,
    nonce,
    ephemeralPublicKey: ephemeralKeypair.publicKey
  };
} 