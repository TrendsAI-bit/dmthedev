import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=7c8a804a-bb84-4963-b03b-421a5d39c887";

export const connection = new Connection(HELIUS_RPC, "confirmed");

export async function getTokenData(mintAddress: string) {
  try {
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
        params: [mintAddress],
      }),
    });

    const assetData = await assetResponse.json();
    
    if (assetData.error) {
      throw new Error(assetData.error.message);
    }

    const creator = assetData.result?.creators?.[0]?.address;
    
    // If we have a creator, fetch their SOL balance
    let creatorSolBalance = null;
    if (creator) {
      try {
        const balance = await connection.getBalance(new PublicKey(creator));
        creatorSolBalance = balance / LAMPORTS_PER_SOL;
      } catch (error) {
        console.error('Error fetching creator balance:', error);
      }
    }

    // Fetch token price data from Jupiter API
    let marketCap = null;
    try {
      const jupiterResponse = await fetch(`https://price.jup.ag/v4/price?ids=${mintAddress}`);
      const priceData = await jupiterResponse.json();
      const price = priceData.data[mintAddress]?.price;
      if (price) {
        marketCap = price;  // Just show the price instead of market cap since we removed supply
      }
    } catch (error) {
      console.error('Error fetching price data:', error);
    }

    return {
      success: true,
      data: assetData.result,
      creator: creator || null,
      creatorSolBalance,
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
      name: null,
      symbol: null,
      marketCap: null,
    };
  }
} 