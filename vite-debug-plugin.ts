// Vite plugin: debug HTTP API + WebSocket relay
// Endpoints served at dev server on port 1420:
//   GET  /__debug/logs         — get buffered frontend logs (forwarded via WS)
//   GET  /__debug/logs/clear   — clear server-side log buffer
//   GET  /__debug/state        — placeholder (state is in browser, use /eval)
//   POST /__debug/eval         — evaluate JS in the browser via WS and return result
//   WS   /__debug_ws           — bidirectional log/command channel with browser

import type { Plugin, ViteDevServer } from 'vite'
import { WebSocketServer, WebSocket } from 'ws'

interface LogEntry {
  ts: number
  level: string
  tag: string
  msg: string
  data?: unknown
}

export default function debugPlugin(): Plugin {
  const logs: LogEntry[] = []
  const MAX_LOGS = 5000
  let wss: WebSocketServer | null = null
  const clients = new Set<WebSocket>()

  // Pending eval requests
  let evalIdCounter = 0
  const evalCallbacks = new Map<number, { resolve: (v: unknown) => void; timer: ReturnType<typeof setTimeout> }>()

  function broadcast(msg: string) {
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.send(msg)
    }
  }

  return {
    name: 'debug-api',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      // WebSocket server on the same HTTP server
      wss = new WebSocketServer({ noServer: true })

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url === '/__debug_ws') {
          wss!.handleUpgrade(req, socket, head, (ws) => {
            clients.add(ws)
            ws.on('message', (raw) => {
              try {
                const msg = JSON.parse(raw.toString())
                // Log entries from browser
                if (msg.ts && msg.tag) {
                  logs.push(msg as LogEntry)
                  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
                }
                // Eval response from browser
                if (msg.__eval_id !== undefined) {
                  const cb = evalCallbacks.get(msg.__eval_id)
                  if (cb) {
                    clearTimeout(cb.timer)
                    evalCallbacks.delete(msg.__eval_id)
                    cb.resolve(msg.result)
                  }
                }
              } catch { /* ignore */ }
            })
            ws.on('close', () => clients.delete(ws))
          })
        }
      })

      // HTTP endpoints
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__debug/')) return next()

        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }

        const url = new URL(req.url, 'http://localhost')
        const path = url.pathname

        if (path === '/__debug/logs' && req.method === 'GET') {
          const since = Number(url.searchParams.get('since') || '0')
          const tag = url.searchParams.get('tag') || ''
          const level = url.searchParams.get('level') || ''
          const limit = Number(url.searchParams.get('limit') || '200')
          let filtered = logs
          if (since) filtered = filtered.filter(l => l.ts > since)
          if (tag) filtered = filtered.filter(l => l.tag.includes(tag))
          if (level) filtered = filtered.filter(l => l.level === level)
          const result = filtered.slice(-limit)
          res.end(JSON.stringify({ count: result.length, total: logs.length, logs: result }))
          return
        }

        if (path === '/__debug/logs/clear') {
          logs.length = 0
          res.end(JSON.stringify({ ok: true }))
          return
        }

        if (path === '/__debug/eval' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const { code, target } = JSON.parse(body) as { code: string; target?: string }
              const id = ++evalIdCounter
              const p = new Promise<unknown>((resolve) => {
                const timer = setTimeout(() => { evalCallbacks.delete(id); resolve({ error: 'timeout' }) }, 10000)
                evalCallbacks.set(id, { resolve, timer })
              })
              broadcast(JSON.stringify({ __eval: code, __eval_id: id, __target: target }))
              p.then((result) => {
                res.end(JSON.stringify({ ok: true, result }))
              })
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'invalid json' }))
            }
          })
          return
        }

        if (path === '/__debug/ping') {
          res.end(JSON.stringify({ ok: true, clients: clients.size, logs: logs.length }))
          return
        }

        // Mock OpenAI SSE endpoint for testing streaming
        if ((path === '/__debug/mock-sse' || path === '/__debug/mock-sse/chat/completions') && req.method === 'POST') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          })

          const storyChunks = [
            '在一个风雨交加的夜晚，',
            '年轻的探险家李明站在古堡的大门前。',
            '\\n\\n',
            '他深吸一口气，',
            '推开了那扇沉重的木门。',
            '\\n\\n',
            '门内是一条幽暗的长廊，',
            '两侧的壁灯散发着微弱的光芒。',
            '\\n\\n',
            '空气中弥漫着古老的尘土气息，',
            '混合着某种说不清的香料味道。',
          ]

          // Build the tool call argument JSON character by character as OpenAI would
          const fullJson = JSON.stringify({ content: storyChunks.join('') })
          const argChunks: string[] = []
          for (let i = 0; i < fullJson.length; i += 4) {
            argChunks.push(fullJson.slice(i, i + 4))
          }

          let idx = 0
          const sendNext = () => {
            if (idx >= argChunks.length) {
              // Send finish
              const finish = { id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
              res.write(`data: ${JSON.stringify(finish)}\n\n`)
              res.write('data: [DONE]\n\n')
              res.end()
              return
            }
            const chunk: Record<string, unknown> = {
              id: 'mock', object: 'chat.completion.chunk',
              choices: [{
                index: 0, delta: {
                  ...(idx === 0 ? { role: 'assistant' } : {}),
                  tool_calls: [{
                    index: 0,
                    ...(idx === 0 ? { id: 'call_mock', type: 'function', function: { name: 'write_story', arguments: argChunks[idx] } } : { function: { arguments: argChunks[idx] } }),
                  }],
                },
                finish_reason: null,
              }],
            }
            res.write(`data: ${JSON.stringify(chunk)}\n\n`)
            idx++
            setTimeout(sendNext, 50) // 50ms between chunks
          }
          sendNext()
          return
        }

        // Mock SSE that sends everything at once (simulates WKWebView buffering)
        if ((path === '/__debug/mock-buffered' || path === '/__debug/mock-buffered/chat/completions') && req.method === 'POST') {
          const storyChunks = [
            '在一个风雨交加的夜晚，',
            '年轻的探险家李明站在古堡的大门前。',
            '\\n\\n',
            '他深吸一口气，',
            '推开了那扇沉重的木门。',
            '\\n\\n',
            '门内是一条幽暗的长廊，',
            '两侧的壁灯散发着微弱的光芒。',
          ]
          const fullJson = JSON.stringify({ content: storyChunks.join('') })
          const argChunks: string[] = []
          for (let i = 0; i < fullJson.length; i += 4) {
            argChunks.push(fullJson.slice(i, i + 4))
          }

          // Build all SSE data at once
          let allData = ''
          for (let idx = 0; idx < argChunks.length; idx++) {
            const chunk: Record<string, unknown> = {
              id: 'mock', object: 'chat.completion.chunk',
              choices: [{
                index: 0, delta: {
                  ...(idx === 0 ? { role: 'assistant' } : {}),
                  tool_calls: [{
                    index: 0,
                    ...(idx === 0 ? { id: 'call_mock', type: 'function', function: { name: 'write_story', arguments: argChunks[idx] } } : { function: { arguments: argChunks[idx] } }),
                  }],
                },
                finish_reason: null,
              }],
            }
            allData += `data: ${JSON.stringify(chunk)}\n\n`
          }
          const finish = { id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
          allData += `data: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`

          // Send everything at once — simulates WKWebView buffering
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          })
          res.end(allData)
          return
        }

        res.statusCode = 404
        res.end(JSON.stringify({ error: 'not found' }))
      })
    },
  }
}
