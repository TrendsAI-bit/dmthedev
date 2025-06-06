"use client";

import { useEffect, useState } from "react";
import { decryptMessage, EncryptedData } from '@/utils/encryption';

interface Props {
  encryptedData: EncryptedData;
  wallet: any;
  recipientAddress: string;
}

// Custom hook to handle mounting state
const useHasMounted = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
};

// Safe text decoder that handles binary data
const safeDecodeMessage = (result: string): string => {
  if (!result) return "[Empty message]";
  
  // Check if already formatted
  if (result.startsWith('[') || result.startsWith('{')) {
    try {
      // Try parsing as JSON to validate
      JSON.parse(result);
      return result;
    } catch {
      // Not valid JSON, continue with other checks
    }
  }

  try {
    // Try parsing as base64 first
    const decoded = atob(result);
    try {
      // Try parsing decoded result as JSON
      const parsed = JSON.parse(decoded);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, return as text if it looks like text
      if (/^[\x20-\x7E]*$/.test(decoded)) {
        return decoded;
      }
      return `[Binary data - ${result.length} bytes]`;
    }
  } catch {
    // Not base64, try direct UTF-8 decoding
    try {
      const bytes = new TextEncoder().encode(result);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return decoded;
    } catch {
      // If all decoding fails, return as binary
      return `[Binary data - ${result.length} bytes]`;
    }
  }
};

export default function DecryptedMessage({ encryptedData, wallet, recipientAddress }: Props) {
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasMounted = useHasMounted();

  useEffect(() => {
    if (!hasMounted) return;

    console.log("✅ Component mounted, starting client-side decryption");
    
    async function handleDecrypt() {
      if (!encryptedData || !wallet || !recipientAddress) {
        setError("[Missing data] Required decryption data not available");
        return;
      }

      try {
        console.log("🔄 Starting decryption process");
        const result = await decryptMessage(encryptedData, wallet, recipientAddress);
        
        console.log("Decrypted Result Type:", typeof result);
        if (typeof result !== 'string') {
          console.warn("Unexpected result type:", result);
          setError("[Invalid data] Decryption returned non-string data");
          return;
        }

        const safeResult = safeDecodeMessage(result);
        console.log("✅ Message safely decoded");
        setOutput(safeResult);
        
      } catch (err) {
        console.warn("[Decryption Warning]", err);
        setError(`[❌ Decryption failed] ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    handleDecrypt();
  }, [encryptedData, wallet, recipientAddress, hasMounted]);

  // Early return during SSR or before mount
  if (!hasMounted) {
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