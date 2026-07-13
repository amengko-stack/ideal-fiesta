import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone app: served at the root of its own Firebase Hosting site.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3002,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
