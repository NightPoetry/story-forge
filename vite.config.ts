import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import debugPlugin from './vite-debug-plugin'

export default defineConfig({
  plugins: [react(), debugPlugin()],
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      },
    },
  },
})
