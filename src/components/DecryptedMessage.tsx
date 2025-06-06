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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    async function handleDecrypt() {
      if (!encryptedData || !wallet || !recipientAddress) {
        setError("[Missing data] Required decryption data not available");
        return;
      }

      try {
        console.log("🔄 Starting decryption process in component");
        const decryptedUint8Array = await decryptMessage(encryptedData, wallet, recipientAddress);
        
        let result: string;
        try {
          result = new TextDecoder("utf-8", { fatal: true }).decode(decryptedUint8Array);
          console.log("✅ Successfully decoded as UTF-8");
        } catch (e) {
          console.warn("⚠️ UTF-8 decoding failed, returning as base64");
          // Fallback to base64 for binary data
          const B64_CHUNK_SIZE = 8192;
          let base64 = "";
          for (let i = 0; i < decryptedUint8Array.length; i += B64_CHUNK_SIZE) {
              base64 += String.fromCharCode.apply(
                  null,
                  Array.from(decryptedUint8Array.subarray(i, i + B64_CHUNK_SIZE))
              );
          }
          result = btoa(base64);
        }

        setOutput(result);
        
      } catch (err) {
        console.error("[Component Decryption Error]", err);
        setError(`[❌ Decryption failed] ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    handleDecrypt();
  }, [mounted, encryptedData, wallet, recipientAddress]);

  if (!mounted) {
    return (
      <div className="mt-2 p-3 rounded-lg text-sm break-all bg-blue-50 text-blue-800">
        [🔄 Initializing decryption...]
      </div>
    );
  }
  
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
  
  // Sanitize for rendering
  const isJson = (output.startsWith('{') && output.endsWith('}')) || (output.startsWith('[') && output.endsWith(']'));
  let displayOutput = output;
  let style = 'bg-gray-100';

  if (isJson) {
      try {
          // Format JSON nicely
          displayOutput = JSON.stringify(JSON.parse(output), null, 2);
          style = 'bg-blue-50 text-blue-800 font-mono';
      } catch (e) {
          // Not valid JSON, treat as text
      }
  } else if (/[^\x20-\x7E\n\r]/.test(output)) {
      // If it contains non-printable characters, it might be base64 binary
      style = 'bg-yellow-50 text-yellow-800 font-mono';
      displayOutput = `[Binary Data - Base64]\n${output}`;
  }


  return (
    <div className={`mt-2 p-3 rounded-lg text-sm break-all ${style}`}>
      <pre className="whitespace-pre-wrap break-all">
        {displayOutput}
      </pre>
    </div>
  );
} 