import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/base.css'
import { AdminApp } from './AdminApp'
import './admin.css'

createRoot(document.getElementById('root')!).render(<StrictMode><AdminApp /></StrictMode>)
