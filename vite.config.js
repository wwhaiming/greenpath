import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'public',
  plugins: [react()],
  publicDir: false,
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:5000'
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
