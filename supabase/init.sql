-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    to_address TEXT NOT NULL,
    from_address TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    nonce TEXT NOT NULL,
    ephemeral_public_key TEXT NOT NULL,
    tip_amount NUMERIC DEFAULT 0,
    tx_sig TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_to_address ON messages(to_address);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Set up row level security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert
CREATE POLICY "Allow anyone to insert messages"
ON messages FOR INSERT
TO public
WITH CHECK (true);

-- Create policy to allow anyone to read messages
CREATE POLICY "Allow anyone to read messages"
ON messages FOR SELECT
TO public
USING (true); 