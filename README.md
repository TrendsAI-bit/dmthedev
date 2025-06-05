# DM the DEV

A cartoonish-style web app that allows users to send end-to-end encrypted messages directly to token deployers using their Solana wallet for authentication and encryption.

## Features

- 🔒 End-to-end encrypted messaging
- 👛 Solana wallet authentication
- 🎨 Playful, cartoonish UI design
- 💬 Real-time chat functionality
- 📱 Fully responsive design

## Tech Stack

- Vue 3 + TypeScript
- Tailwind CSS
- Firebase (Auth & Firestore)
- Solana Web3.js
- TweetNaCl.js for encryption

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dmthedev.git
cd dmthedev
```

2. Install dependencies:
```bash
npm install
```

3. Create a Firebase project and update the configuration in `src/config/firebase.ts`

4. Start the development server:
```bash
npm run dev
```

## Building for Production

```bash
npm run build
```

## Deployment

The project is configured for deployment on Vercel. Simply push to the main branch to trigger a deployment.

## License

MIT 