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

// Update the encryptMessage function to use versioning
export function encryptMessage(message: string, recipientPublicKeyB58: string): EncryptedData {
  try {
    console.log('Encrypting message...');

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

    // Encode message with version
    const messageBytes = encodeMessageWithVersion(message);
    console.log('Message length:', messageBytes.length);

    // Encrypt the message
    const encrypted = box.after(messageBytes, nonce, sharedKey);
    if (!encrypted) {
      throw new Error('Encryption failed');
    }
    console.log('Encrypted length:', encrypted.length);

    // Encode all binary data as base64
    const result = {
      ciphertext: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
      ephemeralPublicKey: encodeBase64(ephemeralKeypair.publicKey)
    };

    validateEncryptedData(result);
    return result;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

function safeDecodeMessage(decrypted: Uint8Array): string {
  if (!decrypted || decrypted.length === 0) {
    return '[Empty message]';
  }

  // First check if it's binary data
  let isBinary = false;
  for (let i = 0; i < Math.min(decrypted.length, 100); i++) {
    if (decrypted[i] < 9 || (decrypted[i] > 13 && decrypted[i] < 32) || decrypted[i] > 126) {
      isBinary = true;
      break;
    }
  }

  // If it's binary, return base64 immediately
  if (isBinary) {
    const base64 = encodeBase64(decrypted);
    return `[Binary data] ${decrypted.length} bytes\nPreview: ${base64.slice(0, 32)}...`;
  }

  try {
    // Attempt UTF-8 decoding
    const text = new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
    
    // Check if it's JSON
    try {
      const json = JSON.parse(text);
      if (typeof json === 'object') {
        // Format JSON nicely
        return JSON.stringify(json, null, 2);
      }
    } catch {
      // Not JSON, just return the text
    }
    
    return text;
  } catch (e) {
    // If UTF-8 decoding fails, return a safe string
    const base64 = encodeBase64(decrypted);
    return `[Encoded data] ${decrypted.length} bytes\nBase64: ${base64.slice(0, 32)}...`;
  }
}

export async function decryptMessage(
  encryptedData: EncryptedData,
  wallet: any,
  recipientAddress: string
): Promise<string> {
  try {
    console.log('Starting decryption...');

    validateEncryptedData(encryptedData);
    console.log('✅ Validated encrypted data format');

    // Get signature from wallet
    const message = new TextEncoder().encode(
      `Sign to decrypt messages on DM the DEV\nWallet: ${recipientAddress}`
    );
    
    const signature = await wallet.signMessage(message);
    const signatureBytes = signature instanceof Uint8Array ? signature : bs58.decode(signature);
    console.log('✅ Got wallet signature');
    
    // Derive secret key
    const hash = sha512(signatureBytes);
    const secretKey = new Uint8Array(hash.slice(0, box.secretKeyLength));
    console.log('✅ Derived secret key');

    // Decode base64 components
    const ciphertext = decodeBase64(encryptedData.ciphertext);
    const nonce = decodeBase64(encryptedData.nonce);
    const ephemeralPublicKey = decodeBase64(encryptedData.ephemeralPublicKey);
    console.log('✅ Decoded base64 components');

    // Generate shared key
    const sharedKey = box.before(ephemeralPublicKey, secretKey);
    console.log('✅ Generated shared key');

    // Decrypt
    const decrypted = box.after(ciphertext, nonce, sharedKey);
    if (!decrypted) {
      return '[❌ Decryption failed]';
    }
    console.log('✅ Decryption successful');

    // Convert to safe string immediately
    const result = safeDecodeMessage(decrypted);
    console.log('Message type:', result.startsWith('[Binary data]') ? 'binary' : 'text');
    return result;
  } catch (error) {
    console.error('Decryption failed:', error);
    return `[❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
} 