<template>
  <div class="max-w-md mx-auto">
    <div class="cartoon-border bg-white p-8 text-center">
      <h1 class="text-3xl font-comic font-bold text-primary mb-6">
        Connect Your Wallet 🦊
      </h1>
      
      <p class="text-lg text-text-secondary mb-8">
        To start messaging token deployers, connect your Solana wallet
      </p>

      <div v-if="error" class="mb-6 p-4 cartoon-border bg-red-100 text-red-700">
        {{ error }}
      </div>
      
      <button 
        @click="handleConnect" 
        :disabled="loading"
        class="btn-primary text-lg relative"
      >
        <span v-if="loading" class="wiggle-animation">
          Connecting... 🔄
        </span>
        <span v-else>
          Connect with Phantom 👻
        </span>
      </button>

      <div class="mt-8 text-sm text-text-secondary">
        <p>Don't have Phantom wallet?</p>
        <a 
          href="https://phantom.app/" 
          target="_blank"
          class="text-primary hover:underline"
        >
          Download it here
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '../stores/auth'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

const router = useRouter()
const authStore = useAuthStore()
const { loading, error } = storeToRefs(authStore)

async function handleConnect() {
  await authStore.connectWallet()
  if (authStore.isAuthenticated) {
    router.push('/')
  }
}
</script> 