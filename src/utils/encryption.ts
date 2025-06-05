import { box, randomBytes } from 'tweetnacl'
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util'

export async function encrypt(message: string, recipientPublicKey: string): Promise<string> {
  const ephemeralKeyPair = box.keyPair()
  const recipientPubKey = decodeBase64(recipientPublicKey)
  const messageUint8 = decodeUTF8(message)
  const nonce = randomBytes(box.nonceLength)
  
  const encryptedMessage = box(
    messageUint8,
    nonce,
    recipientPubKey,
    ephemeralKeyPair.secretKey
  )

  const fullMessage = new Uint8Array(nonce.length + encryptedMessage.length)
  fullMessage.set(nonce)
  fullMessage.set(encryptedMessage, nonce.length)

  return encodeBase64(fullMessage)
}

export async function decrypt(encryptedMessage: string, secretKey: string): Promise<string> {
  const messageWithNonceAsUint8Array = decodeBase64(encryptedMessage)
  const nonce = messageWithNonceAsUint8Array.slice(0, box.nonceLength)
  const message = messageWithNonceAsUint8Array.slice(box.nonceLength)
  const senderPubKey = messageWithNonceAsUint8Array.slice(
    box.nonceLength + box.publicKeyLength,
    box.nonceLength + box.publicKeyLength * 2
  )
  
  const decrypted = box.open(
    message,
    nonce,
    senderPubKey,
    decodeBase64(secretKey)
  )

  if (!decrypted) {
    throw new Error('Could not decrypt message')
  }

  return encodeUTF8(decrypted)
} 