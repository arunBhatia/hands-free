import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // getUserMedia needs a secure context. localhost counts as one, so plain
    // http://localhost:5173 is fine for local dev; only remote hosts need TLS.
    host: 'localhost',
    port: 5173,
  },
  build: {
    target: 'es2022',
    // three + mediapipe are both large; a single vendor chunk keeps the
    // waterfall short since we need all of it before the first frame anyway.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/@mediapipe')) return 'mediapipe'
        },
      },
    },
  },
})
