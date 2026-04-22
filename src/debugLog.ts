// Debug logging system — only active in dev mode.
// In production, all functions are no-ops with zero overhead.

type LogLevel = 'info' | 'warn' | 'error' | 'stream'
interface LogEntry {
  ts: number
  level: LogLevel
  tag: string
  msg: string
  data?: unknown
}

// @ts-ignore — Vite injects import.meta.env at build time
const IS_DEV: boolean = import.meta.env?.DEV ?? false

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

if (IS_DEV) connectWS()

function push(level: LogLevel, tag: string, msg: string, data?: unknown) {
  const entry: LogEntry = { ts: Date.now(), level, tag, msg, data }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES)
  if (wsReady && ws) {
    try { ws.send(JSON.stringify(entry)) } catch { /* ignore */ }
  }
}

const noop = () => {}

export const dlog = IS_DEV
  ? {
      info: (tag: string, msg: string, data?: unknown) => push('info', tag, msg, data),
      warn: (tag: string, msg: string, data?: unknown) => push('warn', tag, msg, data),
      error: (tag: string, msg: string, data?: unknown) => push('error', tag, msg, data),
      stream: (tag: string, msg: string, data?: unknown) => push('stream', tag, msg, data),
      getBuffer: () => buffer,
      clear: () => { buffer.length = 0 },
    }
  : {
      info: noop as (tag: string, msg: string, data?: unknown) => void,
      warn: noop as (tag: string, msg: string, data?: unknown) => void,
      error: noop as (tag: string, msg: string, data?: unknown) => void,
      stream: noop as (tag: string, msg: string, data?: unknown) => void,
      getBuffer: () => [] as LogEntry[],
      clear: noop,
    }

if (IS_DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__DEBUG_LOG__ = dlog
}
