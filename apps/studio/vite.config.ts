import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  /**
   * VITE_API_URL used to be mandatory on Vercel, because the Context API was deployed separately
   * and the Studio had no way to find it. It is now a function on the Studio's own origin, and
   * `vercel.json` routes /health, /openapi.json, and /v1/* to it — so the correct value is no
   * value, and a production build with none issues same-origin relative requests.
   *
   * Setting it now means deliberately pointing at a different origin, which brings CORS back and
   * fails invisibly when it is wrong: the browser rejects every response and the Studio reports
   * the runtime offline with nothing in the console. Worth saying out loud, not worth refusing.
   */
  if (env.VERCEL && env.VITE_API_URL?.trim()) {
    console.warn(
      `[lattice] VITE_API_URL is set to ${env.VITE_API_URL.trim()}, overriding the same-origin API this deployment serves.\n` +
      '[lattice] Unset it unless the API really is hosted elsewhere; it is inlined at build time, so changing it needs a rebuild.',
    )
  }

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
