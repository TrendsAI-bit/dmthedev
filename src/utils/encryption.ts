import { box, randomBytes } from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { sha512 } from '@noble/hashes/sha512';

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

// Message format version for future compatibility
const MESSAGE_VERSION = 1;

function isValidUTF8(bytes: Uint8Array): boolean {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function concatenateUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function findValidUTF8Sequence(bytes: Uint8Array): Uint8Array | null {
  // Try different offsets and lengths to find a valid UTF-8 sequence
  for (let start = 0; start < bytes.length; start++) {
    for (let end = bytes.length; end > start; end--) {
      const slice = bytes.slice(start, end);
      if (isValidUTF8(slice) && slice.length > 0) {
        return slice;
      }
    }
  }
  return null;
}

function safeEncodeUTF8(text: string): Uint8Array {
  try {
    // First encode the text as UTF-8
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(text);
    
    // Add version byte to the beginning of the message
    const versionByte = new Uint8Array([MESSAGE_VERSION]);
    
    // Add length bytes (4 bytes, big-endian)
    const lengthBytes = new Uint8Array(4);
    const length = messageBytes.length;
    lengthBytes[0] = (length >> 24) & 0xFF;
    lengthBytes[1] = (length >> 16) & 0xFF;
    lengthBytes[2] = (length >> 8) & 0xFF;
    lengthBytes[3] = length & 0xFF;
    
    return concatenateUint8Arrays(versionByte, lengthBytes, messageBytes);
  } catch (error) {
    console.error('UTF-8 encoding error:', error);
    throw new Error('Failed to encode message for encryption');
  }
}

function tryDecodeMessage(bytes: Uint8Array): string {
  console.log('Attempting to decode bytes:', bytesToHex(bytes));

  // Helper function to extract message content
  function extractMessage(data: Uint8Array): Uint8Array {
    // Check version byte
    if (data[0] !== MESSAGE_VERSION) {
      throw new Error('Invalid message version');
    }
    
    // Extract length from bytes 1-4 (big-endian)
    const length = (data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4];
    
    // Validate length
    if (length <= 0 || length > data.length - 5) {
      throw new Error('Invalid message length');
    }
    
    // Extract message content
    return data.slice(5, 5 + length);
  }

  try {
    // Try to extract and decode the message
    const messageContent = extractMessage(bytes);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const text = decoder.decode(messageContent);
    console.log('Successfully decoded message:', text);
    return text;
  } catch (error) {
    console.log('Standard decoding failed:', error);
    
    // Fallback: try to find any valid UTF-8 sequence
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const text = decoder.decode(bytes).trim();
      if (text && text.length > 0) {
        console.log('Fallback decoding succeeded:', text);
        return text;
      }
    } catch (error) {
      console.log('Fallback decoding failed:', error);
    }
    
    // Last resort: show hex representation
    const hexString = bytesToHex(bytes);
    console.log('Falling back to hex representation:', hexString);
    return `[Encrypted data: ${hexString}]`;
  }
}

function validateEncryptedData(data: EncryptedData): void {
  try {
    const ciphertext = decodeBase64(data.ciphertext);
    const nonce = decodeBase64(data.nonce);
    const ephemeralPublicKey = decodeBase64(data.ephemeralPublicKey);

    if (nonce.length !== box.nonceLength) {
      throw new Error(`Invalid nonce length: ${nonce.length}, expected ${box.nonceLength}`);
    }
    if (ephemeralPublicKey.length !== box.publicKeyLength) {
      throw new Error(`Invalid public key length: ${ephemeralPublicKey.length}, expected ${box.publicKeyLength}`);
    }

    console.log('Validated encrypted data:');
    console.log('Ciphertext (hex):', bytesToHex(ciphertext));
    console.log('Nonce (hex):', bytesToHex(nonce));
    console.log('Ephemeral Public Key (hex):', bytesToHex(ephemeralPublicKey));
  } catch (error) {
    console.error('Validation error:', error);
    throw new Error('Invalid base64 encoding in encrypted data');
  }
}

export function encryptMessage(message: string, recipientPublicKeyB58: string): EncryptedData {
  try {
    // Convert recipient's public key from Base58 to Uint8Array
    const recipientPublicKey = bs58.decode(recipientPublicKeyB58);
    if (recipientPublicKey.length !== box.publicKeyLength) {
      throw new Error(`Invalid recipient public key length: ${recipientPublicKey.length}`);
    }

    // Generate ephemeral keypair for this message
    const ephemeralKeypair = box.keyPair();

    // Generate random nonce
    const nonce = randomBytes(box.nonceLength);

    // Generate shared key using box.before()
    const sharedKey = box.before(recipientPublicKey, ephemeralKeypair.secretKey);

    // Convert message to Uint8Array with version byte
    const messageBytes = safeEncodeUTF8(message);
    console.log('Original message bytes with version (hex):', bytesToHex(messageBytes));

    const encrypted = box.after(messageBytes, nonce, sharedKey);
    if (!encrypted) {
      throw new Error('Encryption failed');
    }

    console.log('Encrypted bytes (hex):', bytesToHex(encrypted));

    const result = {
      ciphertext: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
      ephemeralPublicKey: encodeBase64(ephemeralKeypair.publicKey)
    };

    // Validate the encrypted data
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
    console.log('Starting decryption process...');
    
    // Validate the encrypted data format
    validateEncryptedData(encryptedData);

    // Create a fixed message to sign
    const message = new TextEncoder().encode(
      `Sign to decrypt messages on DM the DEV\nWallet: ${recipientAddress}`
    );

    console.log('Requesting signature from wallet...');
    
    // Get signature from wallet
    const signature = await wallet.signMessage(message);
    
    // Convert signature to Uint8Array if it's not already
    const signatureBytes = signature instanceof Uint8Array ? signature : bs58.decode(signature);
    
    // Use SHA-512 to derive a consistent key from the signature
    const hash = sha512(signatureBytes);
    const secretKey = new Uint8Array(hash.slice(0, box.secretKeyLength));

    // Decode the encrypted data
    const ciphertext = decodeBase64(encryptedData.ciphertext);
    const nonce = decodeBase64(encryptedData.nonce);
    const ephemeralPublicKey = decodeBase64(encryptedData.ephemeralPublicKey);

    // Generate shared key using box.before()
    const sharedKey = box.before(ephemeralPublicKey, secretKey);

    console.log('Decryption attempt with:');
    console.log('Ciphertext length:', ciphertext.length);
    console.log('Nonce length:', nonce.length);
    console.log('Ephemeral public key length:', ephemeralPublicKey.length);
    console.log('Secret key length:', secretKey.length);
    console.log('Shared key length:', sharedKey.length);

    // Attempt decryption using box.after()
    const decrypted = box.after(ciphertext, nonce, sharedKey);
    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted message');
    }

    console.log('Decrypted bytes (hex):', bytesToHex(decrypted));

    // Try multiple decoding strategies
    const decryptedText = tryDecodeMessage(decrypted);
    console.log('Decryption successful');
    return decryptedText;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
} 