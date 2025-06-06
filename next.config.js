/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_HELIUS_RPC: process.env.NEXT_PUBLIC_HELIUS_RPC || 'https://mainnet.helius-rpc.com/?api-key=7c8a804a-bb84-4963-b03b-421a5d39c887',
  },
  swcMinify: true,
  webpack: (config, { dev, isServer }) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Use development version of React only in development mode
    if (dev) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'react': 'react/dev',
        'react-dom': 'react-dom/dev',
      };
    }

    return config;
  },
}

module.exports = nextConfig 