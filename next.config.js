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

    // Always use development version of React
    config.resolve.alias = {
      ...config.resolve.alias,
      'react': 'react/profiling',
      'react-dom': 'react-dom/profiling',
      'scheduler/tracing': 'scheduler/tracing-profiling',
    };

    return config;
  },
}

module.exports = nextConfig 