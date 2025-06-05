import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDZVe3JU2n5YCQe1JvmxQxLvlXVdE1Qr4Q",
  authDomain: "dmthedev.firebaseapp.com",
  projectId: "dmthedev",
  storageBucket: "dmthedev.appspot.com",
  messagingSenderId: "724085987654",
  appId: "1:724085987654:web:8f9a3b5c6d4e2f1a0b9c8d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Custom types for the app
export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  encryptedContent: string;
  timestamp: Date;
  isRead: boolean;
}

export interface UserProfile {
  walletAddress: string;
  displayName?: string;
  avatar?: string;
  tokens?: string[];
  lastSeen?: Date;
} 