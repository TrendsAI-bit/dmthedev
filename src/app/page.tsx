'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTokenData } from '@/utils/helius';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { encryptMessage, decryptMessage, EncryptedData, testEncryptionDecryption, deriveKeypairFromWallet } from '@/utils/encryption';
import { uploadMessage, fetchMessagesForDeployer, EncryptedMessage } from '@/utils/supabase';
import dynamic from 'next/dynamic';
import ClientOnly from '@/components/ClientOnly';
import bs58 from 'bs58';

const HELIUS_RPC = process.env.NEXT_PUBLIC_HELIUS_RPC || 'https://mainnet.helius-rpc.com/?api-key=7c8a804a-bb84-4963-b03b-421a5d39c887';

// Import DecryptedMessage with SSR disabled
const DecryptedMessage = dynamic(() => import('@/components/DecryptedMessage'), {
  ssr: false,
  loading: () => (
    <div className="mt-2 p-3 rounded-lg text-sm break-all bg-blue-50 text-blue-800">
      [🔄 Initializing decryption...]
    </div>
  ),
});

export default function Home() {
  const { publicKey, sendTransaction, connected, wallet } = useWallet();
  const [message, setMessage] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [encryptedMessage, setEncryptedMessage] = useState('');
  const [decryptedMessage, setDecryptedMessage] = useState('');
  const [recipientDerivedKey, setRecipientDerivedKey] = useState<string>('');
  const [deployerInfo, setDeployerInfo] = useState<{
    address: string;
    token: string;
    name: string;
    symbol: string;
    error?: string;
    marketCap?: number | null;
    creatorSolBalance?: number | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'decrypt'>('send');
  const [messages, setMessages] = useState<EncryptedMessage[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string>('');

  const handleFindDeployer = async () => {
    if (!tokenAddress) return;
    
    setIsLoading(true);
    try {
      const result = await getTokenData(tokenAddress);
      
      if (result.success && result.creator) {
        setDeployerInfo({
          address: result.creator,
          token: result.name || 'Unknown Token',
          name: result.name || 'Unknown',
          symbol: result.symbol || '???',
          marketCap: result.marketCap,
          creatorSolBalance: result.creatorSolBalance,
        });
      } else {
        setDeployerInfo({
          address: 'Not found',
          token: 'Invalid token',
          name: 'Unknown',
          symbol: '???',
          error: result.error || 'Could not find token information',
        });
      }
    } catch (error) {
      console.error('Error finding deployer:', error);
      setDeployerInfo({
        address: 'Error',
        token: 'Error',
        name: 'Error',
        symbol: '???',
        error: 'Failed to fetch token information',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (withTip: boolean) => {
    if (!message || !publicKey || !deployerInfo?.address || deployerInfo.error) {
      alert('Please connect wallet, enter a message, and find a valid token deployer first!');
      return;
    }

    if (!connected) {
      alert('Please connect your wallet first!');
      return;
    }

    if (!recipientDerivedKey) {
      alert('Please derive the recipient key first! Click "Derive Recipient Key" button.');
      return;
    }

    setIsSending(true);
    try {
      const connection = new Connection(HELIUS_RPC, 'confirmed');
      
      // Check balance if tipping
      if (withTip && parseFloat(tipAmount) > 0) {
        try {
          const balance = await connection.getBalance(publicKey);
          const tipLamports = parseFloat(tipAmount) * LAMPORTS_PER_SOL;
          const fee = 5000; // Estimated transaction fee in lamports
          
          if (balance < tipLamports + fee) {
            alert('Insufficient SOL balance for tip and transaction fee');
            setIsSending(false);
            return;
          }
        } catch (error) {
          console.error('Error checking balance:', error);
          alert('Failed to check wallet balance. Please try again.');
          setIsSending(false);
          return;
        }
      }

      // Step 1: Send tip if requested
      let txSig: string | undefined = undefined;
      if (withTip && parseFloat(tipAmount) > 0) {
        try {
          const transaction = new Transaction();
          
          const transferInstruction = SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(deployerInfo.address),
            lamports: parseFloat(tipAmount) * LAMPORTS_PER_SOL,
          });

          transaction.add(transferInstruction);

          const latestBlockhash = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = latestBlockhash.blockhash;
          transaction.feePayer = publicKey;

          txSig = await sendTransaction(transaction, connection);
          
          // Wait for confirmation
          const confirmation = await connection.confirmTransaction({
            signature: txSig,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          });

          if (confirmation.value.err) {
            throw new Error('Transaction failed to confirm');
          }

        } catch (error) {
          console.error('Transaction failed:', error);
          alert('Failed to send tip. Please try again.');
          setIsSending(false);
          return;
        }
      }

      // Step 2: Encrypt message using derived key
      let encrypted;
      try {
        console.log("Plaintext message being encrypted:", message);
        console.log("Using derived recipient key:", recipientDerivedKey);
        // Use signature-derived key for encryption
        encrypted = encryptMessage(message, recipientDerivedKey);
      } catch (error) {
        console.error('Encryption failed:', error);
        alert('Failed to encrypt message. Please try again.');
        setIsSending(false);
        return;
      }

      // Step 3: Upload to Supabase
      try {
        await uploadMessage({
          senderAddress: publicKey.toBase58(),
          recipientAddress: deployerInfo.address,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          ephemeralPublicKey: encrypted.ephemeralPublicKey,
        });

        // Clear form
        setMessage('');
        setTipAmount('');
        alert('Message sent successfully!');
      } catch (error) {
        console.error('Failed to save message:', error);
        if (txSig) {
          alert('Tip was sent but failed to save message. Please contact support with this transaction ID: ' + txSig);
        } else {
          alert('Failed to save message. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error in send process:', error);
      alert('Failed to process request. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const fetchMessages = useCallback(async () => {
    if (!publicKey) return;
    
    try {
      const fetchedMessages = await fetchMessagesForDeployer(publicKey.toBase58());
      setMessages(fetchedMessages);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  }, [publicKey?.toBase58()]);

  // Fetch messages when wallet connects/disconnects
  useEffect(() => {
    let mounted = true;

    const loadMessages = async () => {
      if (publicKey) {
        try {
          const fetchedMessages = await fetchMessagesForDeployer(publicKey.toBase58());
          if (mounted) {
            setMessages(fetchedMessages);
            // Clear decrypted messages when loading new ones
            setDecryptedMessages({});
          }
        } catch (error) {
          console.error('Failed to fetch messages:', error);
        }
      } else if (mounted) {
        setMessages([]);
        setDecryptedMessages({});
      }
    };

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [publicKey?.toBase58()]);

  // Update the handleDecryptMessage function
  const handleDecryptMessageFromList = useCallback(async (messageId: string) => {
    if (!connected || !publicKey || !wallet) {
      alert('Please connect your wallet first');
      return;
    }

    const messageToDecrypt = messages.find(m => m.id === messageId);
    if (!messageToDecrypt) return;

    setDecryptedMessages(prev => ({ ...prev, [messageId]: 'Decrypting...' }));

    try {
      setDecryptedMessages(prev => ({ ...prev, [messageId]: 'DECRYPT_READY' }));
    } catch (err) {
      console.error('Decryption failed for list item:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setDecryptedMessages(prev => ({ ...prev, [messageId]: `[❌ Decryption failed] ${errorMsg}` }));
    }
  }, [connected, publicKey, wallet, messages]);

  // Decrypts a pasted JSON message
  const handleDecryptPastedMessage = async () => {
    if (!connected || !publicKey || !wallet?.adapter) {
      alert('Please connect your wallet to decrypt messages.');
      return;
    }

    let parsedData: EncryptedData;
    try {
      parsedData = JSON.parse(encryptedMessage);
      if (!parsedData.ciphertext || !parsedData.nonce || !parsedData.ephemeralPublicKey) {
        throw new Error('Invalid encrypted message format.');
      }
    } catch (e) {
      alert('Invalid JSON. Please paste the full encrypted message object.');
      return;
    }

    try {
      // New signature-based decryption approach
      const decryptedUint8Array = await decryptMessage(parsedData, wallet.adapter);
      
      let result: string;
      try {
        const decodedText = new TextDecoder("utf-8", { fatal: true }).decode(decryptedUint8Array);
        try {
          const parsed = JSON.parse(decodedText);
          if (parsed && parsed.v === 2 && typeof parsed.data === 'string') {
            result = parsed.data;
          } else {
            result = decodedText;
          }
        } catch (e) {
          result = decodedText;
        }
      } catch (e) {
        const B64_CHUNK_SIZE = 8192;
        let base64 = "";
        for (let i = 0; i < decryptedUint8Array.length; i += B64_CHUNK_SIZE) {
            base64 += String.fromCharCode.apply(
                null,
                Array.from(decryptedUint8Array.subarray(i, i + B64_CHUNK_SIZE))
            );
        }
        result = `[Raw Binary Data]\n${btoa(base64)}`;
      }
      setDecryptedMessage(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setDecryptedMessage(`[❌ Decryption failed] ${errorMsg}`);
    }
  };

  const runEncryptionTest = async () => {
    setTestResult('Running test...');
    try {
      const success = await testEncryptionDecryption();
      setTestResult(success ? '✅ Test passed! Encryption/decryption works correctly.' : '❌ Test failed! Check console for details.');
    } catch (error) {
      setTestResult(`❌ Test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const deriveRecipientKey = async () => {
    if (!connected || !wallet?.adapter) {
      alert('Please connect your wallet first!');
      return;
    }

    if (!deployerInfo?.address || deployerInfo.error) {
      alert('Please find a valid token deployer first!');
      return;
    }

    try {
      console.log('🔑 Deriving recipient public key...');
      
      // For this demo, we'll derive OUR OWN key as if we were the recipient
      // In real usage, the recipient would do this step and share their derived public key
      const keypair = await deriveKeypairFromWallet(wallet.adapter);
      const derivedPublicKeyBase58 = bs58.encode(keypair.publicKey);
      
      setRecipientDerivedKey(derivedPublicKeyBase58);
      
      alert(`✅ Derived recipient key! Now you can encrypt messages to this derived key: ${derivedPublicKeyBase58.slice(0, 8)}...`);
      
    } catch (error) {
      console.error('Key derivation failed:', error);
      alert('Failed to derive recipient key. Please try again.');
    }
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b-3 border-black bg-white relative">
        <div className="max-w-7xl mx-auto p-5 flex justify-between items-center">
          <div className="text-3xl font-bold -rotate-1 relative">
            DM the DEV ✎
          </div>
          <ClientOnly>
            <WalletMultiButton className="wallet-btn" />
          </ClientOnly>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5">
        {/* Stickman */}
        <div className="flex items-center justify-center my-10 gap-8">
          <div className="font-mono text-4xl whitespace-pre -rotate-2">
            {'   o\n  /|\\\n  / \\'}</div>
          <div className="bg-white border-3 border-black rounded-[20px] p-4 max-w-[350px] rotate-1 relative">
            Hey! I'm your ugly but trustworthy DEV mascot! [nerd face]
          </div>
        </div>

        <ClientOnly>
          <>
            {/* Test Section */}
            <section className="section mb-8">
              <h2 className="section-title">[🧪] Test New Encryption</h2>
              <p className="mb-4 text-gray-600">
                Test the new signature-based encryption/decryption system.
              </p>
              <button
                onClick={runEncryptionTest}
                className="bg-yellow-100 border-3 border-black py-2 px-4 font-bold rounded-xl hover:bg-yellow-200 transition-colors"
              >
                🧪 Run Encryption Test
              </button>
              {testResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  testResult.startsWith('✅') ? 'bg-green-50 text-green-700' :
                  testResult.startsWith('❌') ? 'bg-red-50 text-red-700' :
                  'bg-blue-50 text-blue-700'
                }`}>
                  {testResult}
                </div>
              )}
            </section>

            {/* Token Lookup */}
            <section className="section">
              <h2 className="section-title">[🔍] Token Lookup</h2>
              <div className="space-y-4">
                <input
                  type="text"
                  className="w-full p-4 border-3 border-black rounded-xl font-comic -rotate-[0.2deg]"
                  placeholder="Enter Solana Token Address"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                />
                <button
                  onClick={handleFindDeployer}
                  disabled={isLoading}
                  className="bg-white border-3 border-black py-4 px-6 font-bold rounded-xl rotate-[0.5deg] hover:animate-bounce-light w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Searching... 🔍' : 'Find Deployer 🧠 ↗'}
                </button>
              </div>
              {deployerInfo && (
                <div className={`mt-5 border-3 border-black rounded-xl p-5 -rotate-1 ${
                  deployerInfo.error ? 'bg-[#ffe6e6]' : 'bg-[#fffacd]'
                }`}>
                  {deployerInfo.error ? (
                    <div className="text-red-600">{deployerInfo.error}</div>
                  ) : (
                    <>
                      <div><strong>Token:</strong> {deployerInfo.name} ({deployerInfo.symbol})</div>
                      <div><strong>Deployer:</strong> {deployerInfo.address}</div>
                      {typeof deployerInfo.creatorSolBalance === 'number' && (
                        <div><strong>Deployer SOL Balance:</strong> {deployerInfo.creatorSolBalance.toFixed(2)} SOL</div>
                      )}
                      {typeof deployerInfo.marketCap === 'number' && (
                        <div><strong>Token Price:</strong> ${deployerInfo.marketCap.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Message Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab('send')}
                className={`flex-1 py-3 px-6 font-bold rounded-t-xl border-3 border-black transition-all ${
                  activeTab === 'send'
                    ? 'bg-white -rotate-1'
                    : 'bg-gray-100 opacity-70 rotate-1'
                }`}
              >
                [✉️] Send Message
              </button>
              <button
                onClick={() => setActiveTab('decrypt')}
                className={`flex-1 py-3 px-6 font-bold rounded-t-xl border-3 border-black transition-all ${
                  activeTab === 'decrypt'
                    ? 'bg-white rotate-1'
                    : 'bg-gray-100 opacity-70 -rotate-1'
                }`}
              >
                [🔑] Decrypt Message
              </button>
            </div>

            {/* Send Message Section */}
            {activeTab === 'send' && (
              <section className="section">
                <h2 className="section-title">[💌] Send Message to Developer</h2>
                
                {/* Recipient Key Derivation */}
                <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                  <h3 className="font-bold mb-2">🔑 Step 1: Derive Recipient Key</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    For secure messaging, we need to derive a signature-based key for the recipient.
                  </p>
                  <button
                    onClick={deriveRecipientKey}
                    disabled={!connected || !deployerInfo?.address || !!deployerInfo?.error}
                    className="bg-blue-100 border-2 border-black py-2 px-4 font-bold rounded-xl hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🔑 Derive Recipient Key
                  </button>
                  {recipientDerivedKey && (
                    <div className="mt-2 text-sm text-green-600">
                      ✅ Recipient key derived: {recipientDerivedKey.slice(0, 8)}...{recipientDerivedKey.slice(-8)}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <textarea
                    className="w-full p-4 border-3 border-black rounded-xl font-comic resize-y min-h-[120px] bg-white"
                    placeholder="Write your message to the developer..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={!connected || isSending}
                  />
                  <div className="flex gap-4">
                    <input
                      type="number"
                      className="flex-1 p-4 border-3 border-black rounded-xl font-comic bg-white"
                      placeholder="Tip amount in SOL (optional)"
                      value={tipAmount}
                      onChange={(e) => setTipAmount(e.target.value)}
                      disabled={!connected || isSending}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => sendMessage(false)}
                      disabled={!connected || !message || isSending || !recipientDerivedKey}
                      className="flex-1 bg-white border-3 border-black py-4 px-6 font-bold rounded-xl rotate-[0.5deg] hover:animate-bounce-light disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? '⏳ Sending...' : '💬 Send Message Only'}
                    </button>
                    <button
                      onClick={() => sendMessage(true)}
                      disabled={!connected || !message || isSending || !tipAmount || !recipientDerivedKey}
                      className="flex-1 bg-white border-3 border-black py-4 px-6 font-bold rounded-xl -rotate-[0.5deg] hover:animate-bounce-light disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? '⏳ Sending...' : `💸 Send Message + ${tipAmount ? `${tipAmount} SOL` : 'Tip'}`}
                    </button>
                  </div>
                  {!connected && (
                    <div className="text-center text-red-500">
                      Please connect your wallet to send messages!
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Decrypt Message Section */}
            {activeTab === 'decrypt' && (
              <section className="section">
                <h2 className="section-title">[🔑] Decrypt Messages</h2>
                <p className="mb-5 text-gray-600 -rotate-[0.3deg]">
                  Got an encrypted message? Paste it here to decrypt! [detective]
                </p>
                <div className="space-y-4">
                  <div className="bg-white border-4 border-black rounded-[30px] p-5 -rotate-[0.3deg]">
                    <textarea
                      className="w-full min-h-[100px] font-comic resize-y bg-transparent"
                      placeholder='Paste the full encrypted message JSON here, like: {"ciphertext": "...", "nonce": "...", "ephemeralPublicKey": "..."}'
                      value={encryptedMessage}
                      onChange={(e) => setEncryptedMessage(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleDecryptPastedMessage}
                    className="bg-white border-3 border-black py-4 px-8 font-bold rounded-xl rotate-1 hover:animate-bounce-light w-full"
                  >
                    Decrypt Message [unlock] ↗
                  </button>
                  {decryptedMessage && (
                    <div className="mt-5 bg-[#e6f7ff] border-3 border-black rounded-xl p-5 -rotate-1">
                      <div><strong>Decrypted Message:</strong></div>
                      <pre className="mt-2 italic whitespace-pre-wrap break-all">{decryptedMessage}</pre>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Messages Section */}
            {connected && publicKey && (
              <section className="section mt-8">
                <h2 className="section-title">[📬] Your Messages</h2>
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      No messages found. Share your token with others to receive messages!
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="border-3 border-black rounded-xl p-4 bg-white">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-bold">From: {msg.senderAddress.slice(0, 4)}...{msg.senderAddress.slice(-4)}</div>
                            <div className="text-sm text-gray-600">
                              {msg.createdAt ? new Date(msg.createdAt).toUTCString() : 'Unknown date'}
                            </div>
                          </div>
                        </div>
                        
                        {decryptedMessages[msg.id!] === 'DECRYPT_READY' ? (
                          <DecryptedMessage
                            encryptedData={{
                              ciphertext: msg.ciphertext,
                              nonce: msg.nonce,
                              ephemeralPublicKey: msg.ephemeralPublicKey
                            }}
                            wallet={wallet}
                            senderAddress={msg.senderAddress}
                          />
                        ) : decryptedMessages[msg.id!] ? (
                          <div className={`mt-2 p-3 rounded-lg text-sm break-all ${
                            decryptedMessages[msg.id!].startsWith('[❌') ? 'bg-red-50 text-red-600' :
                            'bg-blue-50 text-blue-800'
                          }`}>
                            {decryptedMessages[msg.id!]}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDecryptMessageFromList(msg.id!)}
                            className="w-full mt-2 py-2 px-4 border-2 border-black rounded-lg bg-white hover:bg-gray-50 transition-colors"
                            disabled={!connected}
                          >
                            {connected ? '🔑 Decrypt Message' : '🔒 Connect Wallet to Decrypt'}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </>
        </ClientOnly>
      </div>

      {/* Footer */}
      <footer className="text-center py-10 border-t-3 border-black mt-15 bg-white">
        <div className="-rotate-[0.5deg]">
          Yes, the dev is ugly. But your messages are safe 🛡️
          <br /><small>Built with ❤️ and terrible drawing skills</small>
        </div>
      </footer>
    </main>
  );
} 