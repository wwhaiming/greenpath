import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build output goes straight into public/ so `npm run build` replaces
// public/index.html with the compiled React app. server.py (Flask) serves
// public/ first when public/index.html exists, so this build becomes the
// production frontend with no extra steps.
//
// publicDir is disabled: we are *writing into* public/, so it must not also be
// treated as a static-asset source directory (that would cause Vite to refuse
// to empty its own output dir / copy public into itself).
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:5000'
    }
  },
  build: {
    outDir: 'public',
    emptyOutDir: true
  }
})
