import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

// Create Supabase client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export interface Message {
  id: string;
  sender_address: string;
  recipient_address: string;
  ciphertext: string;
  nonce: string;
  ephemeral_public_key: string;
  created_at: string;
}

export interface RecipientKey {
  wallet_address: string;
  derived_pubkey: string;
  created_at: string;
}

/**
 * 🔑 Store or update a recipient's derived public key
 */
export async function upsertRecipientKey(walletAddress: string, derivedPubkey: string): Promise<{ error: any }> {
  try {
    console.log("💾 Storing recipient key for:", walletAddress);
    
    const { error } = await supabase
      .from('recipient_keys')
      .upsert({ 
        wallet_address: walletAddress, 
        derived_pubkey: derivedPubkey 
      });

    if (error) {
      console.error("❌ Error storing recipient key:", error);
      return { error };
    }

    console.log("✅ Successfully stored recipient key");
    return { error: null };
  } catch (err) {
    console.error("❌ Exception storing recipient key:", err);
    return { error: err };
  }
}

/**
 * 🔍 Get a recipient's derived public key
 */
export async function getRecipientKey(walletAddress: string): Promise<{ data: RecipientKey | null; error: any }> {
  try {
    console.log("🔍 Fetching recipient key for:", walletAddress);
    
    const { data, error } = await supabase
      .from('recipient_keys')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error("❌ Error fetching recipient key:", error);
      return { data: null, error };
    }

    if (!data) {
      console.warn("⚠️ No recipient key found for:", walletAddress);
      return { data: null, error: null };
    }

    console.log("✅ Found recipient key:", data.derived_pubkey);
    return { data, error: null };
  } catch (err) {
    console.error("❌ Exception fetching recipient key:", err);
    return { data: null, error: err };
  }
}

/**
 * 📤 Store an encrypted message
 */
export async function storeMessage(
  senderAddress: string,
  recipientAddress: string,
  ciphertext: string,
  nonce: string,
  ephemeralPublicKey: string
): Promise<{ error: any }> {
  try {
    console.log("💾 Storing encrypted message...");
    
    // Validate base64 encoding
    if (!isBase64(ciphertext) || !isBase64(nonce) || !isBase64(ephemeralPublicKey)) {
      throw new Error("All encrypted data must be valid base64");
    }

    const { error } = await supabase
      .from('messages')
      .insert({
        sender_address: senderAddress,
        recipient_address: recipientAddress,
        ciphertext,
        nonce,
        ephemeral_public_key: ephemeralPublicKey,
      });

    if (error) {
      console.error("❌ Error storing message:", error);
      return { error };
    }

    console.log("✅ Message stored successfully");
    return { error: null };
  } catch (err) {
    console.error("❌ Exception storing message:", err);
    return { error: err };
  }
}

/**
 * 📥 Get messages for a wallet address (sent or received)
 */
export async function getMessages(walletAddress: string): Promise<{ data: Message[]; error: any }> {
  try {
    console.log("📥 Fetching messages for:", walletAddress);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_address.eq.${walletAddress},recipient_address.eq.${walletAddress}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("❌ Error fetching messages:", error);
      return { data: [], error };
    }

    console.log(`✅ Fetched ${data?.length || 0} messages for ${walletAddress}`);
    return { data: data || [], error: null };
  } catch (err) {
    console.error("❌ Exception fetching messages:", err);
    return { data: [], error: err };
  }
}

// Helper function to validate base64
function isBase64(str: string): boolean {
  if (!str) return false;
  try {
    return btoa(atob(str)) === str;
  } catch {
    return false;
  }
} 