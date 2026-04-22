import { ApiFormat, ApiCheckResult, ChatMessage, StoryNodeData } from './types'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export const genId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

// ── Environment detection ─────────────────────────────────────────────────

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Routes official Anthropic API through Vite proxy in browser to avoid CORS
function resolveAnthropicBase(apiUrl: string): string {
  const base = apiUrl.replace(/\/$/, '')
  const isOfficial =
    base === 'https://api.anthropic.com' || base === 'http://api.anthropic.com'
  if (isOfficial && !isTauri()) return '/api/anthropic'
  return base
}

// Normalize OpenAI-compatible base URL: user supplies the versioned endpoint (e.g. /v1)
function resolveOpenAIBase(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '')
}

// ── Prompt builders ────────────────────────────────────────────────────────

// Fixed part — goes into the `system` parameter, same every request, cache-friendly.
export function buildFixedSystemPrompt(writingRules: string): string {
  if (!writingRules.trim()) return ''
  return `# 写作规则\n${writingRules.trim()}`
}

// Dynamic part — prepended to the user's message each request.
// Contains story context, foreshadowings, story settings, state card, and tool guidance.
// State card explicitly overrides story settings when they conflict.
export function buildDynamicContext(
  node: StoryNodeData,
  ancestors: StoryNodeData[],
  storySettings: string,
): string {
  const parts: string[] = []

  // 故事上文
  const withContent = ancestors.filter((a) => a.storyContent.trim())
  if (withContent.length > 0) {
    const ctx = withContent
      .map((a) => `【${a.title}】\n${a.storyContent.trim()}`)
      .join('\n\n')
    parts.push(`# 故事上文\n${ctx}`)
  }

  // 伏笔档案
  const foreshadowings = node.foreshadowings ?? []
  const planted = foreshadowings.filter((f) => f.status === 'planted')
  const collected = foreshadowings.filter((f) => f.status === 'collected')
  if (foreshadowings.length > 0) {
    const lines: string[] = ['# 伏笔档案（作者机密——绝不直接透露给读者）']
    if (planted.length > 0) {
      lines.push('\n## 待回收伏笔（在故事中巧妙埋下暗示，同时以合理细节误导读者，不得直接揭示）')
      for (const f of planted) {
        lines.push(`\n[${f.id}] 真相：${f.secret}`)
        if (f.plantNote.trim()) lines.push(`暗示方式：${f.plantNote}`)
      }
    }
    if (collected.length > 0) {
      lines.push('\n## 已回收伏笔（已在故事中揭示，可以公开引用）')
      for (const f of collected) {
        lines.push(`[${f.id}] ${f.secret}`)
        if (f.revealNote) lines.push(`  → 揭示：${f.revealNote}`)
      }
    }
    parts.push(lines.join('\n'))
  }

  // 故事设定 + 状态卡片（状态卡片优先级更高）
  const hasSettings = storySettings.trim()
  const hasState = node.stateCard.content.trim()
  if (hasSettings) {
    parts.push(`# 故事设定\n${storySettings.trim()}`)
  }
  if (hasState) {
    const note = hasSettings ? '（若与上方故事设定冲突，以此为准）' : ''
    parts.push(`# 派生状态卡片${note}\n${node.stateCard.content.trim()}`)
  }

  // 节点信息 + 字数要求
  const metaLines: string[] = [`当前节点名称：「${node.title}」`]
  if (node.targetWordCount && node.targetWordCount > 0) {
    metaLines.push(`写作字数要求：本节正文**不少于 ${node.targetWordCount} 字**，可适当超出以保证章节完整性，但绝不能少于此数目。`)
  }
  parts.push(metaLines.join('\n'))

  // 工具调用指导放在最末，紧贴用户指令之前
  parts.push(TOOL_GUIDANCE)

  return parts.join('\n\n---\n\n')
}

export function buildStateCardPrompt(
  storyContent: string,
  contextContent: string,
): string {
  let p = `你是一个故事状态追踪系统。请基于以下故事内容，生成简洁的状态卡片（不超过200字）。\n\n`
  p += `格式：\n人物：[姓名/状态]\n地点：[当前场景]\n时间：[时间节点]\n关键事件：[重要情节]\n\n`
  if (contextContent.trim()) p += `上文摘要：\n${contextContent.trim()}\n\n`
  p += `当前章节：\n${storyContent.trim()}\n\n直接输出状态卡片，不要有任何额外说明。`
  return p
}

// ── Tool definitions ────────────────────────────────────────────────────────

