<template>
  <div class="min-h-screen bg-gradient-to-br from-primary/20 to-secondary/20">
    <nav class="p-4 bg-white cartoon-border m-4">
      <div class="container mx-auto flex justify-between items-center">
        <router-link to="/" class="text-2xl font-bold font-comic text-primary hover:wiggle-animation">
          DM the DEV 💬
        </router-link>
        <div class="flex gap-4">
          <router-link 
            v-if="!isAuthenticated" 
            to="/login" 
            class="btn-primary"
          >
            Connect Wallet 🦊
          </router-link>
          <button 
            v-else 
            @click="logout" 
            class="btn-primary"
          >
            Disconnect 👋
          </button>
        </div>
      </div>
    </nav>

    <main class="container mx-auto p-4">
      <router-view></router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from './stores/auth'
import { storeToRefs } from 'pinia'

const authStore = useAuthStore()
const { isAuthenticated } = storeToRefs(authStore)
const { logout } = authStore
</script>

<style>
@import './assets/styles/main.css';
</style> 