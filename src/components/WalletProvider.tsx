'use client';

import { FC, ReactNode, useMemo, useCallback } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { WalletError } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';

const HELIUS_RPC = process.env.NEXT_PUBLIC_HELIUS_RPC || 'https://mainnet.helius-rpc.com/?api-key=7c8a804a-bb84-4963-b03b-421a5d39c887';

interface Props {
  children: ReactNode;
}

export const ClientWalletProvider: FC<Props> = ({ children }) => {
  // Empty wallets array since we're using Wallet Standard
  const wallets = useMemo(() => [], []);

  const onError = useCallback(
    (error: WalletError) => {
      console.error('Wallet error:', error);
      alert(`Wallet error: ${error.message}`);
    },
    []
  );

  return (
    <ConnectionProvider endpoint={HELIUS_RPC}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect={true}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}; 