const STORY_TOOLS = [
  {
    name: 'write_story',
    description:
      '创作或修改当前节点的故事正文内容。用户要求写故事情节、续写、描述场景、推进剧情时调用。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '完整故事正文，直接输出内容，不含标题、解释或任何格式标记',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'update_state_card',
    description:
      '更新派生状态卡片，追踪人物状态、世界状态、关键情节。当：①故事出现重要变化（新人物/关键事件/场景切换）②用户要求建立世界观/人物设定/基础设定/初始状态时调用。设定类请求优先更新状态卡片，不必写故事正文。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '状态卡片全文，简洁精炼，涵盖：人物/地点/时间/关键事件',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'chat_reply',
    description:
      '给用户的对话回复，说明做了什么或创作考量。每次响应必须调用此工具。',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: '1-3句，第一人称，说明操作内容，不重复故事正文内容',
        },
      },
      required: ['message'],
    },
  },
] as const

const COLLECT_FORESHADOWING_TOOL = {
  name: 'collect_foreshadowing',
  description:
    '当故事情节自然发展到揭示某伏笔的时机，在故事中回收该伏笔（写出揭示场景），并记录揭示说明。只能使用伏笔档案中列出的ID。',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: '要回收的伏笔ID，如 F1、F2（必须是伏笔档案中存在的）' },
      reveal_note: { type: 'string', description: '简短说明如何在故事中揭示了该伏笔' },
    },
    required: ['id', 'reveal_note'],
  },
} as const

const TOOL_GUIDANCE = `你是专业故事创作助手。根据用户指令，调用合适的工具：
- 用户要写/续写/修改故事情节 → 调用 write_story（故事中应根据伏笔档案植入暗示和误导）
- 用户要求建立设定、世界观、人物背景，或故事出现重要变化 → 调用 update_state_card
- 故事情节自然发展到揭示某伏笔的合适时机 → 调用 collect_foreshadowing（仅当伏笔档案有待回收项时可用）
- 可同时调用多个工具
- 每次响应必须调用 chat_reply 向用户简短说明操作（不要复述正文）`

// Extracts the partial (or complete) string value for `key` from a partially-received
// JSON buffer. Returns null if the key/opening-quote hasn't arrived yet.
function extractPartialStringValue(json: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"`)
  const match = re.exec(json)
  if (!match) return null

  let result = ''
  let i = match.index + match[0].length

  while (i < json.length) {
    const ch = json[i]
    if (ch === '\\') {
      if (i + 1 >= json.length) break // incomplete escape at end of partial buffer
      const next = json[i + 1]
      if (next === 'u') {
        if (i + 5 < json.length) {
          result += String.fromCharCode(parseInt(json.slice(i + 2, i + 6), 16))
          i += 6
        } else {
          break // incomplete unicode escape
        }
      } else {
        const MAP: Record<string, string> = { '"': '"', '\\': '\\', 'n': '\n', 'r': '\r', 't': '\t', '/': '/' }
        result += MAP[next] ?? next
        i += 2
      }
    } else if (ch === '"') {
      break // closing quote
    } else {
      result += ch
      i++
    }
  }

  return result
}

// ── AI Action types ────────────────────────────────────────────────────────

export type AIAction =
  | { type: 'write_story'; content: string }
  | { type: 'update_state_card'; content: string }
  | { type: 'chat_reply'; content: string }
  | { type: 'collect_foreshadowing'; id: string; revealNote: string }

export type AIGuideAction =
  | { type: 'update_guide'; content: string }
  | { type: 'chat_reply'; content: string }

// ── Request helpers ────────────────────────────────────────────────────────

interface ApiConfig {
  apiKey: string
  apiUrl: string
  apiFormat: ApiFormat
  apiModel: string
}

function anthropicHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

function openaiHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

// ── SSE transport layer ──────────────────────────────────────────────────
// WKWebView (Tauri) buffers fetch ReadableStream — the entire response arrives
// at once, breaking real-time streaming. In Tauri we use @tauri-apps/plugin-http
// whose fetch() goes through Rust's reqwest, bypassing WKWebView networking
// entirely and delivering chunks as they arrive from the server.
// If the plugin's URL scope rejects the URL, we fall back to native fetch.

type SSEResult = { ok: true } | { ok: false; status: number; message: string }

async function doStreamFetch(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (isTauri()) {
    try {
      return await tauriFetch(url, { method: 'POST', headers, signal, body })
    } catch (e) {
      // Scope error or plugin issue → fall back to native fetch
      if ((e as Error).name === 'AbortError') throw e
      console.warn('[tauri-http] falling back to native fetch:', (e as Error).message)
    }
  }
  return await fetch(url, { method: 'POST', headers, signal, body })
}

async function postSSE(
  url: string,
  headers: Record<string, string>,
  body: object,
  onData: (raw: string) => void,
  signal?: AbortSignal,
): Promise<SSEResult> {
  let res: Response
  try {
    res = await doStreamFetch(url, headers, JSON.stringify(body), signal)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error((e as Error).message || 'Network error')
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } }
    return { ok: false, status: res.status, message: errBody.error?.message || `HTTP ${res.status}` }
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal?.aborted) { reader.cancel(); break }
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw && raw !== '[DONE]') onData(raw)
    }
  }
  return { ok: true }
}

