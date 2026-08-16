import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served by the backend under /space in production (single Node app for everything), so its
// built asset URLs need to be prefixed to match — see backend/src/app.ts. Local dev keeps
// running at the root of its own Vite port, unaffected. The /game/* public assets are
// additionally exposed unprefixed at the site root by the backend, since the app's own code
// references them as absolute paths (e.g. "/game/coin.svg").
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/space/' : '/',
  plugins: [react()],
}))
