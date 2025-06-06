'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { encryptMessage, decryptMessage, testEncryptionDecryption } from '@/utils/encryption';
import { storeMessage, getMessages, getRecipientKey, type Message } from '@/utils/supabase';
import DecryptedMessage from '@/components/DecryptedMessage';
import KeyDerivation from '@/components/KeyDerivation';
import dynamic from 'next/dynamic';

// Import DecryptedMessage with SSR disabled for compatibility
const DecryptedMessageSSR = dynamic(() => import('@/components/DecryptedMessage'), {
  ssr: false,
  loading: () => (
    <div className="mt-2 p-3 rounded-lg text-sm break-all bg-blue-50 text-blue-800">
      [🔄 Initializing decryption...]
    </div>
  ),
});

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
      setError("Wallet not connected [no-wallet]");
      return;
    }

    if (!recipientAddress.trim()) {
      setError("Please enter a recipient address [missing-recipient]");
      return;
    }

    if (!message.trim()) {
      setError("Please enter a message [empty-message]");
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
        throw new Error(`Recipient ${recipientAddress} has not derived their messaging key yet. They need to visit this app and derive their key first! [no-key]`);
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
      setSuccess(`Message sent to ${recipientAddress}! [rocket]`);
      setMessage('');
      setRecipientAddress('');
      
      // Reload messages
      await loadMessages();
      
    } catch (err: any) {
      console.error("❌ Send message failed:", err);
      setError(err.message || "Failed to send message [error]");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDerived = (derivedKey: string) => {
    setUserDerivedKey(derivedKey);
    console.log("✅ User key derived:", derivedKey);
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b-3 border-black bg-white relative">
        <div className="max-w-7xl mx-auto p-5 flex justify-between items-center">
          <div className="text-3xl font-bold -rotate-1 relative">
            DM the DEV ✎
          </div>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5">
        {/* Stickman */}
        <div className="flex items-center justify-center my-10 gap-8">
          <div className="font-mono text-4xl whitespace-pre -rotate-2">
            {'   o\n  /|\\\n  / \\'}</div>
          <div className="bg-white border-3 border-black rounded-[20px] p-4 max-w-[350px] rotate-1 relative">
            Hey! I'm your ugly but trustworthy DEV mascot! Now with REAL end-to-end encryption! [nerd face]
          </div>
        </div>

        {connected ? (
          <>
            {/* Key Derivation Section */}
            <KeyDerivation onKeyDerived={handleKeyDerived} />
            
            {/* Send Message Section */}
            <section className="section mb-8">
              <h2 className="section-title">[💌] Send Encrypted Message</h2>
              
              <div className="space-y-4">
                <input
                  type="text"
                  className="w-full p-4 border-3 border-black rounded-xl font-comic -rotate-[0.2deg]"
                  placeholder="Enter recipient wallet address..."
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  disabled={isLoading}
                />
                
                <textarea
                  className="w-full p-4 border-3 border-black rounded-xl font-comic resize-y min-h-[120px] bg-white rotate-[0.1deg]"
                  placeholder="Write your encrypted message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isLoading}
                />
                
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !userDerivedKey}
                  className="w-full bg-white border-3 border-black py-4 px-6 font-bold rounded-xl rotate-[0.5deg] hover:animate-bounce-light disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? '⏳ Sending Message...' : '🔐 Send Encrypted Message [send]'}
                </button>
                
                {!userDerivedKey && (
                  <div className="bg-[#fffacd] border-3 border-black rounded-xl p-4 -rotate-1">
                    ⚠️ Please derive your messaging key first before sending messages! [warning]
                  </div>
                )}
              </div>
            </section>

            {/* Status Messages */}
            {error && (
              <div className="mb-5 bg-[#ffe6e6] border-3 border-black rounded-xl p-5 -rotate-1">
                <div className="font-bold text-red-600">❌ {error}</div>
              </div>
            )}
            
            {success && (
              <div className="mb-5 bg-[#e6ffe6] border-3 border-black rounded-xl p-5 rotate-1">
                <div className="font-bold text-green-600">✅ {success}</div>
              </div>
            )}

            {/* Messages Section */}
            <section className="section mt-8">
              <h2 className="section-title">[📬] Your Messages</h2>
              
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8 font-comic -rotate-[0.3deg]">
                  No messages found. Share your address with others to receive encrypted messages! [mailbox]
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, index) => (
                    <div 
                      key={msg.id} 
                      className={`border-3 border-black rounded-xl p-4 bg-white ${
                        index % 2 === 0 ? 'rotate-[0.5deg]' : '-rotate-[0.3deg]'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold">
                          {msg.sender_address === publicKey?.toBase58() ? (
                            <span className="text-blue-700">📤 Sent to: {msg.recipient_address.slice(0, 4)}...{msg.recipient_address.slice(-4)}</span>
                          ) : (
                            <span className="text-green-700">📥 From: {msg.sender_address.slice(0, 4)}...{msg.sender_address.slice(-4)}</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 font-comic">
                          {new Date(msg.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      
                      {msg.recipient_address === publicKey?.toBase58() ? (
                        <DecryptedMessageSSR
                          encryptedData={{
                            ciphertext: msg.ciphertext,
                            nonce: msg.nonce,
                            ephemeralPublicKey: msg.ephemeral_public_key,
                          }}
                          wallet={wallet}
                        />
                      ) : (
                        <div className="text-sm text-gray-600 font-comic">
                          🔐 Encrypted message (sent by you) [lock]
                          <div className="mt-2 p-2 bg-gray-100 border-2 border-gray-300 rounded text-xs font-mono break-all">
                            {msg.ciphertext.slice(0, 100)}...
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="text-center py-12">
            <div className="bg-white border-3 border-black rounded-xl p-8 rotate-1">
              <h2 className="text-2xl font-bold mb-4 font-comic">
                Welcome to DM the DEV! [wave]
              </h2>
              <p className="text-gray-600 mb-6 font-comic -rotate-[0.2deg]">
                Connect your Solana wallet to start sending end-to-end encrypted messages
              </p>
              <div className="space-y-4 text-sm text-gray-500 font-comic">
                <p className="rotate-[0.3deg]">🔐 <strong>Secure:</strong> Messages are encrypted with your wallet signature</p>
                <p className="-rotate-[0.2deg]">🏗️ <strong>Decentralized:</strong> Built on Solana blockchain infrastructure</p>
                <p className="rotate-[0.1deg]">🔑 <strong>Private:</strong> Only you and the recipient can read the messages</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center py-10 border-t-3 border-black mt-15 bg-white">
        <div className="-rotate-[0.5deg] font-comic">
          Yes, the dev is still ugly. But your messages are now ACTUALLY safe! 🛡️
          <br /><small>Built with ❤️, terrible drawing skills, and proper cryptography</small>
        </div>
      </footer>
    </main>
  );
} 