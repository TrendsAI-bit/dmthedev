import { box, randomBytes } from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { sha256 } from '@noble/hashes/sha256';

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

function generateDeterministicKeyPair(seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
  // Use the first 32 bytes of the seed for the secret key
  const secretKey = sha256(seed);
  const keyPair = box.keyPair.fromSecretKey(new Uint8Array(secretKey));
  return keyPair;
}

export function encryptMessage(message: string, recipientPublicKeyB58: string): EncryptedData {
  try {
    // Generate ephemeral keypair
    const ephemeralKeyPair = box.keyPair();
    const nonce = randomBytes(box.nonceLength);

    // Convert recipient public key from base58 to Uint8Array
    const recipientPubKey = bs58.decode(recipientPublicKeyB58);

    // Encrypt the message
    const messageUint8 = decodeUTF8(message);
    const encrypted = box(
      messageUint8,
      nonce,
      recipientPubKey,
      ephemeralKeyPair.secretKey
    );

    if (!encrypted) {
      throw new Error('Encryption failed');
    }

    // Return base64 encoded values
    return {
      ciphertext: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
      ephemeralPublicKey: encodeBase64(ephemeralKeyPair.publicKey)
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
      `DM the DEV: Sign to decrypt messages\nWallet: ${recipientAddress}`
    );

    console.log('Requesting signature from wallet...');
    
    // Get signature from wallet
    const signature = await wallet.signMessage(message);
    const signatureBytes = signature instanceof Uint8Array ? signature : bs58.decode(signature);

    // Generate deterministic keypair from signature
    const keyPair = generateDeterministicKeyPair(signatureBytes);
    console.log('Generated key pair successfully');
    
    return keyPair.secretKey;
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
    const secretKey = await signForDecryption(wallet, recipientAddress);
    
    // Decode the encrypted data
    const ciphertext = decodeBase64(encryptedData.ciphertext);
    const nonce = decodeBase64(encryptedData.nonce);
    const ephemeralPublicKey = decodeBase64(encryptedData.ephemeralPublicKey);

    // Validate lengths
    if (nonce.length !== box.nonceLength) {
      throw new Error('Invalid nonce length');
    }
    if (secretKey.length !== box.secretKeyLength) {
      throw new Error('Invalid secret key length');
    }
    if (ephemeralPublicKey.length !== box.publicKeyLength) {
      throw new Error('Invalid public key length');
    }

    console.log('Decryption attempt with:');
    console.log('Ciphertext length:', ciphertext.length);
    console.log('Nonce length:', nonce.length);
    console.log('Ephemeral public key length:', ephemeralPublicKey.length);
    console.log('Secret key length:', secretKey.length);

    // Try decryption
    const decrypted = box.open(
      ciphertext,
      nonce,
      ephemeralPublicKey,
      secretKey
    );

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