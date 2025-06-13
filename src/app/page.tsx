'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTokenData } from '@/utils/helius';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { encryptMessage, decryptMessage, EncryptedData, deriveKeypairFromWallet } from '@/utils/encryption';
import { uploadMessage, fetchMessagesForDeployer, EncryptedMessage } from '@/utils/supabase';
import dynamic from 'next/dynamic';
import ClientOnly from '@/components/ClientOnly';
import SolBalanceAvatar from '@/components/SolBalanceAvatar';
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
  const [deployerInfo, setDeployerInfo] = useState<{
    address: string;
    token: string;
    name: string;
    symbol: string;
    error?: string;
    marketCap?: number | null;
    creatorSolBalance?: number | null;
  } | null>(null);
  const [recipientKey, setRecipientKey] = useState<string>('');
  const [isDerivedKeyReady, setIsDerivedKeyReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'decrypt'>('send');
  const [messages, setMessages] = useState<EncryptedMessage[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [currentStickmanPose, setCurrentStickmanPose] = useState(0);
  const [userSolBalance, setUserSolBalance] = useState<number | null>(null);

  // Different stickman poses for animation
  const stickmanPoses = [
    '   o\n  /|\\\n  / \\',      // normal standing
    '   o\n  \\|/\n  / \\',      // arms up celebrating
    '   o\n   |\\\n  / \\',      // waving
    '   o\n  /|\n  / \\',       // pointing
    '   O\n  /|\\\n  | |',      // surprised standing straight
    '   >\n  /|\\\n  / \\',      // winking
    '   o\n  /|o\n  / \\',      // holding something
    '   @\n  /|\\\n  /_\\',      // dizzy/confused
    '   o\n <-|->\n  / \\',      // arms out wide
    '   o\n  /|\\\n   ^',        // jumping
    '   o\n  \\|/\n   /',        // dancing
    '   ☻\n  /|\\\n  / \\'       // happy face
  ];

  // Mascot messages that cycle through
  const mascotMessages = [
    "Welcome to Moonit! Let's get your token launched.",
    "Ready to launch your token on Solana? You're in the right place.",
    "Let's make your token launch a success. Follow the steps below."
  ];

  const [currentMascotMessage, setCurrentMascotMessage] = useState(0);

  const handleFindDeployer = async () => {
    if (!tokenAddress) return;
    
    setIsLoading(true);
    setRecipientKey('');
    setIsDerivedKeyReady(false);
    
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

  const handleDeriveRecipientKey = async () => {
    if (!deployerInfo?.address || deployerInfo.error) {
      alert('Please find a valid deployer first!');
      return;
    }

    if (!connected || !wallet?.adapter) {
      alert('Please connect your wallet first!');
      return;
    }

    try {
      console.log("🔑 Deriving recipient key...");
      
      // Use a deterministic approach based on the deployer's wallet address
      // This ensures both sender and receiver derive the same key
      const deployerAddress = deployerInfo.address;
      
      // Create a deterministic seed from the deployer's address
      // This will always produce the same result for the same address
      const message = `MOONIT_DECRYPT:${deployerAddress}`;
      const messageBytes = new TextEncoder().encode(message);
      
      // Use the deployer's public key bytes as a deterministic seed
      const deployerPublicKeyBytes = bs58.decode(deployerAddress);
      
      // Create a deterministic 64-byte "signature" by combining and hashing
      const combinedData = new Uint8Array(messageBytes.length + deployerPublicKeyBytes.length);
      combinedData.set(messageBytes, 0);
      combinedData.set(deployerPublicKeyBytes, messageBytes.length);
      
      // Hash to create deterministic signature
      const { sha512 } = await import('@noble/hashes/sha512');
      const deterministicSignature = sha512(combinedData);
      
      // Create mock deployer wallet that will produce the same signature every time
      const mockDeployerWallet = {
        publicKey: { toBase58: () => deployerAddress },
        signMessage: async () => deterministicSignature,
        name: "DeployerWallet"
      };
      
      // Derive the keypair that the deployer would have
      const derivedKeypair = await deriveKeypairFromWallet(mockDeployerWallet);
      const derivedPublicKeyBase58 = bs58.encode(derivedKeypair.publicKey);
      
      setRecipientKey(derivedPublicKeyBase58);
      setIsDerivedKeyReady(true);
      
      console.log("✅ Recipient key derived:", derivedPublicKeyBase58);
      console.log("🔍 This key is deterministic based on address:", deployerAddress);
      
    } catch (error) {
      console.error('Failed to derive recipient key:', error);
      alert('Failed to derive recipient key. Please try again.');
    }
  };

  const sendMessage = async (withTip: boolean) => {
    if (!message || !publicKey || !deployerInfo?.address || deployerInfo.error) {
      alert('Please connect wallet, enter a message, and find a valid token deployer first!');
      return;
    }

    if (!isDerivedKeyReady || !recipientKey) {
      alert('Please derive the recipient key first!');
      return;
    }

    if (!connected) {
      alert('Please connect your wallet first!');
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
        console.log("Using derived recipient key:", recipientKey);
        encrypted = encryptMessage(message, recipientKey);
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
          usesSignatureDerivedKey: true,
          encryptedForPublicKey: recipientKey,
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

    if (connected && publicKey) {
      loadMessages();
    }

    return () => {
      mounted = false;
    };
  }, [connected, publicKey]);

  useEffect(() => {
    const fetchUserBalance = async () => {
      if (publicKey) {
        try {
          const connection = new Connection(HELIUS_RPC, 'confirmed');
          const balance = await connection.getBalance(publicKey);
          setUserSolBalance(balance / LAMPORTS_PER_SOL);
        } catch (error) {
          console.error('Error fetching user balance:', error);
          setUserSolBalance(null);
        }
      }
    };

    fetchUserBalance();
  }, [publicKey]);

  // Animate stickman poses and mascot messages
  useEffect(() => {
    const stickmanInterval = setInterval(() => {
      setCurrentStickmanPose((prev) => (prev + 1) % stickmanPoses.length);
    }, 2000);

    const messageInterval = setInterval(() => {
      setCurrentMascotMessage((prev) => (prev + 1) % mascotMessages.length);
    }, 5000);

    return () => {
      clearInterval(stickmanInterval);
      clearInterval(messageInterval);
    };
  }, [stickmanPoses.length, mascotMessages.length]);

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
      // New signature-based decryption approach with key verification
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

  const handleTabChange = (tab: 'send' | 'decrypt') => {
    setActiveTab(tab);
    // Reset states when switching tabs to avoid confusion
    setEncryptedMessage('');
    setDecryptedMessage('');
    setMessages([]);
    setDecryptedMessages({});
  };

  return (
    <ClientOnly>
      <div className="flex flex-col min-h-screen bg-black text-white font-mono relative overflow-hidden">
        
        {/* Background Animation */}
        <div className="absolute top-0 left-0 w-full h-full z-0 overflow-hidden">
          <div className="absolute w-full h-full bg-black">
            {Array.from({ length: 100 }).map((_, i) => (
              <div
                key={i}
                className="absolute bg-gray-800 rounded-full"
                style={{
                  width: `${Math.random() * 2}px`,
                  height: `${Math.random() * 2}px`,
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animation: `twinkle ${Math.random() * 5 + 3}s linear infinite`,
                }}
              />
            ))}
          </div>
        </div>

        <header className="flex justify-between items-center p-4 z-10">
          <div className="flex items-center space-x-4">
            {userSolBalance !== null && <SolBalanceAvatar solBalance={userSolBalance} />}
            <div className="text-xl font-bold">Moonit</div>
          </div>
          <WalletMultiButton style={{ backgroundColor: '#4a4a4a', color: 'white', borderRadius: '5px' }} />
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-4 text-center z-10">
          <div className="w-full max-w-4xl mx-auto">
            {/* Mascot Section */}
            <div className="flex items-center justify-center space-x-4 mb-8">
              <pre className="text-lg text-yellow-300 whitespace-pre-wrap">{stickmanPoses[currentStickmanPose]}</pre>
              <div className="bg-gray-800 p-3 rounded-lg text-sm text-left max-w-xs">
                <p>{mascotMessages[currentMascotMessage]}</p>
              </div>
            </div>

            <h1 className="text-5xl font-bold mb-2 text-yellow-300">
              Launch on Moonit
            </h1>
            <p className="mb-8 text-gray-400">
              The easiest way to launch your token on Solana.
            </p>

            {/* Main Content */}
            <div className="bg-gray-900 bg-opacity-70 border border-gray-700 rounded-lg p-6 w-full">
              {/* Tabs */}
              <div className="flex border-b border-gray-700 mb-4">
                <button
                  className={`py-2 px-4 text-sm font-medium ${activeTab === 'send' ? 'border-b-2 border-yellow-300 text-yellow-300' : 'text-gray-400'}`}
                  onClick={() => handleTabChange('send')}
                >
                  🚀 Launch
                </button>
                <button
                  className={`py-2 px-4 text-sm font-medium ${activeTab === 'decrypt' ? 'border-b-2 border-yellow-300 text-yellow-300' : 'text-gray-400'}`}
                  onClick={() => handleTabChange('decrypt')}
                >
                  📬 Inbox
                </button>
              </div>

              {/* Send Message Section */}
              {activeTab === 'send' && (
                <section className="section">
                  <div className="max-w-2xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-8 -rotate-1">[💌] Send Message to Developer</h2>
                    
                    {/* Step 1: Derive Recipient Key */}
                    <div className="mb-8 p-5 border-3 border-black rounded-xl bg-yellow-50 -rotate-[0.5deg]">
                      <h3 className="text-xl font-bold mb-3">🔐 Step 1: Derive Recipient Key</h3>
                      <p className="mb-4 text-gray-600">
                        For secure messaging, we need to derive a signature-based key for the recipient.
                      </p>
                      <button
                        onClick={handleDeriveRecipientKey}
                        disabled={!deployerInfo?.address || !!deployerInfo?.error || !connected}
                        className={`py-3 px-6 font-bold rounded-xl border-3 border-black transition-all interactive-btn ${
                          isDerivedKeyReady 
                            ? 'bg-green-200 text-green-800' 
                            : 'bg-white hover:bg-gray-50'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isDerivedKeyReady ? '✅ Key Derived' : '🔑 Derive Recipient Key'}
                      </button>
                      
                      {recipientKey && (
                        <div className="mt-3 p-3 bg-white border-2 border-black rounded-lg animate-float">
                          <div className="text-sm text-gray-600 mb-1">Recipient key derived:</div>
                          <div className="font-mono text-sm break-all">
                            {recipientKey.slice(0, 8)}...{recipientKey.slice(-8)}
                          </div>
                        </div>
                      )}
                      
                      {!connected && (
                        <div className="mt-2 text-red-500 text-sm">
                          Please connect your wallet to derive keys
                        </div>
                      )}
                      
                      {!deployerInfo && (
                        <div className="mt-2 text-gray-500 text-sm">
                          Please find a deployer first using the token lookup above
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <textarea
                        className="w-full p-4 border-3 border-black rounded-xl font-comic resize-y min-h-[120px] bg-white animated-input"
                        placeholder="Write your message to the developer..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        disabled={!connected || isSending || !isDerivedKeyReady}
                      />
                      <div className="flex gap-4">
                        <input
                          type="number"
                          className="flex-1 p-4 border-3 border-black rounded-xl font-comic bg-white animated-input"
                          placeholder="Tip amount in SOL (optional)"
                          value={tipAmount}
                          onChange={(e) => setTipAmount(e.target.value)}
                          disabled={!connected || isSending || !isDerivedKeyReady}
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="flex gap-4">
                        <button
                          onClick={() => sendMessage(false)}
                          disabled={!connected || !message || isSending || !isDerivedKeyReady}
                          className="flex-1 bg-white border-3 border-black py-4 px-6 font-bold rounded-xl rotate-[0.5deg] hover:animate-bounce-light disabled:opacity-50 disabled:cursor-not-allowed interactive-btn"
                        >
                          {isSending ? '⏳ Sending...' : '💬 Send Message Only'}
                        </button>
                        <button
                          onClick={() => sendMessage(true)}
                          disabled={!connected || !message || isSending || !(tipAmount && tipAmount.trim()) || !isDerivedKeyReady}
                          className="flex-1 bg-white border-3 border-black py-4 px-6 font-bold rounded-xl -rotate-[0.5deg] hover:animate-bounce-light disabled:opacity-50 disabled:cursor-not-allowed interactive-btn"
                        >
                          {isSending ? '⏳ Sending...' : `💸 Send Message + ${tipAmount ? `${tipAmount} SOL` : 'Tip'}`}
                        </button>
                      </div>
                      {!connected && (
                        <div className="text-center text-red-500">
                          Please connect your wallet to send messages!
                        </div>
                      )}
                      {!isDerivedKeyReady && connected && (
                        <div className="text-center text-orange-500">
                          Please derive the recipient key first!
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Decrypt Message Section */}
              {activeTab === 'decrypt' && (
                <section className="section">
                  <div className="max-w-2xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-8 -rotate-1">[🔑] Decrypt Messages</h2>
                    <p className="mb-5 text-gray-600 text-center">
                      Got an encrypted message? Paste it here to decrypt! [detective]
                    </p>
                    <div className="space-y-4">
                      <div className="bg-white border-4 border-black rounded-[30px] p-5 -rotate-[0.3deg] hover:rotate-1 transition-all duration-300">
                        <textarea
                          className="w-full min-h-[100px] font-comic resize-y bg-transparent animated-input"
                          placeholder='Paste the full encrypted message JSON here, like: {"ciphertext": "...", "nonce": "...", "ephemeralPublicKey": "..."}'
                          value={encryptedMessage}
                          onChange={(e) => setEncryptedMessage(e.target.value)}
                        />
                      </div>
                      <button
                        onClick={handleDecryptPastedMessage}
                        className="bg-white border-3 border-black py-4 px-8 font-bold rounded-xl rotate-1 hover:animate-bounce-light w-full interactive-btn"
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
                  </div>
                </section>
              )}

              {/* Messages Section */}
              {connected && publicKey && (
                <section className="section mt-8" id="my-messages">
                  <div className="max-w-3xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-8 -rotate-1">[📬] Your Messages</h2>
                    <div className="space-y-4">
                      {messages.length === 0 ? (
                        <div className="text-center text-gray-500 py-8 animate-pulse-gentle">
                          No messages found. Share your token with others to receive messages!
                        </div>
                      ) : (
                        messages.map((msg, index) => (
                          <div key={msg.id} className="border-3 border-black rounded-xl p-4 bg-white hover:rotate-1 transition-all duration-300 hover:scale-[1.02] animate-float" style={{animationDelay: `${index * 0.1}s`}}>
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
                                encryptedForPublicKey={msg.encryptedForPublicKey}
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
                                className="w-full mt-2 py-2 px-4 border-2 border-black rounded-lg bg-white hover:bg-gray-50 transition-colors interactive-btn"
                                disabled={!connected}
                              >
                                {connected ? 'Decrypt Message' : '🔒 Connect Wallet to Decrypt'}
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>
    </ClientOnly>
  );
} 