import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// Each variable is referenced individually: using the env object as a whole would make
// Vite inline every VITE_* value (including the scorer email) into the public bundle.
// Auth lives in src/admin/auth.ts so the display page never ships it.
export const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true'

export const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })

export const db = getFirestore(app)

if (useEmulator) connectFirestoreEmulator(db, '127.0.0.1', 8080)
