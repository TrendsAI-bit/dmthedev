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

// Add function to check table structure
async function checkTableStructure() {
  try {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'messages');

    if (error) {
      console.error('Failed to check table structure:', error);
      return;
    }

    console.log('Table structure:', data);
    return data;
  } catch (error) {
    console.error('Error checking table structure:', error);
  }
}

// Add validation for base64 strings with proper error messages
function validateBase64(str: string, fieldName: string): boolean {
  if (!str) {
    throw new Error(`${fieldName} is empty`);
  }
  
  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) {
    throw new Error(`${fieldName} contains invalid base64 characters`);
  }
  
  // Check if length is valid (must be multiple of 4)
  if (str.length % 4 !== 0) {
    throw new Error(`${fieldName} has invalid length for base64`);
  }
  
  return true;
}

export async function uploadMessage(message: EncryptedMessage): Promise<void> {
  try {
    // Enhanced validation with better error messages
    console.log('Validating message components:');
    
    try {
      validateBase64(message.ciphertext, 'Ciphertext');
      validateBase64(message.nonce, 'Nonce');
      validateBase64(message.ephemeralPublicKey, 'Public key');
    } catch (e) {
      console.error('Base64 validation failed:', e);
      throw e;
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