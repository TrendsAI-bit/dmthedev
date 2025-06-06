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

-- Create messages table with proper data types
CREATE TABLE messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    to_address TEXT NOT NULL,
    from_address TEXT NOT NULL,
    ciphertext TEXT NOT NULL CHECK (length(ciphertext) > 0),
    nonce TEXT NOT NULL CHECK (length(nonce) > 0),
    ephemeral_public_key TEXT NOT NULL CHECK (length(ephemeral_public_key) > 0),
    tip_amount DECIMAL(20, 9) DEFAULT 0,
    tx_sig TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Add constraints to ensure base64 format
    CONSTRAINT valid_ciphertext CHECK (ciphertext ~ '^[A-Za-z0-9+/]*={0,2}$'),
    CONSTRAINT valid_nonce CHECK (nonce ~ '^[A-Za-z0-9+/]*={0,2}$'),
    CONSTRAINT valid_ephemeral_public_key CHECK (ephemeral_public_key ~ '^[A-Za-z0-9+/]*={0,2}$'),
    
    -- Add indexes for better query performance
    CONSTRAINT valid_addresses CHECK (
        to_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' AND
        from_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    )
);

-- Create indexes for frequently queried columns
CREATE INDEX idx_messages_to_address ON messages(to_address);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Create RLS policies
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert messages
CREATE POLICY "Anyone can insert messages"
ON messages FOR INSERT
TO public
WITH CHECK (true);

-- Allow anyone to read messages
CREATE POLICY "Anyone can read messages"
ON messages FOR SELECT
TO public
USING (true);

-- Add comment to table
COMMENT ON TABLE messages IS 'Stores encrypted messages for DM the DEV application';

-- Verify table structure
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    column_default,
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name = 'messages';

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