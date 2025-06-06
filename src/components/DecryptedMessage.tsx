"use client";

import { useEffect, useState } from "react";
import { decryptMessage, EncryptedData } from '@/utils/encryption';

interface Props {
  encryptedData: EncryptedData;
  wallet: any;
  recipientAddress: string;
}

export default function DecryptedMessage({ encryptedData, wallet, recipientAddress }: Props) {
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("✅ Component mounted, starting client-side decryption");
    
    async function handleDecrypt() {
      if (!encryptedData || !wallet || !recipientAddress) {
        setError("[Missing data] Required decryption data not available");
        return;
      }

      try {
        console.log("🔄 Starting decryption process");
        const result = await decryptMessage(encryptedData, wallet, recipientAddress);
        
        // Check if the result is already a formatted message
        if (result.startsWith('[')) {
          console.log("ℹ️ Received pre-formatted message");
          setOutput(result);
          return;
        }

        try {
          // Try parsing as JSON first
          const parsed = JSON.parse(result);
          console.log("✅ Successfully parsed JSON message");
          setOutput(JSON.stringify(parsed, null, 2));
        } catch {
          // Not JSON, use as plain text
          console.log("ℹ️ Using plain text message");
          setOutput(result);
        }
      } catch (err) {
        console.warn("[Decryption Warning]", err);
        setError(`[❌ Decryption failed] ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    handleDecrypt();
  }, [encryptedData, wallet, recipientAddress]);

  // Early return during SSR
  if (typeof window === 'undefined') {
    console.log("⚠️ Attempted server-side render, preventing");
    return null;
  }

  // Handle different states with appropriate styling
  if (error) {
    return (
      <div className="mt-2 p-3 rounded-lg text-sm break-all bg-red-50 text-red-600 font-mono">
        {error}
      </div>
    );
  }

  if (output === null) {
    return (
      <div className="mt-2 p-3 rounded-lg text-sm break-all bg-blue-50 text-blue-800">
        🔄 Decrypting message...
      </div>
    );
  }

  // Determine message type and styling
  const isBinary = output.startsWith('[Binary');
  const isJson = output.startsWith('{') || output.startsWith('[');
  
  const style = isBinary ? 'bg-yellow-50 text-yellow-800' 
    : isJson ? 'bg-blue-50 text-blue-800' 
    : 'bg-gray-100';

  return (
    <div className={`mt-2 p-3 rounded-lg text-sm break-all ${style} ${isJson ? 'font-mono whitespace-pre-wrap' : ''}`}>
      {output}
    </div>
  );
} 