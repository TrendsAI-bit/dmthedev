import { box, randomBytes } from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

export function encryptMessage(message: string, recipientPublicKeyB58: string): EncryptedData {
  try {
    console.log('Encrypting message for:', recipientPublicKeyB58);
    
    // Convert base58 public key to Uint8Array
    const recipientPublicKey = new PublicKey(recipientPublicKeyB58).toBytes();
    console.log('Recipient public key (bytes):', recipientPublicKey);

    // Generate ephemeral keypair and nonce
    const ephemeralKeyPair = box.keyPair();
    const nonce = randomBytes(box.nonceLength);
    console.log('Generated nonce:', nonce);
    console.log('Ephemeral public key:', ephemeralKeyPair.publicKey);

    // Encrypt the message
    const messageUint8 = decodeUTF8(message);
    const encryptedMessage = box(
      messageUint8,
      nonce,
      recipientPublicKey,
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

    console.log('Encryption successful:', result);
    return result;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

export async function signForDecryption(wallet: any, recipientAddress: string): Promise<Uint8Array | null> {
  try {
    if (!wallet.signMessage) {
      throw new Error('Wallet does not support message signing');
    }

    // Create a unique message for this decryption
    const message = new TextEncoder().encode(
      `Decrypt message for ${recipientAddress}`
    );

    console.log('Requesting signature from wallet...');
    // Use Phantom's specific signing method
    const signature = await (wallet.signMessage as any)(message, 'utf8');
    console.log('Got signature:', signature);
    
    // Use the first 32 bytes of the signature as the secret key
    const secretKey = new Uint8Array(signature.slice(0, 32));
    console.log('Derived secret key:', secretKey);

    return secretKey;
  } catch (error) {
    console.error('Failed to sign message:', error);
    return null;
  }
}

export async function decryptMessage(
  encryptedData: EncryptedData,
  wallet: any,
  recipientAddress: string
): Promise<string | null> {
  try {
    console.log('Starting decryption for recipient:', recipientAddress);
    console.log('Encrypted data:', encryptedData);

    // Get secret key from wallet signature
    const secretKey = await signForDecryption(wallet, recipientAddress);
    if (!secretKey) {
      throw new Error('Failed to get decryption key');
    }

    const ciphertext = decodeBase64(encryptedData.ciphertext);
    const nonce = decodeBase64(encryptedData.nonce);
    const ephemeralPublicKey = decodeBase64(encryptedData.ephemeralPublicKey);

    console.log('Decoding successful');
    console.log('Ciphertext length:', ciphertext.length);
    console.log('Nonce length:', nonce.length);
    console.log('Ephemeral public key length:', ephemeralPublicKey.length);

    const decrypted = box.open(
      ciphertext,
      nonce,
      ephemeralPublicKey,
      secretKey
    );

    if (!decrypted) {
      console.error('Decryption returned null');
      throw new Error('Failed to decrypt message');
    }

    const result = encodeUTF8(decrypted);
    console.log('Decryption successful');
    return result;
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
} 