import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_AUTH_MODE': JSON.stringify('demo'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://localhost:4100/api/v1'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
  },
})