// ── Intelligent generation (single request, tool use) ────────────────────

export async function runIntelligentGeneration(
  cfg: ApiConfig,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  hasActiveForeshadowings: boolean,
  onAction: (action: AIAction) => void,
  onToolStart: (toolName: string) => void,
  onComplete: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  onStreamDelta?: (toolName: string, text: string) => void,
) {
  // TOOL_GUIDANCE is already embedded in the dynamic context (last part before user message)
  const fullSystem = systemPrompt
  type ToolDef = { name: string; description: string; input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] } }
  const tools = (hasActiveForeshadowings
    ? [...STORY_TOOLS, COLLECT_FORESHADOWING_TOOL]
    : [...STORY_TOOLS]) as unknown as ToolDef[]

  if (cfg.apiFormat === 'anthropic') {
    await runAnthropicStreamingToolUse(
      cfg, fullSystem, messages, tools, onAction, onToolStart, onComplete, onError, signal, onStreamDelta,
    )
  } else {
    await runOpenAIToolUse(
      cfg, fullSystem, messages, tools, onAction, onToolStart, onComplete, onError, signal, onStreamDelta,
    )
  }
}

// ── Anthropic: streaming + tool use ────────────────────────────────────────

async function runAnthropicStreamingToolUse(
  cfg: ApiConfig,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  tools: readonly { name: string; description: string; input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] } }[],
  onAction: (action: AIAction) => void,
  onToolStart: (toolName: string) => void,
  onComplete: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  onStreamDelta?: (toolName: string, text: string) => void,
) {
  const base = resolveAnthropicBase(cfg.apiUrl)
  type BlockInfo = { name: string; buf: string }
  const blocks = new Map<number, BlockInfo>()
  let hasChatReply = false

  let result: SSEResult
  try {
    result = await postSSE(
      `${base}/v1/messages`,
      anthropicHeaders(cfg.apiKey),
      { model: cfg.apiModel, max_tokens: 4096, stream: true, system: systemPrompt, messages, tools },
      (raw) => {
        let evt: Record<string, unknown>
        try { evt = JSON.parse(raw) as Record<string, unknown> } catch { return }
        const evtType = evt.type as string

        if (evtType === 'content_block_start') {
          const block = evt.content_block as { type: string; name?: string } | undefined
          if (block?.type === 'tool_use' && block.name) {
            blocks.set(evt.index as number, { name: block.name, buf: '' })
            onToolStart(block.name)
          }
        }
        if (evtType === 'content_block_delta') {
          const delta = evt.delta as { type: string; partial_json?: string } | undefined
          if (delta?.type === 'input_json_delta' && delta.partial_json) {
            const block = blocks.get(evt.index as number)
            if (block) {
              block.buf += delta.partial_json
              if (onStreamDelta) {
                const streamKey =
                  block.name === 'write_story' ? 'content'
                  : block.name === 'update_state_card' ? 'content'
                  : null
                if (streamKey) {
                  const text = extractPartialStringValue(block.buf, streamKey)
                  if (text !== null) onStreamDelta(block.name, text)
                }
              }
            }
          }
        }
        if (evtType === 'content_block_stop') {
          const block = blocks.get(evt.index as number)
          if (block) {
            try {
              const input = JSON.parse(block.buf) as Record<string, string>
              if (block.name === 'write_story') onAction({ type: 'write_story', content: input.content ?? '' })
              else if (block.name === 'update_state_card') onAction({ type: 'update_state_card', content: input.content ?? '' })
              else if (block.name === 'chat_reply') { onAction({ type: 'chat_reply', content: input.message ?? '' }); hasChatReply = true }
              else if (block.name === 'collect_foreshadowing') onAction({ type: 'collect_foreshadowing', id: input.id ?? '', revealNote: input.reveal_note ?? '' })
            } catch { /* ignore parse error */ }
          }
        }
      },
      signal,
    )
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    onError(e instanceof Error ? e.message : 'Stream error')
    return
  }

  if (!result.ok) { onError(result.message); return }
  if (!hasChatReply && !signal?.aborted) onAction({ type: 'chat_reply', content: '已处理您的请求。' })
  if (!signal?.aborted) onComplete()
}

// ── OpenAI: non-streaming tool use ────────────────────────────────────────

