'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { deriveKeypairFromWallet } from '@/utils/encryption';
import { upsertRecipientKey, getRecipientKey } from '@/utils/supabase';
import bs58 from 'bs58';

interface KeyDerivationProps {
  onKeyDerived?: (publicKey: string) => void;
}

export default function KeyDerivation({ onKeyDerived }: KeyDerivationProps) {
  const { wallet, connected, publicKey } = useWallet();
  const [derivedPublicKey, setDerivedPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  // Check for existing key on mount
  useEffect(() => {
    if (connected && publicKey) {
      checkExistingKey();
    }
  }, [connected, publicKey]);

  const checkExistingKey = async () => {
    if (!publicKey) return;
    
    try {
      const walletAddress = publicKey.toBase58();
      const { data, error } = await getRecipientKey(walletAddress);
      
      if (error) {
        console.error("Error checking existing key:", error);
        return;
      }

      if (data) {
        setDerivedPublicKey(data.derived_pubkey);
        setHasExistingKey(true);
        onKeyDerived?.(data.derived_pubkey);
        console.log("✅ Found existing recipient key:", data.derived_pubkey);
      }
    } catch (err) {
      console.error("Exception checking existing key:", err);
    }
  };

  const deriveAndStoreKey = async () => {
    if (!wallet || !connected || !publicKey) {
      setError("Wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log("🔑 Starting key derivation process...");
      
      // Derive the Ed25519 keypair
      const derivedKeypair = await deriveKeypairFromWallet(wallet);
      const derivedPubkeyBase58 = bs58.encode(derivedKeypair.publicKey);
      
      console.log("✅ Derived Ed25519 public key:", derivedPubkeyBase58);
      
      // Store in Supabase
      const walletAddress = publicKey.toBase58();
      const { error: storeError } = await upsertRecipientKey(walletAddress, derivedPubkeyBase58);
      
      if (storeError) {
        throw new Error(`Failed to store key: ${storeError.message}`);
      }
      
      setDerivedPublicKey(derivedPubkeyBase58);
      setHasExistingKey(true);
      onKeyDerived?.(derivedPubkeyBase58);
      
      console.log("✅ Successfully derived and stored recipient key");
      
    } catch (err: any) {
      console.error("❌ Key derivation failed:", err);
      setError(err.message || "Failed to derive key");
    } finally {
      setIsLoading(false);
    }
  };

  if (!connected) {
    return (
      <section className="section mb-8">
        <h2 className="section-title">[🔑] Your Messaging Key</h2>
        <div className="bg-[#ffe6e6] border-3 border-black rounded-xl p-5 -rotate-1">
          🔌 Connect your wallet to derive your messaging key [lock]
        </div>
      </section>
    );
  }

  return (
    <section className="section mb-8">
      <h2 className="section-title">[🔑] Your Messaging Key</h2>
      
      {hasExistingKey && derivedPublicKey ? (
        <div className="space-y-4">
          <div className="bg-[#e6ffe6] border-3 border-black rounded-xl p-5 rotate-1">
            <div className="font-bold mb-2">✅ Active Messaging Key [unlock]</div>
            <div className="bg-white border-2 border-black rounded p-3 font-comic text-sm break-all">
              <div className="text-xs mb-1">Derived Public Key:</div>
              <div className="font-mono text-xs">
                {derivedPublicKey}
              </div>
            </div>
            <div className="text-xs mt-2 italic">
              Others can now encrypt messages to you using this key! [mailbox]
            </div>
          </div>
          
          <button
            onClick={deriveAndStoreKey}
            disabled={isLoading}
            className="w-full bg-blue-100 border-3 border-black py-3 px-6 font-bold rounded-xl -rotate-[0.5deg] hover:animate-bounce-light disabled:opacity-50"
          >
            {isLoading ? "Regenerating... 🔄" : "🔄 Regenerate Key"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#fffacd] border-3 border-black rounded-xl p-5 -rotate-1">
            ⚠️ You need to derive your messaging key before others can send you encrypted messages! [warning]
          </div>
          
          <button
            onClick={deriveAndStoreKey}
            disabled={isLoading}
            className="w-full bg-white border-3 border-black py-4 px-6 font-bold rounded-xl rotate-[0.5deg] hover:animate-bounce-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "🔑 Deriving Key... [processing]" : "🔑 Derive Messaging Key [key]"}
          </button>
        </div>
      )}
      
      {error && (
        <div className="mt-4 bg-[#ffe6e6] border-3 border-black rounded-xl p-4 rotate-1">
          <div className="font-bold text-red-700">❌ {error} [error]</div>
        </div>
      )}
      
      <div className="mt-4 text-xs text-gray-600 font-comic -rotate-[0.3deg]">
        💡 <strong>How it works:</strong> Your messaging key is derived from your wallet signature 
        and stored publicly so others can encrypt messages to you. Your private key never leaves your wallet! [security]
      </div>
    </section>
  );
} 