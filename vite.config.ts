import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Horizons sends no CORS headers; same path is rewritten by vercel.json in production.
  server: { proxy: { '/horizons-api': { target: 'https://ssd.jpl.nasa.gov', changeOrigin: true, rewrite: p => p.replace(/^\/horizons-api/, '/api/horizons.api') } } },
})
