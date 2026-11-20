import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { app, useEmulator } from '../shared/firebase'

// Admin-only: keeps the Auth SDK out of the public display bundle (SEC-001).
export const auth = getAuth(app)

if (useEmulator) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