async function runOpenAIToolUse(
  cfg: ApiConfig,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  tools: readonly { name: string; description: string; input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] } }[],
  onAction: (action: AIAction) => void,
  onToolStart: (toolName: string) => void,
  onComplete: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  onStreamDelta?: (toolName: string, text: string) => void,
) {
  const base = resolveOpenAIBase(cfg.apiUrl)
  const openAITools = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))

  let plainContent = ''
  type ToolAccum = { index: number; name: string; argBuf: string }
  const toolAccums = new Map<number, ToolAccum>()

  let result: SSEResult
  try {
    result = await postSSE(
      `${base}/chat/completions`,
      openaiHeaders(cfg.apiKey),
      {
        model: cfg.apiModel, stream: true,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: openAITools, tool_choice: 'auto',
      },
      (raw) => {
        let evt: Record<string, unknown>
        try { evt = JSON.parse(raw) as Record<string, unknown> } catch { return }
        const choice = (evt.choices as { delta: Record<string, unknown>; finish_reason?: string }[])?.[0]
        if (!choice) return
        const delta = choice.delta

        if (typeof delta.content === 'string' && delta.content) plainContent += delta.content

        const tcDeltas = delta.tool_calls as { index: number; function?: { name?: string; arguments?: string } }[] | undefined
        if (tcDeltas) {
          for (const tcd of tcDeltas) {
            let accum = toolAccums.get(tcd.index)
            if (!accum) {
              const name = tcd.function?.name ?? ''
              accum = { index: tcd.index, name, argBuf: '' }
              toolAccums.set(tcd.index, accum)
              if (name) onToolStart(name)
            }
            if (tcd.function?.name && !accum.name) { accum.name = tcd.function.name; onToolStart(accum.name) }
            if (tcd.function?.arguments) {
              accum.argBuf += tcd.function.arguments
              if (onStreamDelta) {
                const streamKey = accum.name === 'write_story' ? 'content' : accum.name === 'update_state_card' ? 'content' : null
                if (streamKey) {
                  const text = extractPartialStringValue(accum.argBuf, streamKey)
                  if (text !== null) onStreamDelta(accum.name, text)
                }
              }
            }
          }
        }
      },
      signal,
    )
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    onError(e instanceof Error ? e.message : 'Stream error')
    return
  }

  if (!result.ok) {
    if ([400, 500, 422].includes(result.status)) {
      await runOpenAIPlainFallback(cfg, systemPrompt, messages, onAction, onToolStart, onComplete, onError, signal, onStreamDelta)
      return
    }
    onError(result.message)
    return
  }

  if (signal?.aborted) return

  let hasChatReply = false
  for (const accum of toolAccums.values()) {
    try {
      const args = JSON.parse(accum.argBuf) as Record<string, string>
      if (accum.name === 'write_story') onAction({ type: 'write_story', content: args.content ?? '' })
      else if (accum.name === 'update_state_card') onAction({ type: 'update_state_card', content: args.content ?? '' })
      else if (accum.name === 'chat_reply') { onAction({ type: 'chat_reply', content: args.message ?? '' }); hasChatReply = true }
      else if (accum.name === 'collect_foreshadowing') onAction({ type: 'collect_foreshadowing', id: args.id ?? '', revealNote: args.reveal_note ?? '' })
    } catch { /* ignore */ }
  }

  if (toolAccums.size === 0 && plainContent.trim()) onAction({ type: 'write_story', content: plainContent.trim() })
  if (!hasChatReply) onAction({ type: 'chat_reply', content: '已处理您的请求。' })
  onComplete()
}

// ── OpenAI plain streaming fallback (models without tool support) ─────────

const PLAIN_OUTPUT_INSTRUCTIONS = `

## 输出格式（严格遵守）

你没有工具可调用，请用XML标签包裹输出。可以同时输出多个标签。

写故事/续写/修改情节时：
<write_story>
完整故事正文，直接输出内容，不含标题、解释或任何格式标记
</write_story>

更新状态卡片时（故事有重要变化，或用户要求建立设定/世界观/人物）：
<update_state_card>
状态卡片全文，涵盖人物/地点/时间/关键事件
</update_state_card>

回收伏笔时（仅当伏笔档案有待回收项）：
<collect_foreshadowing id="F1" reveal_note="如何揭示的说明" />

最后必须附上简短说明：
<chat_reply>
1-3句说明你做了什么
</chat_reply>

如果用户的要求只需要对话回复（如闲聊、提问），只输出 <chat_reply> 即可。`

