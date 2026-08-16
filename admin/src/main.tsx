import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './config.css'
// basename only applies to the production build, where the backend serves this app under
// /admin — local dev (`npm run dev`) still serves it at the root of its own Vite port.
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter basename={import.meta.env.PROD ? '/admin' : '/'}><App/></BrowserRouter></StrictMode>)
