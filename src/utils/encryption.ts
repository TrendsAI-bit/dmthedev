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
    return '[❌ Empty data]';
  }

  try {
    // Attempt UTF-8 decoding
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!text) {
      throw new Error('Empty text after decoding');
    }
    return text;
  } catch (e) {
    console.warn('⚠️ UTF-8 decode failed:', e);
    // Convert to base64 for safe preview
    try {
      const base64 = encodeBase64(bytes.slice(0, 24));
      return `[⚠️ Binary data (${bytes.length} bytes): ${base64}...]`;
    } catch (e2) {
      console.error('Base64 encoding failed:', e2);
      return '[❌ Invalid binary data]';
    }
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

    // Encode message as UTF-8
    const messageBytes = new TextEncoder().encode(message);
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

export async function decryptMessage(
  encryptedData: EncryptedData,
  wallet: any,
  recipientAddress: string
): Promise<string> {
  try {
    console.log('Starting decryption...');
    validateEncryptedData(encryptedData);

    // Get signature from wallet
    const message = new TextEncoder().encode(
      `Sign to decrypt messages on DM the DEV\nWallet: ${recipientAddress}`
    );
    
    const signature = await wallet.signMessage(message);
    const signatureBytes = signature instanceof Uint8Array ? signature : bs58.decode(signature);
    
    // Derive secret key
    const hash = sha512(signatureBytes);
    const secretKey = new Uint8Array(hash.slice(0, box.secretKeyLength));

    // Decode base64 components
    const ciphertext = decodeBase64(encryptedData.ciphertext);
    const nonce = decodeBase64(encryptedData.nonce);
    const ephemeralPublicKey = decodeBase64(encryptedData.ephemeralPublicKey);

    // Generate shared key
    const sharedKey = box.before(ephemeralPublicKey, secretKey);

    // Decrypt
    const decrypted = box.after(ciphertext, nonce, sharedKey);
    if (!decrypted) {
      throw new Error('Decryption failed');
    }

    // Safely decode to string
    return safelyDecodeBytes(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return `[❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
} 