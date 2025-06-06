import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    // This will now only be thrown when the function is called, not during build time.
    throw new Error('Supabase URL and Key are not set in environment variables.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseKey);
  return supabaseInstance;
}

export interface EncryptedMessage {
  id?: string;
  senderAddress: string;
  recipientAddress: string;
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
  createdAt?: string;
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
      validateBase64(message.ephemeralPublicKey, 'Ephemeral public key');
    } catch (e) {
      console.error('Base64 validation failed:', e);
      throw e;
    }

    // Validate addresses
    if (!message.senderAddress || !message.recipientAddress) {
      throw new Error('Sender and recipient addresses are required');
    }

    // Log successful validation
    console.log('✅ All components validated');

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('messages')
      .insert({
        sender_address: message.senderAddress,
        recipient_address: message.recipientAddress,
        ciphertext: message.ciphertext,
        nonce: message.nonce,
        ephemeral_public_key: message.ephemeralPublicKey
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

export async function fetchMessagesForDeployer(recipientAddress: string): Promise<EncryptedMessage[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('recipient_address', recipientAddress)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching messages:', error);
      throw new Error(error.message);
    }

    // Log fetched messages for verification
    console.log(`✅ Fetched ${data?.length || 0} messages for ${recipientAddress}`);

    return (data || []).map(msg => ({
      id: msg.id,
      senderAddress: msg.sender_address,
      recipientAddress: msg.recipient_address,
      ciphertext: msg.ciphertext,
      nonce: msg.nonce,
      ephemeralPublicKey: msg.ephemeral_public_key,
      createdAt: msg.created_at
    }));
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    throw error;
  }
} 