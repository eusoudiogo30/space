import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served by the backend under /admin in production (single Node app for everything), so its
// built asset URLs need to be prefixed to match — see backend/src/app.ts. Local dev keeps
// running at the root of its own Vite port, unaffected.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react()],
}))
