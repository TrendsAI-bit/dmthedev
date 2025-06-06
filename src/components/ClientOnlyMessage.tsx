import { useEffect, useState } from 'react';
import { decryptMessage, EncryptedData } from '@/utils/encryption';

interface ClientOnlyMessageProps {
  encryptedData: EncryptedData;
  wallet: any;
  recipientAddress: string;
}

export default function ClientOnlyMessage({ encryptedData, wallet, recipientAddress }: ClientOnlyMessageProps) {
  const [decrypted, setDecrypted] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(true);

  useEffect(() => {
    async function decrypt() {
      if (!encryptedData || !wallet || !recipientAddress) {
        setDecrypted('[Missing decryption data]');
        setIsDecrypting(false);
        return;
      }

      try {
        setIsDecrypting(true);
        const result = await decryptMessage(encryptedData, wallet, recipientAddress);
        setDecrypted(result);
      } catch (e) {
        console.error('Decryption error:', e);
        setDecrypted(`[❌ Decryption failed: ${e instanceof Error ? e.message : 'Unknown error'}]`);
      } finally {
        setIsDecrypting(false);
      }
    }

    decrypt();
  }, [encryptedData, wallet, recipientAddress]);

  if (typeof window === 'undefined') return null;
  
  if (isDecrypting) {
    return (
      <div className="mt-2 p-3 rounded-lg text-sm break-all bg-blue-50 text-blue-800">
        [🔄 Decrypting...]
      </div>
    );
  }

  // Handle different message types
  const isError = decrypted.startsWith('[❌');
  const isBinary = decrypted.startsWith('[Binary data]') || decrypted.startsWith('[Encoded data]');
  const isJson = !isError && !isBinary && (decrypted.startsWith('{') || decrypted.startsWith('['));

  // Select style based on content type
  const style = isError ? 'bg-red-50 text-red-600' 
    : isBinary ? 'bg-yellow-50 text-yellow-800'
    : isJson ? 'bg-blue-50 text-blue-800'
    : 'bg-gray-100';

  // Additional classes for different content types
  const additionalClasses = (isBinary || isJson) ? 'font-mono whitespace-pre-wrap' : '';

  return (
    <div className={`mt-2 p-3 rounded-lg text-sm break-all ${style} ${additionalClasses}`}>
      {decrypted}
    </div>
  );
} 