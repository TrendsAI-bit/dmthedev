import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface EncryptedMessage {
  id?: string;
  to: string;
  from: string;
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
  tipAmount?: number;
  txSig?: string;
  createdAt?: string;
}

export async function uploadMessage(message: EncryptedMessage): Promise<void> {
  try {
    // Validate base64 encoding
    const isBase64 = (str: string) => /^[A-Za-z0-9+/]*={0,2}$/.test(str);
    
    // Log message components for verification
    console.log('Validating message components:');
    console.log('Ciphertext length:', message.ciphertext.length);
    console.log('Nonce length:', message.nonce.length);
    console.log('Public key length:', message.ephemeralPublicKey.length);
    
    if (!isBase64(message.ciphertext)) {
      throw new Error('Invalid base64 encoding in ciphertext');
    }
    if (!isBase64(message.nonce)) {
      throw new Error('Invalid base64 encoding in nonce');
    }
    if (!isBase64(message.ephemeralPublicKey)) {
      throw new Error('Invalid base64 encoding in ephemeral public key');
    }

    // Log successful validation
    console.log('✅ All components validated as base64');

    const { error } = await supabase
      .from('messages')
      .insert({
        to_address: message.to,
        from_address: message.from,
        ciphertext: message.ciphertext,
        nonce: message.nonce,
        ephemeral_public_key: message.ephemeralPublicKey,
        tip_amount: message.tipAmount || 0,
        tx_sig: message.txSig,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error uploading message:', error);
      throw new Error(error.message);
    }

    console.log('✅ Message uploaded successfully');
  } catch (error) {
    console.error('Failed to upload message:', error);
    throw error;
  }
}

export async function fetchMessagesForDeployer(address: string): Promise<EncryptedMessage[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('to_address', address)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching messages:', error);
      throw new Error(error.message);
    }

    // Log fetched messages for verification
    console.log(`✅ Fetched ${data?.length || 0} messages for ${address}`);

    return (data || []).map(msg => ({
      id: msg.id,
      to: msg.to_address,
      from: msg.from_address,
      ciphertext: msg.ciphertext,
      nonce: msg.nonce,
      ephemeralPublicKey: msg.ephemeral_public_key,
      tipAmount: msg.tip_amount,
      txSig: msg.tx_sig,
      createdAt: msg.created_at
    }));
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    throw error;
  }
} 