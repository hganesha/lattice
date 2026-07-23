import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  if (env.VERCEL && !env.VITE_API_URL) throw new Error('VITE_API_URL is required for Vercel Studio deployments.')

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    server: { port: 5173, strictPort: true },
    test: {
      environment: 'jsdom',
      environmentOptions: { jsdom: { url: 'http://127.0.0.1:5173/' } },
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
