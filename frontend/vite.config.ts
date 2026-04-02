import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/players': 'http://localhost:8000',
      '/games': 'http://localhost:8000',
      '/stats': 'http://localhost:8000',
      '/anomalies': 'http://localhost:8000',
      '/ingest': 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
