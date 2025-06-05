-- Drop existing tables and functions if they exist
DROP TABLE IF EXISTS messages CASCADE;
DROP FUNCTION IF EXISTS is_base64 CASCADE;
DROP FUNCTION IF EXISTS validate_nonce CASCADE;
DROP FUNCTION IF EXISTS validate_public_key CASCADE;

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add function to validate base64
CREATE OR REPLACE FUNCTION is_base64(str text) RETURNS boolean AS $$
BEGIN
    -- Base64 validation regex
    RETURN str ~ '^[A-Za-z0-9+/]*={0,2}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add function to validate nonce length after base64 decode
CREATE OR REPLACE FUNCTION validate_nonce(encoded text) RETURNS boolean AS $$
DECLARE
    decoded bytea;
BEGIN
    -- Try to decode base64
    BEGIN
        decoded := decode(encoded, 'base64');
        -- Check if decoded length is 24 bytes (TweetNaCl nonce length)
        RETURN length(decoded) = 24;
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add function to validate public key length after base64 decode
CREATE OR REPLACE FUNCTION validate_public_key(encoded text) RETURNS boolean AS $$
DECLARE
    decoded bytea;
BEGIN
    -- Try to decode base64
    BEGIN
        decoded := decode(encoded, 'base64');
        -- Check if decoded length is 32 bytes (TweetNaCl public key length)
        RETURN length(decoded) = 32;
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create messages table with proper constraints
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    to_address TEXT NOT NULL CHECK (length(to_address) > 0),
    from_address TEXT NOT NULL CHECK (length(from_address) > 0),
    ciphertext TEXT NOT NULL CHECK (
        length(ciphertext) > 0 AND 
        is_base64(ciphertext)
    ),
    nonce TEXT NOT NULL CHECK (
        is_base64(nonce) AND 
        validate_nonce(nonce)
    ),
    ephemeral_public_key TEXT NOT NULL CHECK (
        is_base64(ephemeral_public_key) AND 
        validate_public_key(ephemeral_public_key)
    ),
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
    is_base64(ciphertext) AND
    validate_nonce(nonce) AND
    validate_public_key(ephemeral_public_key) AND
    tip_amount >= 0
);

-- Create policy to allow anyone to read messages
CREATE POLICY "Allow anyone to read messages"
ON messages FOR SELECT
TO public
USING (true);

-- Add trigger to validate data before insert
CREATE OR REPLACE FUNCTION validate_message_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate base64 encoding and lengths
    IF NOT is_base64(NEW.ciphertext) THEN
        RAISE EXCEPTION 'Invalid base64 encoding in ciphertext';
    END IF;
    
    IF NOT (is_base64(NEW.nonce) AND validate_nonce(NEW.nonce)) THEN
        RAISE EXCEPTION 'Invalid nonce format or length';
    END IF;
    
    IF NOT (is_base64(NEW.ephemeral_public_key) AND validate_public_key(NEW.ephemeral_public_key)) THEN
        RAISE EXCEPTION 'Invalid public key format or length';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_message_before_insert
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION validate_message_data(); 