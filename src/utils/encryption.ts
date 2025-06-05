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
    if (ciphertext.length < 5) { // Version byte + minimum message length
      throw new Error('Ciphertext too short');
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

function safeEncodeUTF8(bytes: Uint8Array): string {
  try {
    // Skip the version byte when decoding the message
    const messageBytes = bytes.slice(1);
    
    if (!isValidUTF8(messageBytes)) {
      console.error('Invalid UTF-8 bytes (hex):', bytesToHex(messageBytes));
      throw new Error('Decrypted data is not valid UTF-8');
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(messageBytes);
  } catch (error) {
    console.error('UTF-8 decoding error:', error);
    throw new Error('Failed to decode decrypted message as UTF-8');
  }
}

function safeDecodeUTF8(text: string): Uint8Array {
  try {
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(text);
    
    // Add version byte to the beginning of the message
    const versionByte = new Uint8Array([MESSAGE_VERSION]);
    return concatenateUint8Arrays(versionByte, messageBytes);
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
    const messageBytes = safeDecodeUTF8(message);
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

    // Check version byte
    const version = decrypted[0];
    if (version !== MESSAGE_VERSION) {
      console.error('Invalid message version:', version);
      throw new Error('Unsupported message format version');
    }

    // Safely convert decrypted bytes to UTF-8 string
    const decryptedText = safeEncodeUTF8(decrypted);
    console.log('Decryption successful');
    return decryptedText;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
} 