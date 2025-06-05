import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientWalletProvider } from "@/components/WalletProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DM the DEV",
  description: "Send encrypted messages to token deployers on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientWalletProvider>
          {children}
        </ClientWalletProvider>
      </body>
    </html>
  );
} 