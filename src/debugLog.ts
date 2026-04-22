// Debug logging system — buffered in-memory, exposed via window.__DEBUG_API__
// In dev mode, logs are also pushed to the Vite debug WebSocket at ws://localhost:1420/__debug_ws

type LogLevel = 'info' | 'warn' | 'error' | 'stream'
interface LogEntry {
  ts: number
  level: LogLevel
  tag: string
  msg: string
  data?: unknown
}

const MAX_ENTRIES = 2000
const buffer: LogEntry[] = []
let ws: WebSocket | null = null
let wsReady = false

function connectWS() {
  if (typeof window === 'undefined') return
  try {
    const url = `ws://${location.hostname}:${location.port}/__debug_ws`
    ws = new WebSocket(url)
    ws.onopen = () => { wsReady = true }
    ws.onclose = () => { wsReady = false; setTimeout(connectWS, 3000) }
    ws.onerror = () => { ws?.close() }
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.__eval && msg.__eval_id !== undefined) {
          const isTauri = '__TAURI_INTERNALS__' in window
          if (msg.__target === 'tauri' && !isTauri) return
          if (msg.__target === 'browser' && isTauri) return
          let result: unknown
          try { result = new Function(msg.__eval)() } catch (e) { result = { error: String(e) } }
          if (result instanceof Promise) {
            result.then((v) => ws?.send(JSON.stringify({ __eval_id: msg.__eval_id, result: v })))
              .catch((e) => ws?.send(JSON.stringify({ __eval_id: msg.__eval_id, result: { error: String(e) } })))
          } else {
            ws?.send(JSON.stringify({ __eval_id: msg.__eval_id, result }))
          }
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore in non-dev */ }
}

// @ts-ignore — Vite injects import.meta.env at build time
if (import.meta.env?.DEV) connectWS()

function push(level: LogLevel, tag: string, msg: string, data?: unknown) {
  const entry: LogEntry = { ts: Date.now(), level, tag, msg, data }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES)
  if (wsReady && ws) {
    try { ws.send(JSON.stringify(entry)) } catch { /* ignore */ }
  }
}

export const dlog = {
  info: (tag: string, msg: string, data?: unknown) => push('info', tag, msg, data),
  warn: (tag: string, msg: string, data?: unknown) => push('warn', tag, msg, data),
  error: (tag: string, msg: string, data?: unknown) => push('error', tag, msg, data),
  stream: (tag: string, msg: string, data?: unknown) => push('stream', tag, msg, data),
  getBuffer: () => buffer,
  clear: () => { buffer.length = 0 },
}

// Expose globally for debug API access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__DEBUG_LOG__ = dlog
}
