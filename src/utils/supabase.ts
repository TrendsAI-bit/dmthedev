import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with default RLS policies
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false
      },
      db: {
        schema: 'public'
      }
    })
  : null;

export interface EncryptedMessage {
  id?: string;
  to: string;
  from: string;
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
  tipAmount: number;
  txSig?: string;
  createdAt: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateBase64(str: string): boolean {
  try {
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
}

function validateMessage(message: EncryptedMessage): void {
  if (!message.to || !message.from) {
    throw new Error('Invalid addresses');
  }
  if (!validateBase64(message.ciphertext)) {
    throw new Error('Invalid ciphertext format');
  }
  if (!validateBase64(message.nonce)) {
    throw new Error('Invalid nonce format');
  }
  if (!validateBase64(message.ephemeralPublicKey)) {
    throw new Error('Invalid public key format');
  }
}

export async function uploadMessage(message: EncryptedMessage, retryCount = 0): Promise<any> {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please check your environment variables.');
  }

  try {
    // Validate message format
    validateMessage(message);

    // Convert camelCase to snake_case for database
    const dbMessage = {
      to_address: message.to.trim(),
      from_address: message.from.trim(),
      ciphertext: message.ciphertext,
      nonce: message.nonce,
      ephemeral_public_key: message.ephemeralPublicKey,
      tip_amount: message.tipAmount,
      tx_sig: message.txSig,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('messages')
      .insert([dbMessage])
      .select()
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      
      if (retryCount < MAX_RETRIES) {
        await wait(RETRY_DELAY * Math.pow(2, retryCount));
        return uploadMessage(message, retryCount + 1);
      }
      
      throw new Error(`Failed to save message: ${error.message}`);
    }

    // Convert snake_case back to camelCase for the response
    return {
      id: data.id,
      to: data.to_address,
      from: data.from_address,
      ciphertext: data.ciphertext,
      nonce: data.nonce,
      ephemeralPublicKey: data.ephemeral_public_key,
      tipAmount: data.tip_amount,
      txSig: data.tx_sig,
      createdAt: data.created_at
    };
  } catch (error) {
    console.error('Upload error:', error);
    
    if (retryCount < MAX_RETRIES) {
      await wait(RETRY_DELAY * Math.pow(2, retryCount));
      return uploadMessage(message, retryCount + 1);
    }
    
    throw error;
  }
}

export async function fetchMessagesForDeployer(deployerAddress: string): Promise<EncryptedMessage[]> {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please check your environment variables.');
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('to_address', deployerAddress.trim())
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    // Validate and convert data
    return data.map(msg => {
      const message = {
        id: msg.id,
        to: msg.to_address.trim(),
        from: msg.from_address.trim(),
        ciphertext: msg.ciphertext,
        nonce: msg.nonce,
        ephemeralPublicKey: msg.ephemeral_public_key,
        tipAmount: msg.tip_amount,
        txSig: msg.tx_sig,
        createdAt: msg.created_at
      };

      try {
        validateMessage(message);
      } catch (error) {
        console.error(`Invalid message format for ID ${msg.id}:`, error);
        return null;
      }

      return message;
    }).filter(Boolean) as EncryptedMessage[];
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
} 