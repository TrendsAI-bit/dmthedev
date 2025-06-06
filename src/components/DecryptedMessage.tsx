"use client";

import { useEffect, useState } from "react";
import { decryptMessage, EncryptedData } from '@/utils/encryption';

interface Props {
  encryptedData: EncryptedData;
  wallet: any;
  senderAddress?: string;
}

export default function DecryptedMessage({ encryptedData, wallet, senderAddress }: Props) {
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    async function handleDecrypt() {
      if (!encryptedData || !wallet?.adapter) {
        setError("[Missing data] Required decryption data or wallet adapter not available");
        return;
      }

      try {
        console.log("🔄 Starting decryption process in component");
        const decryptedUint8Array = await decryptMessage(encryptedData, wallet.adapter);
        
        // --- DETAILED DEBUG LOGS ---
        console.log("Decrypted raw bytes:", decryptedUint8Array);
        const hex = Array.from(decryptedUint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log("Hex:", hex);
        try {
            const B64_CHUNK_SIZE = 8192;
            let base64 = "";
            for (let i = 0; i < decryptedUint8Array.length; i += B64_CHUNK_SIZE) {
                base64 += String.fromCharCode.apply(
                    null,
                    Array.from(decryptedUint8Array.subarray(i, i + B64_CHUNK_SIZE))
                );
            }
            console.log("Base64 fallback:", btoa(base64));
        } catch(e) {
            console.error("Base64 conversion failed", e);
        }
        // --- END DEBUG LOGS ---

        let result: string;
        try {
          // First, always try to decode the raw bytes as a UTF-8 string.
          const decodedText = new TextDecoder("utf-8", { fatal: true }).decode(decryptedUint8Array);
          console.log("✅ Successfully decoded raw bytes to string");

          try {
            // If decoding succeeds, check if it's our versioned JSON.
            const parsed = JSON.parse(decodedText);
            if (parsed && parsed.v === 2 && typeof parsed.data === 'string') {
              console.log("✅ Decoded v2 message format");
              result = parsed.data; // It's our new format, just use the data.
            } else {
              result = decodedText; // It's some other JSON, show it all.
            }
          } catch (e) {
            // It's not JSON, so it's likely a legacy plaintext message.
            console.log("ℹ️ Decoded legacy plaintext message");
            result = decodedText;
          }
        } catch (e) {
          console.warn("⚠️ UTF-8 decoding failed, falling back to base64");
          // This happens if the decrypted data is not valid text.
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

        setOutput(result);
        
      } catch (err) {
        console.error("[Component Decryption Error]", err);
        setError(`[❌ Decryption failed] ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    handleDecrypt();
  }, [mounted, encryptedData, wallet]);

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

  if (output.startsWith('[Raw Binary Data]')) {
    style = 'bg-yellow-50 text-yellow-800 font-mono';
    displayOutput = output;
  } else if (isJson) {
      try {
          displayOutput = JSON.stringify(JSON.parse(output), null, 2);
          style = 'bg-blue-50 text-blue-800 font-mono';
      } catch (e) {
          // Not valid JSON, treat as text
      }
  }


  return (
    <div className={`mt-2 p-3 rounded-lg text-sm break-all ${style}`}>
      <pre className="whitespace-pre-wrap break-all">
        {displayOutput}
      </pre>
    </div>
  );
} 