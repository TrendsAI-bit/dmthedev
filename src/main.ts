import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './assets/styles/main.css'
import { useAuthStore } from './stores/auth'

// Import views
import Home from './views/Home.vue'
import Login from './views/Login.vue'
import Chat from './views/Chat.vue'

console.log('Starting application initialization...')

// Create router instance
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/login',
      name: 'login',
      component: Login
    },
    {
      path: '/chat/:tokenAddress',
      name: 'chat',
      component: Chat,
      meta: { requiresAuth: true }
    }
  ]
})

// Create pinia instance first
const pinia = createPinia()

// Navigation guard
router.beforeEach((to, from, next) => {
  console.log('Route navigation:', { to, from })
  try {
    const authStore = useAuthStore()
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      next('/login')
    } else {
      next()
    }
  } catch (error) {
    console.error('Navigation guard error:', error)
    next()
  }
})

// Create and mount app
try {
  console.log('Creating Vue app...')
  const app = createApp(App)

  app.use(pinia)  // Install pinia before using stores
  app.use(router)
  
  // Error handler
  app.config.errorHandler = (err, vm, info) => {
    console.error('Global error:', err)
    console.error('Component:', vm)
    console.error('Error info:', info)
  }

  console.log('Mounting app...')
  app.mount('#app')
  console.log('App mounted successfully')
} catch (error) {
  console.error('Failed to initialize app:', error)
} 