import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientWalletProvider } from "@/components/WalletProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DM the DEV",
  description: "Send encrypted messages to token deployers on Solana",
  applicationName: "DM the DEV",
  keywords: ["Solana", "DeFi", "Messaging", "Crypto", "Token", "Developer"],
  authors: [{ name: "DM the DEV Team" }],
  themeColor: "#000000",
  viewport: "width=device-width, initial-scale=1",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  openGraph: {
    title: "DM the DEV",
    description: "Send encrypted messages to token deployers on Solana",
    url: "https://dmthedev.cloud",
    siteName: "DM the DEV",
    type: "website",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "DM the DEV Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "DM the DEV",
    description: "Send encrypted messages to token deployers on Solana",
    images: ["/icon-512.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="application-name" content="DM the DEV" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={inter.className}>
        <ClientWalletProvider>
          {children}
        </ClientWalletProvider>
      </body>
    </html>
  );
} 