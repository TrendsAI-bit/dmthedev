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
  } catch (error) {
    throw new Error('Invalid base64 encoding in encrypted data');
  }
}

function safeEncodeUTF8(bytes: Uint8Array): string {
  try {
    return encodeUTF8(bytes);
  } catch (error) {
    throw new Error('Failed to encode decrypted message as UTF-8');
  }
}

function safeDecodeUTF8(text: string): Uint8Array {
  try {
    return decodeUTF8(text);
  } catch (error) {
    throw new Error('Failed to decode message for encryption');
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

    // Convert message to Uint8Array and encrypt
    const messageBytes = safeDecodeUTF8(message);
    const encrypted = box.after(messageBytes, nonce, sharedKey);

    if (!encrypted) {
      throw new Error('Encryption failed');
    }

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

    // Safely convert decrypted bytes to UTF-8 string
    const decryptedText = safeEncodeUTF8(decrypted);
    console.log('Decryption successful');
    return decryptedText;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
} 