function parsePlainActions(text: string): AIAction[] {
  const actions: AIAction[] = []

  const extractTag = (tag: string): string | null => {
    // Match both <tag>content</tag> and <tag>\ncontent\n</tag>, greedy within each tag
    const re = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'g')
    let match
    let last: string | null = null
    while ((match = re.exec(text)) !== null) {
      last = match[1].trim()
    }
    return last
  }

  const story = extractTag('write_story')
  if (story) actions.push({ type: 'write_story', content: story })

  const stateCard = extractTag('update_state_card')
  if (stateCard) actions.push({ type: 'update_state_card', content: stateCard })

  // <collect_foreshadowing id="F1" reveal_note="..." /> or with closing tag
  const fRe = /<collect_foreshadowing\s+id="([^"]*?)"\s+reveal_note="([^"]*?)"\s*\/?>/g
  let fm
  while ((fm = fRe.exec(text)) !== null) {
    actions.push({ type: 'collect_foreshadowing', id: fm[1], revealNote: fm[2] })
  }

  const chatReply = extractTag('chat_reply')
  if (chatReply) actions.push({ type: 'chat_reply', content: chatReply })

  return actions
}

async function runOpenAIPlainFallback(
  cfg: ApiConfig,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  onAction: (action: AIAction) => void,
  onToolStart: (toolName: string) => void,
  onComplete: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  onStreamDelta?: (toolName: string, text: string) => void,
) {
  const base = resolveOpenAIBase(cfg.apiUrl)
  let full = ''
  const STREAMABLE_TAGS = ['write_story', 'update_state_card', 'chat_reply'] as const
  let currentTag: string | null = null
  const notifiedTags = new Set<string>()

  let result: SSEResult
  try {
    result = await postSSE(
      `${base}/chat/completions`,
      openaiHeaders(cfg.apiKey),
      {
        model: cfg.apiModel, stream: true,
        messages: [{ role: 'system', content: systemPrompt + PLAIN_OUTPUT_INSTRUCTIONS }, ...messages],
      },
      (raw) => {
        try {
          const evt = JSON.parse(raw) as { choices?: { delta: { content?: string } }[] }
          const delta = evt?.choices?.[0]?.delta?.content
          if (typeof delta !== 'string') return
          full += delta
          if (!onStreamDelta) return

          if (currentTag === null) {
            for (const tag of STREAMABLE_TAGS) {
              const idx = full.indexOf(`<${tag}>`)
              if (idx !== -1) {
                currentTag = tag
                if (!notifiedTags.has(tag)) { onToolStart(tag); notifiedTags.add(tag) }
                break
              }
            }
          } else {
            const openTag = `<${currentTag}>`
            const closeTag = `</${currentTag}>`
            const startIdx = full.indexOf(openTag) + openTag.length
            const endIdx = full.indexOf(closeTag, startIdx)
            if (endIdx !== -1) {
              onStreamDelta(currentTag, full.slice(startIdx, endIdx).replace(/^\s+/, ''))
              currentTag = null
              for (const tag of STREAMABLE_TAGS) {
                const nextIdx = full.indexOf(`<${tag}>`, endIdx)
                if (nextIdx !== -1 && full.indexOf(`</${tag}>`, nextIdx) === -1) {
                  currentTag = tag
                  if (!notifiedTags.has(tag)) { onToolStart(tag); notifiedTags.add(tag) }
                  break
                }
              }
            } else {
              onStreamDelta(currentTag, full.slice(startIdx).replace(/^\s+/, ''))
            }
          }
        } catch { /* ignore */ }
      },
      signal,
    )
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    onError(e instanceof Error ? e.message : 'Stream error')
    return
  }

  if (!result.ok) { onError(result.message); return }
  if (signal?.aborted) return

  const actions = parsePlainActions(full)
  if (actions.length > 0) {
    for (const a of actions) onAction(a)
    if (!actions.some((a) => a.type === 'chat_reply')) onAction({ type: 'chat_reply', content: '已处理您的请求。' })
  } else {
    onAction({ type: 'chat_reply', content: `⚠ XML解析失败：模型未按预期格式输出，未做任何更新。\n\n原始输出：\n${full.trim().slice(0, 500)}` })
  }
  onComplete()
}

// ── Settings guide chat ────────────────────────────────────────────────────

const GUIDE_TOOLS = [
  {
    name: 'update_guide',
    description: '将对话中获得的故事信息整理为结构化设定文档并更新。有新信息时即可调用，不必等到完整。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: '完整设定文档，仅记录已确认的内容，格式清晰简洁' },
      },
      required: ['content'],
    },
  },
  {
    name: 'chat_reply',
    description: '向作者发送引导性消息（提问、确认、建议等），每次响应必须调用。',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: '1-3句自然对话，通常以一个引导性问题结尾' },
      },
      required: ['message'],
    },
  },
] as const

function buildGuideSystemPrompt(currentGuide: string): string {
  return `你是故事创作顾问，通过对话帮助作者完善故事设定文档。

工作方式：
- 每次只问一个核心问题，根据作者的回答适时深入或转向
- 获得有效信息后立即调用 update_guide 整理到文档中
- 每次响应必须调用 chat_reply
- 语气自然亲切，像在和创作伙伴讨论

引导优先级（按顺序推进，已知信息跳过）：
1. 故事类型与基本构想
2. 时代、世界与背景规则
3. 主角及关键人物
4. 核心冲突与故事方向
5. 叙事视角与文风基调

update_guide 要求：仅写已确认内容，可用标签【类型】【背景】【人物】【冲突】【文风】【其他】

当前设定文档：
${currentGuide.trim() || '（尚无内容）'}`
}

