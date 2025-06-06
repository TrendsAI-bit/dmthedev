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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-700">🔌 Connect your wallet to derive your messaging key</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        🔑 Your Messaging Key
      </h3>
      
      {hasExistingKey && derivedPublicKey ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-700 font-medium mb-2">✅ Active Messaging Key</p>
            <div className="bg-white border rounded p-3">
              <p className="text-xs text-gray-500 mb-1">Derived Public Key:</p>
              <p className="font-mono text-sm break-all text-gray-900">
                {derivedPublicKey}
              </p>
            </div>
            <p className="text-xs text-green-600 mt-2">
              Others can now encrypt messages to you using this key
            </p>
          </div>
          
          <button
            onClick={deriveAndStoreKey}
            disabled={isLoading}
            className="w-full px-4 py-2 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {isLoading ? "Regenerating..." : "🔄 Regenerate Key"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-700">
              ⚠️ You need to derive your messaging key before others can send you encrypted messages.
            </p>
          </div>
          
          <button
            onClick={deriveAndStoreKey}
            disabled={isLoading}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "🔑 Deriving Key..." : "🔑 Derive Messaging Key"}
          </button>
        </div>
      )}
      
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">❌ {error}</p>
        </div>
      )}
      
      <div className="mt-4 text-xs text-gray-500">
        <p>
          💡 <strong>How it works:</strong> Your messaging key is derived from your wallet signature 
          and stored publicly so others can encrypt messages to you. Your private key never leaves your wallet.
        </p>
      </div>
    </div>
  );
} 