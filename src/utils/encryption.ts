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
    // Check if wallet is connected and supports signing
    if (!wallet || !wallet.signMessage) {
      throw new Error('Wallet does not support message signing');
    }

    // Create a deterministic message for this decryption
    const message = new TextEncoder().encode(
      `Sign this message to decrypt your messages on DM the DEV.\n\nWallet: ${recipientAddress}\nTimestamp: ${Date.now()}`
    );

    console.log('Requesting signature from wallet...');
    
    let signature;
    try {
      // Try Phantom's specific signing method first
      signature = await wallet.signMessage(message);
    } catch (err) {
      console.error('First signing attempt failed:', err);
      // Fallback to alternative signing method
      try {
        signature = await wallet.signMessage(message, 'utf8');
      } catch (err2) {
        console.error('Fallback signing attempt failed:', err2);
        throw new Error('Failed to sign message with wallet');
      }
    }

    if (!signature || signature.length < 32) {
      throw new Error('Invalid signature received from wallet');
    }

    // Convert signature to Uint8Array if it isn't already
    let signatureBytes: Uint8Array;
    if (signature instanceof Uint8Array) {
      signatureBytes = signature;
    } else if (typeof signature === 'string') {
      // Handle base58 encoded signatures
      signatureBytes = bs58.decode(signature);
    } else {
      throw new Error('Unexpected signature format');
    }

    // Use the first 32 bytes of the signature as the secret key
    const secretKey = new Uint8Array(signatureBytes.slice(0, 32));
    console.log('Derived secret key length:', secretKey.length);

    return secretKey;
  } catch (error) {
    console.error('Failed to sign message:', error);
    throw error; // Propagate the error instead of returning null
  }
}

export async function decryptMessage(
  encryptedData: EncryptedData,
  wallet: any,
  recipientAddress: string
): Promise<string | null> {
  try {
    console.log('Starting decryption for recipient:', recipientAddress);
    
    // Input validation
    if (!encryptedData?.ciphertext || !encryptedData?.nonce || !encryptedData?.ephemeralPublicKey) {
      throw new Error('Invalid encrypted data format');
    }

    // Get secret key from wallet signature
    const secretKey = await signForDecryption(wallet, recipientAddress);
    if (!secretKey) {
      throw new Error('Failed to get decryption key');
    }

    const ciphertext = decodeBase64(encryptedData.ciphertext);
    const nonce = decodeBase64(encryptedData.nonce);
    const ephemeralPublicKey = decodeBase64(encryptedData.ephemeralPublicKey);

    // Validate decoded data
    if (nonce.length !== box.nonceLength) {
      throw new Error('Invalid nonce length');
    }

    console.log('Attempting decryption with:');
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
      throw new Error('Failed to decrypt message');
    }

    const result = encodeUTF8(decrypted);
    console.log('Decryption successful');
    return result;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error; // Propagate the error instead of returning null
  }
} 