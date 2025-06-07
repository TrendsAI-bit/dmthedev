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
    "Hey! I'm your ugly but trustworthy DEV mascot! [nerd face]",
    "I heard you want to DM the dev? Go ahead. Bribe them, beg them, ask them out on a virtual date—whatever works.",
    "If this changed your life, you know where to find me. Message me… and don't forget the tip 😉"
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
      const message = `DM_DEV_DECRYPT:${deployerAddress}`;
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

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [publicKey?.toBase58()]);

  // Animate stickman poses and mascot messages
  useEffect(() => {
    const stickmanInterval = setInterval(() => {
      setCurrentStickmanPose((prev) => (prev + 1) % stickmanPoses.length);
    }, 3000); // Change pose every 3 seconds

    const messageInterval = setInterval(() => {
      setCurrentMascotMessage((prev) => (prev + 1) % mascotMessages.length);
    }, 5000); // Change message every 5 seconds

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

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b-3 border-black bg-white relative">
        <div className="max-w-7xl mx-auto p-5 flex justify-between items-center">
          <div className="text-3xl font-bold -rotate-1 relative">
            DM the DEV ✎
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => document.getElementById('token-lookup')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-white text-black border-3 border-black py-2 px-4 font-bold rounded-xl -rotate-1 hover:rotate-2 hover:scale-110 transition-all duration-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1"
            >
              🚀 Start Using
            </button>
            <button 
              onClick={() => {
                setActiveTab('decrypt');
                setTimeout(() => {
                  document.getElementById('my-messages')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
              className="bg-white text-black border-3 border-black py-2 px-4 font-bold rounded-xl rotate-1 hover:-rotate-2 hover:scale-110 transition-all duration-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1"
            >
              📬 My Messages
            </button>
            <a 
              href="https://x.com/DMthedevs" 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-white text-black border-3 border-black py-2 px-4 font-bold rounded-xl rotate-2 hover:-rotate-1 hover:scale-110 transition-all duration-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1"
            >
              🐦 Follow @DMthedevs
            </a>
            <ClientOnly>
              <WalletMultiButton className="wallet-btn" />
            </ClientOnly>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5">
        {/* Stickman */}
        <div className="flex items-center justify-center my-10 gap-8 max-w-4xl mx-auto">
          <div className="font-mono text-4xl whitespace-pre -rotate-2 transform transition-all duration-500 hover:scale-110 hover:rotate-6 cursor-pointer animate-bounce-slow">
            {stickmanPoses[currentStickmanPose]}</div>
          <div className="space-y-4">
            <div className="bg-white border-3 border-black rounded-[20px] p-4 max-w-[350px] rotate-1 relative transform transition-all duration-300 hover:rotate-3 hover:scale-105 animate-wiggle-slow">
              {mascotMessages[currentMascotMessage]}
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <section className="section">
          <h2 className="section-title text-center">🚀 How DM the DEV Works</h2>
          <div className="grid md:grid-cols-4 gap-6 mb-6 max-w-6xl mx-auto">
            {/* Step 1 */}
            <div className="text-center p-6 border-3 border-black rounded-xl bg-white transform hover:scale-105 transition-all duration-300 animate-float relative" style={{animationDelay: '0s'}}>
              <div className="border-2 border-black rounded-lg p-2 mb-4 bg-gray-50">
                <div className="text-xl font-bold mb-2">1. Find Token Deployer</div>
                <div className="font-mono text-2xl whitespace-pre mb-3 hover:animate-bounce hover:text-blue-600 hover:scale-125 transition-all duration-300 cursor-pointer">{'   o\n  /|\\\n  / \\'}</div>
                <div className="bg-white border-2 border-black rounded-full p-2 relative">
                  <div className="text-xs font-bold">"I want to contact the dev of $MOON!"</div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
                </div>
              </div>
              <div className="bg-black text-green-400 p-2 rounded font-mono text-xs">
                &gt; pump.fun token:<br/>
                9xK...Ab2 → deployer:<br/>
                Bb7...Xy9
              </div>
              <div className="text-xs mt-2 font-bold">[wallet] Bb7...Xy9</div>
              <div className="text-xs text-gray-600 mt-2 italic">
                Paste any Pump.fun token address to find who deployed it
              </div>
            </div>

            {/* Step 2 */}
            <div className="text-center p-6 border-3 border-black rounded-xl bg-white transform hover:scale-105 transition-all duration-300 animate-float relative" style={{animationDelay: '0.1s'}}>
              <div className="border-2 border-black rounded-lg p-2 mb-4 bg-gray-50">
                <div className="text-xl font-bold mb-2">2. Send Anonymous Message</div>
                <div className="font-mono text-2xl whitespace-pre mb-3 hover:animate-pulse hover:text-yellow-600 hover:rotate-12 transition-all duration-300 cursor-pointer">{'   o\n  /|\\\n  / \\'}</div>
                <div className="bg-white border-2 border-black rounded-full p-2 relative">
                  <div className="text-xs font-bold">"Wen moon? Love the project!"</div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
                </div>
              </div>
              <div className="text-sm mb-2">↓ [encrypt]</div>
              <div className="bg-yellow-200 border-2 border-black rounded p-2 text-xs font-mono">
                eK9x...mP2q [encrypted data]
              </div>
              <div className="border-2 border-black border-dashed rounded p-2 mt-2 text-xs">
                Anonymous & Secure!
              </div>
              <div className="text-xs text-gray-600 mt-2 italic">
                Your message gets encrypted and sent anonymously
              </div>
            </div>

            {/* Step 3 */}
            <div className="text-center p-6 border-3 border-black rounded-xl bg-white transform hover:scale-105 transition-all duration-300 animate-float relative" style={{animationDelay: '0.2s'}}>
              <div className="border-2 border-black rounded-lg p-2 mb-4 bg-gray-50">
                <div className="text-xl font-bold mb-2">3. Deployer Gets Notification</div>
                <div className="font-mono text-2xl whitespace-pre mb-3 text-red-500 hover:animate-spin hover:text-orange-500 hover:scale-110 transition-all duration-500 cursor-pointer">{'   o\n  /|\\\n  / \\'}</div>
                <div className="bg-white border-2 border-black rounded-full p-2 relative">
                  <div className="text-xs font-bold">"Huh? I got a DM?"</div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
                </div>
              </div>
              <div className="bg-black text-green-400 p-2 rounded font-mono text-xs mb-2">
                📨 New encrypted message from: Anonymous
              </div>
              <div className="bg-yellow-200 border-2 border-black rounded p-2 text-xs">
                eK9x...mP2q [click to decrypt]
              </div>
              <div className="text-xs text-gray-600 mt-2 italic">
                Deployer sees they have an encrypted message waiting
              </div>
            </div>

            {/* Step 4 */}
            <div className="text-center p-6 border-3 border-black rounded-xl bg-white transform hover:scale-105 transition-all duration-300 animate-float relative" style={{animationDelay: '0.3s'}}>
              <div className="border-2 border-black rounded-lg p-2 mb-4 bg-gray-50">
                <div className="text-xl font-bold mb-2">4. Decrypt & Read</div>
                <div className="font-mono text-2xl whitespace-pre mb-3 text-green-600 hover:animate-bounce hover:text-green-400 hover:scale-150 hover:-rotate-6 transition-all duration-300 cursor-pointer">{'   ☻\n  /|\\\n  / \\'}</div>
                <div className="bg-white border-2 border-black rounded-full p-2 relative">
                  <div className="text-xs font-bold">"Cool! A fan message!"</div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
                </div>
              </div>
              <div className="bg-black text-green-400 p-2 rounded font-mono text-xs mb-2">
                📨 "Wen moon? Love the project!" [decrypted successfully]
              </div>
              <div className="border-2 border-black border-dashed rounded p-2 text-xs">
                "This is awesome!"
              </div>
              <div className="text-xs text-gray-600 mt-2 italic">
                Deployer uses their wallet to decrypt and read the message
              </div>
            </div>
          </div>
          
          <div className="text-center p-6 bg-white border-3 border-black rounded-xl transform hover:rotate-1 transition-all duration-300 max-w-4xl mx-auto">
            <div className="flex justify-center mb-4">
              <div className="font-mono text-3xl whitespace-pre">{'   🛡️\n  /|\\\n  / \\'}</div>
            </div>
            <div className="font-bold text-lg mb-2">Why It's Secure & Anonymous</div>
            <div className="text-sm text-gray-700 max-w-2xl mx-auto">
              Messages are encrypted using <span className="font-mono bg-yellow-100 px-1">signature-derived keys</span>. 
              Only the deployer's wallet can decrypt them. No personal info shared - complete anonymity guaranteed! 
              It's like passing secret notes in class, but with military-grade crypto! 🤓
            </div>
          </div>
        </section>

        <ClientOnly>
          <>
            {/* Token Lookup */}
            <section className="section max-w-4xl mx-auto" id="token-lookup">
              <h2 className="section-title text-center">[🔍] Token Lookup</h2>
              <div className="space-y-4">
                <input
                  type="text"
                  className="w-full p-4 border-3 border-black rounded-xl font-comic -rotate-[0.2deg] animated-input"
                  placeholder="Enter Solana Token Address"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                />
                <button
                  onClick={handleFindDeployer}
                  disabled={isLoading}
                  className="bg-white border-3 border-black py-4 px-6 font-bold rounded-xl rotate-[0.5deg] hover:animate-bounce-light w-full disabled:opacity-50 disabled:cursor-not-allowed interactive-btn"
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
            <div className="flex gap-2 mb-4 max-w-4xl mx-auto">
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
              <section className="section max-w-4xl mx-auto">
                <h2 className="section-title text-center">[💌] Send Message to Developer</h2>
                
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
              </section>
            )}

            {/* Decrypt Message Section */}
            {activeTab === 'decrypt' && (
              <section className="section max-w-4xl mx-auto">
                <h2 className="section-title text-center">[🔑] Decrypt Messages</h2>
                <p className="mb-5 text-gray-600 -rotate-[0.3deg] text-center">
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
              </section>
            )}

            {/* Messages Section */}
            {connected && publicKey && (
              <section className="section mt-8 max-w-4xl mx-auto" id="my-messages">
                <h2 className="section-title text-center">[📬] Your Messages</h2>
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

      {/* Whitepaper Section */}
      <div className="bg-gray-900 text-white py-20 mt-20">
        <div className="max-w-7xl mx-auto p-5">
          <section className="mb-16">
            <h2 className="text-5xl font-bold text-center mb-10 rotate-1 animate-wiggle-slow">
              📋 The $DMDEV Doodle Paper
            </h2>
            <div className="text-center mb-12 text-gray-300">
              <p className="text-xl mb-4">Anonymous DEV Messages Go BRRR on Solana 🚀</p>
              <p className="text-sm">Version 1.0 • Launching on pump.fun because we're degens</p>
            </div>
          </section>

          <div className="grid lg:grid-cols-3 gap-12 mb-16">
            {/* The Problem - Stickman crying */}
            <div className="bg-white/10 border-3 border-white rounded-xl p-6 transform hover:scale-105 transition-all duration-300">
              <div className="text-center mb-6">
                <div className="font-mono text-4xl whitespace-pre text-red-400 mb-4">{'   😭\n  /|\\\n  / \\'}</div>
                <div className="bg-white/20 border-2 border-white rounded-full p-3 relative">
                  <div className="text-sm font-bold">"Can't reach any devs! Rug incoming?"</div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-4 text-red-400">😤 The Problem</h3>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>• Devs harder to find than Satoshi</li>
                <li>• Community feedback = void screaming</li>
                <li>• Anonymous tips? Impossible!</li>
                <li>• Doxxing yourself just to say "wen moon?"</li>
              </ul>
            </div>

            {/* Our Solution - Happy stickman */}
            <div className="bg-white/10 border-3 border-white rounded-xl p-6 transform hover:scale-105 transition-all duration-300">
              <div className="text-center mb-6">
                <div className="font-mono text-4xl whitespace-pre text-green-400 mb-4">{'   😎\n  /|\\\n  / \\'}</div>
                <div className="bg-white/20 border-2 border-white rounded-full p-3 relative">
                  <div className="text-sm font-bold">"DMing devs anonymously? BASED!"</div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-4 text-green-400">💡 Our Solution</h3>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>• Military-grade encryption (actually works)</li>
                <li>• Full anon mode activated</li>
                <li>• Direct access to any token dev</li>
                <li>• Built on Solana (because fees matter)</li>
              </ul>
            </div>

            {/* Tokenomics - Money stickman */}
            <div className="bg-white/10 border-3 border-white rounded-xl p-6 transform hover:scale-105 transition-all duration-300">
              <div className="text-center mb-6">
                <div className="font-mono text-4xl whitespace-pre text-yellow-400 mb-4">{'   🤑\n  /|\\\n  / \\'}</div>
                <div className="bg-white/20 border-2 border-white rounded-full p-3 relative">
                  <div className="text-sm font-bold">"1B tokens? Number go up!"</div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-4 text-yellow-400">💎 $DMDEV Tokenomics</h3>
              <div className="space-y-2 text-gray-300 text-sm">
                <div><strong className="text-white">Supply:</strong> 1B (nice round number)</div>
                <div><strong className="text-white">Launch:</strong> pump.fun (obviously)</div>
                <div><strong className="text-white">Uses:</strong> Premium features, governance, tips, revenue share</div>
              </div>
            </div>
          </div>

          {/* Roadmap - Timeline with stickmen */}
          <div className="bg-white/10 border-3 border-white rounded-xl p-8 mb-16 transform hover:rotate-1 transition-all duration-300">
            <h3 className="text-3xl font-bold mb-8 text-center text-purple-400">🗺️ The Roadmap Ahead</h3>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Q2 2025 */}
              <div className="text-center">
                <div className="font-mono text-3xl whitespace-pre text-blue-400 mb-3">{'   🚀\n  /|\\\n  / \\'}</div>
                <div className="bg-blue-400/20 border-2 border-blue-400 rounded-lg p-4">
                  <div className="font-bold text-blue-400 mb-2">Q2 2025: "The Launch"</div>
                  <div className="text-xs text-gray-300">
                    Platform launch • pump.fun token • Basic messaging • Solana integration
                  </div>
                </div>
              </div>

              {/* Q3 2025 */}
              <div className="text-center">
                <div className="font-mono text-3xl whitespace-pre text-green-400 mb-3">{'   👥\n  /|\\\n  / \\'}</div>
                <div className="bg-green-400/20 border-2 border-green-400 rounded-lg p-4">
                  <div className="font-bold text-green-400 mb-2">Q3 2025: "The Expansion"</div>
                  <div className="text-xs text-gray-300">
                    Group messaging • Dev verification • Mobile app beta • More features
                  </div>
                </div>
              </div>

              {/* Q4 2025 */}
              <div className="text-center">
                <div className="font-mono text-3xl whitespace-pre text-purple-400 mb-3">{'   🌍\n  /|\\\n  / \\'}</div>
                <div className="bg-purple-400/20 border-2 border-purple-400 rounded-lg p-4">
                  <div className="font-bold text-purple-400 mb-2">Q4 2025: "World Domination"</div>
                  <div className="text-xs text-gray-300">
                    Cross-chain • DAO governance • Developer bounties • Moon mission
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 border-3 border-white rounded-xl p-8 transform hover:scale-105 transition-all duration-300 relative">
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
                <div className="font-mono text-4xl whitespace-pre text-white">{'   🎉\n  /|\\\n  / \\'}</div>
              </div>
              <h3 className="text-3xl font-bold mb-4 mt-8">Join the Degen Revolution</h3>
              <p className="text-xl mb-6">
                First anon crypto communication platform that actually works! 
              </p>
              <div className="flex justify-center gap-4 flex-wrap">
                <a 
                  href="https://pump.fun" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-yellow-400 text-black border-3 border-black py-3 px-6 font-bold rounded-xl hover:scale-110 transition-all duration-300 interactive-btn"
                >
                  🎯 Buy $DMDEV (pump.fun)
                </a>
                <a 
                  href="https://x.com/DMthedevs" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-blue-400 text-white border-3 border-black py-3 px-6 font-bold rounded-xl hover:scale-110 transition-all duration-300 interactive-btn"
                >
                  🐦 Follow the Chaos
                </a>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-12 text-center text-gray-400 text-xs border-t border-white/20 pt-8">
            <div className="flex justify-center mb-4">
              <div className="font-mono text-2xl whitespace-pre">{'   ⚠️\n  /|\\\n  / \\'}</div>
            </div>
            <p className="mb-2">
              <strong>Disclaimer:</strong> $DMDEV is a utility token for the DM the DEV platform. 
              DYOR and invest responsibly. Not financial advice, just building cool encrypted messaging tech.
            </p>
            <p className="text-gray-500">
              Built with ❤️ and too much caffeine • Powered by pump.fun • Secured by actual cryptography
            </p>
          </div>
        </div>
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