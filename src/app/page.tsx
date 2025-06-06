'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { encryptMessage, decryptMessage, testEncryptionDecryption } from '@/utils/encryption';
import { storeMessage, getMessages, getRecipientKey, type Message } from '@/utils/supabase';
import DecryptedMessage from '@/components/DecryptedMessage';
import KeyDerivation from '@/components/KeyDerivation';

export default function Home() {
  const { wallet, connected, publicKey } = useWallet();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userDerivedKey, setUserDerivedKey] = useState<string | null>(null);

  // Load messages when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      loadMessages();
      // Run test on connect
      testEncryptionDecryption();
    }
  }, [connected, publicKey]);

  const loadMessages = async () => {
    if (!publicKey) return;
    
    try {
      const walletAddress = publicKey.toBase58();
      const { data, error } = await getMessages(walletAddress);
      
      if (error) {
        console.error("Error loading messages:", error);
        return;
      }
      
      setMessages(data);
    } catch (err) {
      console.error("Exception loading messages:", err);
    }
  };

  const handleSendMessage = async () => {
    if (!wallet || !connected || !publicKey) {
      setError("Wallet not connected");
      return;
    }

    if (!recipientAddress.trim()) {
      setError("Please enter a recipient address");
      return;
    }

    if (!message.trim()) {
      setError("Please enter a message");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log("🔍 Step 1: Looking up recipient's derived public key...");
      
      // Step 1: Get recipient's derived public key from Supabase
      const { data: recipientKeyData, error: keyError } = await getRecipientKey(recipientAddress);
      
      if (keyError) {
        throw new Error(`Failed to lookup recipient key: ${keyError.message}`);
      }
      
      if (!recipientKeyData) {
        throw new Error(`Recipient ${recipientAddress} has not derived their messaging key yet. They need to visit this app and derive their key first.`);
      }
      
      console.log("✅ Found recipient's derived public key:", recipientKeyData.derived_pubkey);
      
      // Step 2: Encrypt message using recipient's derived public key
      console.log("🔐 Step 2: Encrypting message...");
      const encrypted = encryptMessage(message, recipientKeyData.derived_pubkey);
      console.log("✅ Message encrypted successfully");
      
      // Step 3: Store encrypted message in Supabase
      console.log("💾 Step 3: Storing encrypted message...");
      const senderAddress = publicKey.toBase58();
      const { error: storeError } = await storeMessage(
        senderAddress,
        recipientAddress,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.ephemeralPublicKey
      );
      
      if (storeError) {
        throw new Error(`Failed to store message: ${storeError.message}`);
      }
      
      console.log("✅ Message sent successfully!");
      setSuccess(`Message sent to ${recipientAddress}!`);
      setMessage('');
      setRecipientAddress('');
      
      // Reload messages
      await loadMessages();
      
    } catch (err: any) {
      console.error("❌ Send message failed:", err);
      setError(err.message || "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDerived = (derivedKey: string) => {
    setUserDerivedKey(derivedKey);
    console.log("✅ User key derived:", derivedKey);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🔐 DM the DEV
          </h1>
          <p className="text-lg text-gray-600">
            End-to-end encrypted messaging on Solana
          </p>
          <div className="mt-4">
            <WalletMultiButton />
          </div>
        </div>

        {connected ? (
          <div className="space-y-6">
            {/* Key Derivation Section */}
            <KeyDerivation onKeyDerived={handleKeyDerived} />
            
            {/* Send Message Section */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                📤 Send Encrypted Message
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recipient Wallet Address
                  </label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="Enter Solana wallet address..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Enter your encrypted message..."
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                </div>
                
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !userDerivedKey}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Sending..." : "🔐 Send Encrypted Message"}
                </button>
                
                {!userDerivedKey && (
                  <p className="text-sm text-yellow-600">
                    ⚠️ Please derive your messaging key first before sending messages
                  </p>
                )}
              </div>
            </div>

            {/* Status Messages */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700">❌ {error}</p>
              </div>
            )}
            
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-700">✅ {success}</p>
              </div>
            )}

            {/* Messages Section */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                📬 Your Messages
              </h2>
              
              {messages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No messages yet. Send your first encrypted message!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`border rounded-lg p-4 ${
                        msg.sender_address === publicKey?.toBase58()
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm text-gray-600">
                          {msg.sender_address === publicKey?.toBase58() ? (
                            <span className="font-medium text-blue-700">📤 Sent to:</span>
                          ) : (
                            <span className="font-medium text-green-700">📥 From:</span>
                          )}
                          <span className="ml-2 font-mono text-xs">
                            {msg.sender_address === publicKey?.toBase58()
                              ? msg.recipient_address
                              : msg.sender_address}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      
                      {msg.recipient_address === publicKey?.toBase58() ? (
                        <DecryptedMessage
                          encryptedData={{
                            ciphertext: msg.ciphertext,
                            nonce: msg.nonce,
                            ephemeralPublicKey: msg.ephemeral_public_key,
                          }}
                          wallet={wallet}
                        />
                      ) : (
                        <div className="text-sm text-gray-600">
                          <p>🔐 Encrypted message (sent by you)</p>
                          <div className="mt-2 p-2 bg-white border rounded text-xs font-mono break-all">
                            {msg.ciphertext.slice(0, 100)}...
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="bg-white border border-gray-200 rounded-lg p-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Welcome to DM the DEV
              </h2>
              <p className="text-gray-600 mb-6">
                Connect your Solana wallet to start sending end-to-end encrypted messages
              </p>
              <div className="space-y-4 text-sm text-gray-500">
                <p>🔐 <strong>Secure:</strong> Messages are encrypted with your wallet signature</p>
                <p>🏗️ <strong>Decentralized:</strong> Built on Solana blockchain infrastructure</p>
                <p>🔑 <strong>Private:</strong> Only you and the recipient can read the messages</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 