export async function runSettingsGuideChat(
  cfg: ApiConfig,
  currentGuide: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  onAction: (action: AIGuideAction) => void,
  onComplete: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  onStreamDelta?: (toolName: string, text: string) => void,
): Promise<void> {
  const systemPrompt = buildGuideSystemPrompt(currentGuide)
  type ToolDef = { name: string; description: string; input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] } }
  const tools = [...GUIDE_TOOLS] as unknown as ToolDef[]

  if (cfg.apiFormat === 'anthropic') {
    const base = resolveAnthropicBase(cfg.apiUrl)
    type BlockInfo = { name: string; buf: string }
    const blocks = new Map<number, BlockInfo>()
    let hasChatReply = false

    let result: SSEResult
    try {
      result = await postSSE(
        `${base}/v1/messages`,
        anthropicHeaders(cfg.apiKey),
        { model: cfg.apiModel, max_tokens: 2048, stream: true, system: systemPrompt, messages, tools },
        (raw) => {
          let evt: Record<string, unknown>
          try { evt = JSON.parse(raw) as Record<string, unknown> } catch { return }
          const evtType = evt.type as string
          if (evtType === 'content_block_start') {
            const block = evt.content_block as { type: string; name?: string } | undefined
            if (block?.type === 'tool_use' && block.name) blocks.set(evt.index as number, { name: block.name, buf: '' })
          }
          if (evtType === 'content_block_delta') {
            const delta = evt.delta as { type: string; partial_json?: string } | undefined
            if (delta?.type === 'input_json_delta' && delta.partial_json) {
              const block = blocks.get(evt.index as number)
              if (block) {
                block.buf += delta.partial_json
                if (onStreamDelta && block.name === 'update_guide') {
                  const text = extractPartialStringValue(block.buf, 'content')
                  if (text !== null) onStreamDelta('update_guide', text)
                }
              }
            }
          }
          if (evtType === 'content_block_stop') {
            const block = blocks.get(evt.index as number)
            if (block) {
              try {
                const input = JSON.parse(block.buf) as Record<string, string>
                if (block.name === 'update_guide') onAction({ type: 'update_guide', content: input.content ?? '' })
                else if (block.name === 'chat_reply') { onAction({ type: 'chat_reply', content: input.message ?? '' }); hasChatReply = true }
              } catch { /* ignore */ }
            }
          }
        },
        signal,
      )
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      onError(e instanceof Error ? e.message : 'Stream error')
      return
    }

    if (!result.ok) { onError(result.message); return }
    if (!hasChatReply && !signal?.aborted) onAction({ type: 'chat_reply', content: '已记录。' })
    if (!signal?.aborted) onComplete()
  } else {
    const base = resolveOpenAIBase(cfg.apiUrl)
    const openAITools = tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }))
    type ToolAccum = { name: string; argBuf: string }
    const toolAccums = new Map<number, ToolAccum>()

    let result: SSEResult
    try {
      result = await postSSE(
        `${base}/chat/completions`,
        openaiHeaders(cfg.apiKey),
        { model: cfg.apiModel, stream: true, messages: [{ role: 'system', content: systemPrompt }, ...messages], tools: openAITools, tool_choice: 'auto' },
        (raw) => {
          let evt: Record<string, unknown>
          try { evt = JSON.parse(raw) as Record<string, unknown> } catch { return }
          const choice = (evt.choices as { delta: Record<string, unknown> }[])?.[0]
          if (!choice) return
          const tcDeltas = choice.delta.tool_calls as { index: number; function?: { name?: string; arguments?: string } }[] | undefined
          if (tcDeltas) {
            for (const tcd of tcDeltas) {
              let accum = toolAccums.get(tcd.index)
              if (!accum) { accum = { name: tcd.function?.name ?? '', argBuf: '' }; toolAccums.set(tcd.index, accum) }
              if (tcd.function?.name && !accum.name) accum.name = tcd.function.name
              if (tcd.function?.arguments) {
                accum.argBuf += tcd.function.arguments
                if (onStreamDelta && accum.name === 'update_guide') {
                  const text = extractPartialStringValue(accum.argBuf, 'content')
                  if (text !== null) onStreamDelta('update_guide', text)
                }
              }
            }
          }
        },
        signal,
      )
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      onError(e instanceof Error ? e.message : 'Stream error')
      return
    }

    if (!result.ok) { onError(result.message); return }
    if (signal?.aborted) return

    let hasChatReply = false
    for (const accum of toolAccums.values()) {
      try {
        const args = JSON.parse(accum.argBuf) as Record<string, string>
        if (accum.name === 'update_guide') onAction({ type: 'update_guide', content: args.content ?? '' })
        else if (accum.name === 'chat_reply') { onAction({ type: 'chat_reply', content: args.message ?? '' }); hasChatReply = true }
      } catch { /* ignore */ }
    }
    if (!hasChatReply) onAction({ type: 'chat_reply', content: '已记录。' })
    onComplete()
  }
}

