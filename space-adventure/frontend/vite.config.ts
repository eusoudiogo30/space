import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served by the backend at the site root in production (single Node app for everything) — see
// backend/src/app.ts. Local dev keeps running at the root of its own Vite port, unaffected.
export default defineConfig({
  plugins: [react()],
})
