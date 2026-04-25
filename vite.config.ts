import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import debugPlugin from './vite-debug-plugin'
import http from 'node:http'

function localApiProxy(): Plugin {
  return {
    name: 'local-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/api\/local\/([^/]+)\/(\d+)(\/.*)$/)
        if (!match) return next()
        const [, host, port, path] = match
        const headers = { ...req.headers, host: `${host}:${port}` }
        delete headers['origin']
        delete headers['referer']
        const proxyReq = http.request(
          { hostname: host, port: Number(port), path, method: req.method, headers },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
            proxyRes.pipe(res)
          },
        )
        proxyReq.on('error', (e) => {
          res.writeHead(502, { 'Content-Type': 'text/plain' })
          res.end(`Proxy error: ${e.message}`)
        })
        req.pipe(proxyReq)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), debugPlugin(), localApiProxy()],
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