// ── State card generation (legacy, used by StateCard.tsx auto-update) ─────

export async function generateStateCard(
  cfg: ApiConfig,
  prompt: string,
  onComplete: (text: string) => void,
  onError: (err: string) => void,
) {
  try {
    let res: Response
    if (cfg.apiFormat === 'anthropic') {
      const base = resolveAnthropicBase(cfg.apiUrl)
      res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(cfg.apiKey),
        body: JSON.stringify({
          model: cfg.apiModel,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
    } else {
      const base = resolveOpenAIBase(cfg.apiUrl)
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(cfg.apiKey),
        body: JSON.stringify({
          model: cfg.apiModel,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      onError(
        (errBody as { error?: { message?: string } }).error?.message ||
          `HTTP ${res.status}`,
      )
      return
    }

    const data = await res.json()
    let text = ''
    if (cfg.apiFormat === 'anthropic') {
      text =
        (data as { content?: { type: string; text: string }[] }).content?.[0]
          ?.text ?? ''
    } else {
      text =
        (data as { choices?: { message: { content: string } }[] }).choices?.[0]
          ?.message?.content ?? ''
    }
    onComplete(text)
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Unknown error')
  }
}

// ── Legacy streaming (kept for potential future use) ──────────────────────

export async function streamGeneration(
  cfg: ApiConfig,
  systemPrompt: string,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  onDelta: (text: string) => void,
  onComplete: (fullText: string) => void,
  onError: (err: string) => void,
) {
  const msgs = messages.map((m) => ({ role: m.role, content: m.content }))

  if (cfg.apiFormat === 'anthropic') {
    const base = resolveAnthropicBase(cfg.apiUrl)
    let res: Response
    try {
      res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(cfg.apiKey),
        body: JSON.stringify({
          model: cfg.apiModel,
          max_tokens: 4096,
          stream: true,
          system: systemPrompt,
          messages: msgs,
        }),
      })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Network error')
      return
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      onError((errBody as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`)
      return
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw) continue
        try {
          const evt = JSON.parse(raw) as { type?: string; delta?: { type: string; text: string } }
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            full += evt.delta.text
            onDelta(evt.delta.text)
          }
        } catch { /* ignore */ }
      }
    }
    onComplete(full)
  } else {
    const base = cfg.apiUrl.replace(/\/$/, '')
    let res: Response
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(cfg.apiKey),
        body: JSON.stringify({
          model: cfg.apiModel,
          stream: true,
          messages: [{ role: 'system', content: systemPrompt }, ...msgs],
        }),
      })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Network error')
      return
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      onError((errBody as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`)
      return
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          const evt = JSON.parse(raw) as { choices?: { delta: { content?: string } }[] }
          const delta = evt?.choices?.[0]?.delta?.content
          if (typeof delta === 'string') { full += delta; onDelta(delta) }
        } catch { /* ignore */ }
      }
    }
    onComplete(full)
  }
}

// ── API self-check ────────────────────────────────────────────────────────

export async function checkApiConfig(cfg: ApiConfig): Promise<ApiCheckResult> {
  const result: ApiCheckResult = {
    ok: false,
    connectivity: { ok: false, message: '未检测' },
    chat: { ok: false, message: '未检测' },
    toolUse: { ok: false, message: '未检测' },
    streaming: { ok: false, message: '未检测' },
  }

  const testMsg = [{ role: 'user' as const, content: '请回复"OK"' }]

  if (cfg.apiFormat === 'anthropic') {
    const base = resolveAnthropicBase(cfg.apiUrl)

    // 1. Connectivity — simple non-streaming chat
    let res: Response
    try {
      res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(cfg.apiKey),
        body: JSON.stringify({ model: cfg.apiModel, max_tokens: 32, messages: testMsg }),
      })
    } catch (e) {
      result.connectivity = { ok: false, message: `无法连接: ${(e as Error).message}` }
      return result
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const msg = (errBody as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`
      result.connectivity = { ok: false, message: msg }
      if (res.status === 401) result.connectivity.message = `认证失败: ${msg}`
      return result
    }
    result.connectivity = { ok: true, message: '连接正常' }

    const data = await res.json().catch(() => ({}))
    const text = (data as { content?: { text: string }[] })?.content?.[0]?.text
    result.chat = text ? { ok: true, message: '基础对话正常' } : { ok: false, message: '响应格式异常' }

    // 2. Tool use
    try {
      const toolRes = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(cfg.apiKey),
        body: JSON.stringify({
          model: cfg.apiModel, max_tokens: 64,
          messages: [{ role: 'user', content: '请调用test工具，参数msg填"ok"' }],
          tools: [{ name: 'test', description: '测试工具', input_schema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } }],
        }),
      })
      if (toolRes.ok) {
        const td = await toolRes.json() as { content?: { type: string }[] }
        const hasToolUse = td.content?.some((b) => b.type === 'tool_use')
        result.toolUse = hasToolUse
          ? { ok: true, message: 'Function Call 支持正常' }
          : { ok: true, message: '请求成功但模型未调用工具（可能影响写作功能）' }
      } else {
        result.toolUse = { ok: false, message: `HTTP ${toolRes.status}` }
      }
    } catch (e) {
      result.toolUse = { ok: false, message: (e as Error).message }
    }

    // 3. Streaming
    try {
      const streamRes = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(cfg.apiKey),
        body: JSON.stringify({ model: cfg.apiModel, max_tokens: 16, stream: true, messages: testMsg }),
      })
      if (streamRes.ok) {
        const reader = streamRes.body!.getReader()
        const chunk = await reader.read()
        reader.cancel()
        const text = new TextDecoder().decode(chunk.value ?? new Uint8Array())
        result.streaming = text.includes('event:')
          ? { ok: true, message: '流式输出正常' }
          : { ok: false, message: '响应非SSE流格式' }
      } else {
        result.streaming = { ok: false, message: `HTTP ${streamRes.status}` }
      }
    } catch (e) {
      result.streaming = { ok: false, message: (e as Error).message }
    }
  } else {
    // OpenAI-compatible
    const base = resolveOpenAIBase(cfg.apiUrl)

    // 1. Connectivity — basic chat
    let res: Response
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(cfg.apiKey),
        body: JSON.stringify({ model: cfg.apiModel, max_tokens: 32, messages: [{ role: 'system', content: 'reply OK' }, ...testMsg] }),
      })
    } catch (e) {
      result.connectivity = { ok: false, message: `无法连接: ${(e as Error).message}` }
      return result
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const msg = (errBody as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`
      result.connectivity = { ok: false, message: res.status === 401 ? `认证失败: ${msg}` : msg }
      return result
    }
    result.connectivity = { ok: true, message: '连接正常' }

    const data = await res.json().catch(() => ({}))
    const content = (data as { choices?: { message: { content?: string } }[] })?.choices?.[0]?.message?.content
    result.chat = content ? { ok: true, message: '基础对话正常' } : { ok: false, message: '响应格式异常' }

    // 2. Tool use
    try {
      const toolRes = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(cfg.apiKey),
        body: JSON.stringify({
          model: cfg.apiModel, max_tokens: 64,
          messages: [{ role: 'user', content: '请调用test工具，参数msg填"ok"' }],
          tools: [{
            type: 'function',
            function: { name: 'test', description: '测试工具', parameters: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } },
          }],
          tool_choice: 'auto',
        }),
      })
      if (toolRes.ok) {
        const td = await toolRes.json() as { choices?: { message: { tool_calls?: unknown[] } }[] }
        const hasTool = (td.choices?.[0]?.message?.tool_calls?.length ?? 0) > 0
        result.toolUse = hasTool
          ? { ok: true, message: 'Function Call 支持正常' }
          : { ok: true, message: '请求成功但模型未调用工具（将自动回退为纯文本模式）' }
      } else {
        result.toolUse = { ok: false, message: `不支持 Function Call (HTTP ${toolRes.status})，将自动回退为纯文本模式` }
      }
    } catch (e) {
      result.toolUse = { ok: false, message: (e as Error).message }
    }

    // 3. Streaming
    try {
      const streamRes = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(cfg.apiKey),
        body: JSON.stringify({ model: cfg.apiModel, max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'say hi' }] }),
      })
      if (streamRes.ok) {
        const reader = streamRes.body!.getReader()
        const chunk = await reader.read()
        reader.cancel()
        const text = new TextDecoder().decode(chunk.value ?? new Uint8Array())
        result.streaming = text.includes('data:')
          ? { ok: true, message: '流式输出正常' }
          : { ok: false, message: '响应非SSE流格式，将使用非流式模式' }
      } else {
        result.streaming = { ok: false, message: `不支持流式 (HTTP ${streamRes.status})，将使用非流式模式` }
      }
    } catch (e) {
      result.streaming = { ok: false, message: (e as Error).message }
    }
  }

  result.ok = result.connectivity.ok && result.chat.ok
  return result
}
