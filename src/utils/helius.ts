import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=7c8a804a-bb84-4963-b03b-421a5d39c887";

export const connection = new Connection(HELIUS_RPC, "confirmed");

export async function getTokenData(mintAddress: string) {
  try {
    // Ensure mintAddress is properly formatted (base58, 44 characters)
    const cleanMintAddress = mintAddress.trim();
    
    // Fetch token asset data
    const assetResponse = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'asset-lookup',
        method: 'getAsset',
        params: [cleanMintAddress],
      }),
    });

    const assetData = await assetResponse.json();
    
    if (assetData.error) {
      throw new Error(assetData.error.message);
    }

    const creator = assetData.result?.creators?.[0]?.address;
    
    // If we have a creator, fetch their SOL balance and token count
    let creatorSolBalance = null;
    let tokensLaunched = null;
    
    if (creator) {
      try {
        // Fetch SOL balance
        const balance = await connection.getBalance(new PublicKey(creator));
        creatorSolBalance = balance / LAMPORTS_PER_SOL;

        // Use Helius transactions API to count token mints (initializeMint instructions)
        const transactionsResponse = await fetch(`https://api.helius.xyz/v0/addresses/${creator}/transactions?api-key=7c8a804a-bb84-4963-b03b-421a5d39c887&limit=1000&type=ALL`);
        
        if (transactionsResponse.ok) {
          const transactionsData = await transactionsResponse.json();
          
          let mintCount = 0;
          
          if (Array.isArray(transactionsData)) {
            transactionsData.forEach((tx: any) => {
              tx?.instructions?.forEach((ix: any) => {
                if (
                  ix.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
                  ix.parsed?.type === "initializeMint"
                ) {
                  mintCount++;
                }
              });
            });
          }
          
          tokensLaunched = mintCount;
          console.log(`Found ${tokensLaunched} token mints by ${creator}`);
        } else {
          console.error('Failed to fetch transactions:', transactionsResponse.status);
        }
      } catch (error) {
        console.error('Error fetching creator data:', error);
      }
    }

    // Fetch token price data from Jupiter API with properly formatted address
    let marketCap = null;
    try {
      // Ensure the token address is valid base58 before calling Jupiter
      if (cleanMintAddress.length >= 32 && cleanMintAddress.length <= 44) {
        const jupiterResponse = await fetch(`https://price.jup.ag/v4/price?ids=${cleanMintAddress}`);
        const priceData = await jupiterResponse.json();
        const price = priceData.data[cleanMintAddress]?.price;
        if (price) {
          marketCap = price;
        }
      } else {
        console.warn('Invalid token address format for Jupiter API:', cleanMintAddress);
      }
    } catch (error) {
      console.error('Error fetching price data:', error);
    }

    return {
      success: true,
      data: assetData.result,
      creator: creator || null,
      creatorSolBalance,
      tokensLaunched,
      name: assetData.result?.content?.metadata?.name || 'Unknown Token',
      symbol: assetData.result?.content?.metadata?.symbol || '???',
      marketCap,
    };
  } catch (error) {
    console.error('Error fetching token data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null,
      creator: null,
      creatorSolBalance: null,
      tokensLaunched: null,
      name: null,
      symbol: null,
      marketCap: null,
    };
  }
} 