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

function tryDecodeMessage(bytes: Uint8Array): string {
  console.log('Attempting to decode bytes:', bytesToHex(bytes));

  // Helper function to remove padding and version bytes
  function cleanupBytes(data: Uint8Array): Uint8Array {
    // Skip version byte if present
    let start = data[0] === MESSAGE_VERSION ? 1 : 0;
    
    // Find the end of actual data (before padding)
    let end = data.length;
    while (end > start && (data[end - 1] === 0 || data[end - 1] === 0x80)) {
      end--;
    }
    
    return data.slice(start, end);
  }

  try {
    // Clean up the bytes first
    const cleaned = cleanupBytes(bytes);
    console.log('Cleaned bytes:', bytesToHex(cleaned));

    // Try decoding as UTF-8 with BOM handling
    try {
      // Check for UTF-8 BOM
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const hasBOM = cleaned.length >= 3 && 
        cleaned[0] === bom[0] && 
        cleaned[1] === bom[1] && 
        cleaned[2] === bom[2];
      
      const textBytes = hasBOM ? cleaned.slice(3) : cleaned;
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(textBytes);
      if (decoded && decoded.length > 0 && decoded.trim() !== '') {
        console.log('Successfully decoded as UTF-8:', decoded);
        return decoded;
      }
    } catch (e) {
      console.log('UTF-8 decoding failed:', e);
    }

    // Try decoding as ASCII
    try {
      const ascii = Array.from(cleaned)
        .map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '')
        .join('')
        .trim();
      if (ascii && ascii.length > 0) {
        console.log('Successfully decoded as ASCII:', ascii);
        return ascii;
      }
    } catch (e) {
      console.log('ASCII decoding failed:', e);
    }

    // Try decoding as Latin1
    try {
      const latin1 = Array.from(cleaned)
        .map(b => String.fromCharCode(b))
        .join('');
      if (latin1 && latin1.length > 0 && /^[\x20-\x7E\xA0-\xFF]*$/.test(latin1)) {
        console.log('Successfully decoded as Latin1:', latin1);
        return latin1;
      }
    } catch (e) {
      console.log('Latin1 decoding failed:', e);
    }

    // If all decoding attempts fail, return hex representation
    const hexString = bytesToHex(cleaned);
    console.log('Falling back to hex representation');
    return `[Encrypted data: ${hexString}]`;
  } catch (error) {
    console.error('All decoding attempts failed:', error);
    throw error;
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

function safeEncodeUTF8(text: string): Uint8Array {
  try {
    // Convert the string to UTF-8 bytes
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(text);
    
    // Add version byte to the beginning of the message
    const versionByte = new Uint8Array([MESSAGE_VERSION]);
    const result = concatenateUint8Arrays(versionByte, messageBytes);
    
    console.log('Original text:', text);
    console.log('Encoded bytes:', bytesToHex(result));
    
    return result;
  } catch (error) {
    console.error('UTF-8 encoding error:', error);
    throw new Error('Failed to encode message for encryption');
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