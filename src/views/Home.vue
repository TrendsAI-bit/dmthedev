<template>
  <div class="max-w-4xl mx-auto">
    <div class="cartoon-border bg-white p-8 text-center">
      <h1 class="text-4xl font-comic font-bold text-primary mb-4">
        Welcome to DM the DEV! 👋
      </h1>
      <p class="text-lg text-text-secondary mb-8">
        Send encrypted messages directly to token deployers using your Solana wallet!
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="cartoon-border p-6 bg-accent/20">
          <h2 class="text-2xl font-comic font-bold mb-4">🔒 Secure Messaging</h2>
          <p>End-to-end encrypted communication with token deployers</p>
        </div>
        
        <div class="cartoon-border p-6 bg-secondary/20">
          <h2 class="text-2xl font-comic font-bold mb-4">👛 Wallet Authentication</h2>
          <p>Connect with your Solana wallet to get started</p>
        </div>
        
        <div class="cartoon-border p-6 bg-primary/20">
          <h2 class="text-2xl font-comic font-bold mb-4">🔍 Token Search</h2>
          <p>Find and message any token deployer on Pump.fun</p>
        </div>
        
        <div class="cartoon-border p-6 bg-accent/20">
          <h2 class="text-2xl font-comic font-bold mb-4">💬 Real-time Chat</h2>
          <p>Instant messaging with read receipts and notifications</p>
        </div>
      </div>

      <div class="mt-12">
        <router-link 
          to="/login"
          class="btn-primary text-lg"
        >
          Get Started! 🚀
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Component logic here
</script> 