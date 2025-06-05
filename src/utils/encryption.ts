import { box, randomBytes } from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const pairs = hex.match(/[\dA-F]{2}/gi) || [];
  return new Uint8Array(pairs.map(s => parseInt(s, 16)));
}

export function encryptMessage(message: string, recipientPublicKeyB58: string): EncryptedData {
  try {
    // Generate ephemeral keypair for this message
    const ephemeralKeypair = box.keyPair();
    
    // Convert recipient public key from base58 to Uint8Array
    const recipientPubKey = bs58.decode(recipientPublicKeyB58);

    // Generate shared key using box.before()
    const sharedKey = box.before(recipientPubKey, ephemeralKeypair.secretKey);
    
    // Generate nonce
    const nonce = randomBytes(box.nonceLength);
    
    // Encrypt message using shared key
    const messageUint8 = decodeUTF8(message);
    const encrypted = box.after(messageUint8, nonce, sharedKey);

    if (!encrypted) {
      throw new Error('Encryption failed');
    }

    return {
      ciphertext: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
      ephemeralPublicKey: encodeBase64(ephemeralKeypair.publicKey)
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

export async function signForDecryption(wallet: any, recipientAddress: string): Promise<Uint8Array> {
  try {
    if (!wallet || !wallet.signMessage) {
      throw new Error('Wallet does not support message signing');
    }

    // Create a fixed message to sign
    const message = new TextEncoder().encode(
      `Sign to decrypt messages on DM the DEV\nWallet: ${recipientAddress}`
    );

    console.log('Requesting signature from wallet...');
    
    // Get signature from wallet
    const signature = await wallet.signMessage(message);
    
    // Convert signature to Uint8Array if it's not already
    const signatureBytes = signature instanceof Uint8Array ? signature : bs58.decode(signature);
    
    // Use the signature directly as the secret key
    // Make sure it's exactly 32 bytes
    const secretKey = new Uint8Array(signatureBytes.slice(0, 32));
    
    if (secretKey.length !== box.secretKeyLength) {
      throw new Error('Invalid secret key length');
    }

    return secretKey;
  } catch (error) {
    console.error('Failed to sign message:', error);
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
    
    // Input validation
    if (!encryptedData?.ciphertext || !encryptedData?.nonce || !encryptedData?.ephemeralPublicKey) {
      throw new Error('Invalid encrypted data format');
    }

    // Get secret key from wallet signature
    const recipientSecretKey = await signForDecryption(wallet, recipientAddress);
    
    // Decode the encrypted data
    const ciphertext = decodeBase64(encryptedData.ciphertext);
    const nonce = decodeBase64(encryptedData.nonce);
    const ephemeralPublicKey = decodeBase64(encryptedData.ephemeralPublicKey);

    // Validate lengths
    if (nonce.length !== box.nonceLength) {
      throw new Error('Invalid nonce length');
    }
    if (ephemeralPublicKey.length !== box.publicKeyLength) {
      throw new Error('Invalid public key length');
    }

    console.log('Decryption attempt with:');
    console.log('Ciphertext length:', ciphertext.length);
    console.log('Nonce length:', nonce.length);
    console.log('Ephemeral public key length:', ephemeralPublicKey.length);
    console.log('Secret key length:', recipientSecretKey.length);

    // Generate shared key
    const sharedKey = box.before(ephemeralPublicKey, recipientSecretKey);

    // Decrypt using shared key
    const decrypted = box.open.after(ciphertext, nonce, sharedKey);

    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted message');
    }

    const decryptedText = encodeUTF8(decrypted);
    console.log('Decryption successful');
    return decryptedText;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
} 