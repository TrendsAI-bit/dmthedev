-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    to_address TEXT NOT NULL CHECK (length(to_address) > 0),
    from_address TEXT NOT NULL CHECK (length(from_address) > 0),
    ciphertext TEXT NOT NULL CHECK (length(ciphertext) > 0),
    nonce TEXT NOT NULL CHECK (length(nonce) > 0),
    ephemeral_public_key TEXT NOT NULL CHECK (length(ephemeral_public_key) > 0),
    tip_amount NUMERIC DEFAULT 0 CHECK (tip_amount >= 0),
    tx_sig TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_to_address ON messages(to_address);
CREATE INDEX IF NOT EXISTS idx_messages_from_address ON messages(from_address);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Set up row level security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert with validation
CREATE POLICY "Allow anyone to insert valid messages"
ON messages FOR INSERT
TO public
WITH CHECK (
    length(to_address) > 0 AND
    length(from_address) > 0 AND
    length(ciphertext) > 0 AND
    length(nonce) > 0 AND
    length(ephemeral_public_key) > 0 AND
    tip_amount >= 0
);

-- Create policy to allow anyone to read messages
CREATE POLICY "Allow anyone to read messages"
ON messages FOR SELECT
TO public
USING (true);

-- Add function to validate base64
CREATE OR REPLACE FUNCTION is_base64(str text) RETURNS boolean AS $$
BEGIN
    RETURN str ~ '^[A-Za-z0-9+/]*={0,2}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE; 