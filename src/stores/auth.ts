import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Connection, PublicKey } from '@solana/web3.js'
import { auth } from '../config/firebase'
import { signInWithCustomToken, signOut } from 'firebase/auth'

export const useAuthStore = defineStore('auth', () => {
  const wallet = ref<string | null>(null)
  const isAuthenticated = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Initialize Solana connection
  const connection = new Connection('https://api.mainnet-beta.solana.com')

  async function connectWallet() {
    try {
      loading.value = true
      error.value = null

      // Check if Phantom is installed
      const provider = (window as any).solana
      if (!provider) {
        throw new Error('Please install Phantom wallet!')
      }

      // Request wallet connection
      const resp = await provider.connect()
      wallet.value = resp.publicKey.toString()
      
      // Get a custom token from your backend
      // This is where you'd typically make an API call to your backend
      // const token = await getCustomToken(wallet.value)
      // await signInWithCustomToken(auth, token)
      
      isAuthenticated.value = true
    } catch (err: any) {
      error.value = err.message
      console.error('Failed to connect wallet:', err)
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await signOut(auth)
      wallet.value = null
      isAuthenticated.value = false
    } catch (err: any) {
      console.error('Failed to logout:', err)
    }
  }

  return {
    wallet,
    isAuthenticated,
    loading,
    error,
    connectWallet,
    logout
  }
}) 