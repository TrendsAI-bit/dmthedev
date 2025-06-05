# DM the DEV

A fun and quirky web3 app that lets you send anonymous messages to token deployers. Built with Next.js, TypeScript, Tailwind CSS, and Web3Modal.

## Features

- 🎨 Playful, hand-drawn style UI
- 👻 Anonymous messaging system
- 🔍 Token deployer lookup
- 🦊 Web3 wallet integration
- 🔐 Encrypted messages

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file with your WalletConnect Project ID:
   ```
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deployment

The app is configured for deployment on Vercel. Simply:

1. Fork this repository
2. Create a new project on [Vercel](https://vercel.com)
3. Connect your forked repository
4. Add your `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` environment variable
5. Deploy!

## Built With

- [Next.js](https://nextjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Web3Modal](https://web3modal.com/)
- [wagmi](https://wagmi.sh/)

## License

MIT 