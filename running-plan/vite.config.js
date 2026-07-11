import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served at /running/ on the shared Firebase Hosting site.
export default defineConfig({
  plugins: [react()],
  base: '/running/',
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
    outDir: "../dist/running",
    emptyOutDir: true,
  },
})
