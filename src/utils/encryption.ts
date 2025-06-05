import { box, randomBytes, secretbox } from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { sha512 } from '@noble/hashes/sha512';

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

export function encryptMessage(message: string, recipientPublicKeyB58: string): EncryptedData {
  try {
    console.log('Encrypting message for:', recipientPublicKeyB58);
    
    // Generate ephemeral keypair and nonce
    const ephemeralKeyPair = box.keyPair();
    const nonce = randomBytes(box.nonceLength);
    
    // Convert recipient public key
    const recipientPubKey = new PublicKey(recipientPublicKeyB58).toBytes();
    
    // Encrypt the message
    const messageUint8 = decodeUTF8(message);
    const encryptedMessage = box(
      messageUint8,
      nonce,
      recipientPubKey,
      ephemeralKeyPair.secretKey
    );

    if (!encryptedMessage) {
      throw new Error('Encryption failed');
    }

    const result = {
      ciphertext: encodeBase64(encryptedMessage),
      nonce: encodeBase64(nonce),
      ephemeralPublicKey: encodeBase64(ephemeralKeyPair.publicKey)
    };

    return result;
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

    // Create a deterministic message
    const message = new TextEncoder().encode(
      `Sign to decrypt messages on DM the DEV\nWallet: ${recipientAddress}`
    );

    console.log('Requesting signature from wallet...');
    
    let signature: Uint8Array;
    try {
      // Try Phantom's specific signing method
      const sig = await wallet.signMessage(message);
      signature = sig instanceof Uint8Array ? sig : bs58.decode(sig);
    } catch (err) {
      console.error('Signing failed:', err);
      throw new Error('Failed to sign message with wallet');
    }

    // Derive a deterministic key from the signature using SHA-512
    const hashedSignature = sha512(signature);
    const secretKey = hashedSignature.slice(0, 32); // Use first 32 bytes for the key
    
    console.log('Derived secret key length:', secretKey.length);
    return new Uint8Array(secretKey);
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
    console.log('Starting decryption for recipient:', recipientAddress);
    
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

    console.log('Attempting decryption with:');
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

    return encodeUTF8(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
} 