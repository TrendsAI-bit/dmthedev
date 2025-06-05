<template>
  <div class="max-w-4xl mx-auto">
    <div class="cartoon-border bg-white p-6">
      <!-- Chat Header -->
      <div class="flex items-center justify-between mb-6 pb-4 border-b-2 border-dashed border-primary/30">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            👨‍💻
          </div>
          <div>
            <h2 class="text-xl font-comic font-bold">{{ truncateAddress(tokenDeployer) }}</h2>
            <p class="text-sm text-text-secondary">Token Deployer</p>
          </div>
        </div>
        <div class="text-sm text-text-secondary">
          {{ isOnline ? '🟢 Online' : '⚪️ Offline' }}
        </div>
      </div>

      <!-- Messages Container -->
      <div 
        ref="messagesContainer"
        class="h-[400px] overflow-y-auto mb-6 space-y-4 p-4"
      >
        <template v-if="messages.length">
          <div 
            v-for="message in messages" 
            :key="message.id"
            :class="[
              'max-w-[70%] message-bubble',
              message.senderId === wallet ? 'ml-auto bg-primary/10' : 'mr-auto bg-secondary/10'
            ]"
          >
            <p class="mb-1">{{ message.content }}</p>
            <span class="text-xs text-text-secondary">
              {{ formatTime(message.timestamp) }}
              <span v-if="message.isRead && message.senderId === wallet">
                ✓✓
              </span>
            </span>
          </div>
        </template>
        <div v-else class="text-center text-text-secondary py-8">
          No messages yet. Start the conversation! 💭
        </div>
      </div>

      <!-- Message Input -->
      <div class="cartoon-border p-4 bg-accent/10">
        <form @submit.prevent="sendMessage" class="flex gap-2">
          <input 
            v-model="newMessage"
            type="text"
            placeholder="Type your message..."
            class="input-field flex-1"
            :disabled="loading"
          >
          <button 
            type="submit"
            class="btn-primary"
            :disabled="!newMessage.trim() || loading"
          >
            <span v-if="loading" class="wiggle-animation">
              📨
            </span>
            <span v-else>
              Send 📬
            </span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { storeToRefs } from 'pinia'
import { db } from '../config/firebase'
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { encrypt } from '../utils/encryption'

const route = useRoute()
const authStore = useAuthStore()
const { wallet } = storeToRefs(authStore)

const tokenDeployer = ref(route.params.tokenAddress as string)
const messages = ref<any[]>([])
const newMessage = ref('')
const loading = ref(false)
const isOnline = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

// Subscribe to messages
onMounted(() => {
  const q = query(
    collection(db, 'messages'),
    where('participants', 'array-contains', wallet.value),
    orderBy('timestamp', 'asc')
  )

  const unsubscribe = onSnapshot(q, (snapshot) => {
    messages.value = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    scrollToBottom()
  })

  // Cleanup
  return () => unsubscribe()
})

// Auto scroll on new messages
watch(messages, scrollToBottom, { deep: true })

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function sendMessage() {
  if (!newMessage.value.trim()) return

  try {
    loading.value = true
    const encryptedContent = await encrypt(newMessage.value, tokenDeployer.value)
    
    await addDoc(collection(db, 'messages'), {
      content: newMessage.value,
      encryptedContent,
      senderId: wallet.value,
      receiverId: tokenDeployer.value,
      timestamp: serverTimestamp(),
      isRead: false,
      participants: [wallet.value, tokenDeployer.value]
    })

    newMessage.value = ''
  } catch (error) {
    console.error('Error sending message:', error)
  } finally {
    loading.value = false
  }
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatTime(timestamp: any): string {
  if (!timestamp) return ''
  const date = timestamp.toDate()
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script> 