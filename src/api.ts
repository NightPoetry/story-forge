import { ApiFormat, ApiCheckResult, ChatMessage, StoryNodeData } from './types'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export const genId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

// ── Environment detection ─────────────────────────────────────────────────

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isLocalUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '[::1]'
      || hostname.startsWith('192.168.')
      || hostname.startsWith('10.')
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  } catch { return false }
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
  aiWritingRules?: string,
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
    const lines: string[] = ['# 逆伏笔档案（作者机密——绝不直接透露给读者）']
    if (planted.length > 0) {
      lines.push('\n## 待回收（刻意隐藏的真相。写作时通过暗示和误导让读者与主角一同被欺骗——暗示要有，但必须用剧情歪曲其含义，让人完全往相反方向理解。绝不得直接揭示）')
      for (const f of planted) {
        lines.push(`\n[${f.id}] 隐藏真相：${f.secret}`)
        if (f.plantNote.trim()) lines.push(`暗示与误导方式：${f.plantNote}`)
      }
    }
    if (collected.length > 0) {
      lines.push('\n## 已回收（已在故事中揭示，可以公开引用）')
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

  // AI 写作规则
  if (aiWritingRules?.trim()) {
    parts.push(`# AI 写作规则\n${aiWritingRules.trim()}`)
  }

  // 空内容自动初始化提示
  const emptyParts: string[] = []
  if (!node.stateCard.content.trim()) emptyParts.push('状态卡片')
  if (!aiWritingRules?.trim()) emptyParts.push('AI 写作规则')
  if (foreshadowings.length === 0) emptyParts.push('伏笔档案')
  if (emptyParts.length > 0) {
    parts.push(`# 自动初始化提示\n以下内容当前为空：${emptyParts.join('、')}。如果用户的指令涉及故事创作或设定建立，请在完成主要任务的同时，主动调用对应工具进行初始化填充（伏笔需要故事有基础设定后才初始化）。`)
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
      '更新派生状态卡片，追踪人物状态、世界状态、关键情节。当：①故事出现重要变化（新人物/关键事件/场景切换）②用户要求建立世界观/人物设定/基础设定/初始状态时调用。设定类请求优先更新状态卡片，不必写故事正文。必须在现有卡片基础上增量更新：保留所有仍然有效的信息，增补新变化，修正已过时的内容，绝不可丢弃未变化的信息。',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '更新后的完整状态卡片。在现有内容基础上增补和修正，保留所有仍有效的信息，涵盖：人物（身份/状态/关系）、地点、时间线、关键事件、世界观规则、伏笔状态',
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
    '当故事情节自然发展到揭示某逆伏笔的时机，揭开隐藏真相，让读者和主角同时恍然大悟。只能使用伏笔档案中列出的ID。',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: '要回收的伏笔ID，如 F1、F2（必须是伏笔档案中存在的）' },
      reveal_note: { type: 'string', description: '简短说明如何在故事中揭示了该伏笔' },
    },
    required: ['id', 'reveal_note'],
  },
} as const

const ADD_FORESHADOWING_TOOL = {
  name: 'add_foreshadowing',
  description:
    '添加新的逆伏笔。当用户要求创建伏笔、设计隐藏真相，或当伏笔档案为空且故事已有足够设定时，主动为故事设计伏笔。每次调用添加一条，可多次调用添加多条。',
  input_schema: {
    type: 'object' as const,
    properties: {
      secret: { type: 'string', description: '隐藏的真相——只有作者知道的秘密，读者和主角都被蒙在鼓里' },
      plant_note: { type: 'string', description: '如何在故事中暗示并误导：要植入什么线索，以及如何歪曲其含义让读者往相反方向理解' },
    },
    required: ['secret', 'plant_note'],
  },
} as const

const UPDATE_WRITING_RULES_TOOL = {
  name: 'update_writing_rules',
  description:
    '更新 AI 写作规则。当用户明确要求修改写作风格、叙事规则、文风约定等写作层面的规则时调用。必须在现有规则基础上增量更新：保留仍有效的规则，增补新规则，修正已过时的内容。',
  input_schema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: '更新后的完整 AI 写作规则文本',
      },
    },
    required: ['content'],
  },
} as const

const REPORT_FORWARD_FORESHADOWING_TOOL = {
  name: 'report_forward_foreshadowing',
  description:
    '每次调用 write_story 后必须调用此工具，报告正伏笔使用情况：哪些上文细节被编织进了当前剧情（used），以及哪些上文细节适合在后续发挥作用（candidates）。如果没有则传空数组。',
  input_schema: {
    type: 'object' as const,
    properties: {
      used: {
        type: 'array',
        description: '本次写作中实际使用的上文细节',
        items: {
          type: 'object',
          properties: {
            detail: { type: 'string', description: '上文中的原始细节' },
            source: { type: 'string', description: '出自哪个章节/段落' },
            usage: { type: 'string', description: '在本次写作中如何发挥了作用' },
          },
          required: ['detail', 'source', 'usage'],
        },
      },
      candidates: {
        type: 'array',
        description: '上文中值得在后续利用但本次未用的细节',
        items: {
          type: 'object',
          properties: {
            detail: { type: 'string', description: '上文中的细节' },
            source: { type: 'string', description: '出自哪个章节/段落' },
            potential: { type: 'string', description: '可以如何利用' },
          },
          required: ['detail', 'source', 'potential'],
        },
      },
    },
    required: ['used', 'candidates'],
  },
} as const

const TOOL_GUIDANCE = `你是专业故事创作助手。根据用户指令，调用合适的工具：
- 用户要写/续写/修改故事情节 → 调用 write_story
  - 【正伏笔·自动】写作时主动回溯上文已有的细节（人物动作、物品、场景描写、对话中不经意提到的信息等），将其自然地编织进当前剧情以增强合理性。例如：主角陷入困境时，用上文中某个不起眼的细节帮助脱困；新的剧情转折通过前文某句话获得了伏笔式的呼应。这种"其实前面早就写过"的惊喜感是正伏笔的核心。
  - 【逆伏笔·设计】根据伏笔档案中的隐藏真相，在故事中植入暗示但必须用剧情歪曲其含义，让读者和主角一同被误导——暗示要有，但理解方向必须是错的。
  - 调用 write_story 后**必须**调用 report_forward_foreshadowing，报告用了哪些上文细节、还有哪些可用的候选细节。
- 用户要求建立设定、世界观、人物背景，或故事出现重要变化 → 调用 update_state_card
- 用户要求修改写作风格、叙事规则、文风约定等写作层面的规则 → 调用 update_writing_rules
- 用户要求创建伏笔、设计隐藏真相 → 调用 add_foreshadowing（每次一条，可多次调用）
- 故事情节自然发展到揭示某伏笔的合适时机 → 调用 collect_foreshadowing（仅当伏笔档案有待回收项时可用）
- 【自动初始化】如果上方提示某些内容为空，在完成用户主要请求的同时，主动调用对应工具填充合理的初始内容：
  - 状态卡片为空 → 根据已知信息调用 update_state_card 初始化
  - AI 写作规则为空 → 根据故事类型和风格调用 update_writing_rules 生成适合的写作规则
  - 伏笔档案为空且故事已有基础设定 → 调用 add_foreshadowing 设计 2-3 条伏笔
- 可同时调用多个工具
- 每次响应必须调用 chat_reply 向用户简短说明操作（不要复述正文）`

// Extracts the partial (or complete) string value for `key` from a partially-received
// JSON buffer. Returns null if the key/opening-quote hasn't arrived yet.
import { dlog } from './debugLog'

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
  | { type: 'update_writing_rules'; content: string }
  | { type: 'chat_reply'; content: string }
  | { type: 'collect_foreshadowing'; id: string; revealNote: string }
  | { type: 'add_foreshadowing'; secret: string; plantNote: string }
  | { type: 'report_forward_foreshadowing'; used: { detail: string; source: string; usage: string }[]; candidates: { detail: string; source: string; potential: string }[] }

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
  if (isTauri() && !isLocalUrl(url)) {
    dlog.info('fetch', `using tauri-http for: ${url}`)
    try {
      const res = await tauriFetch(url, { method: 'POST', headers, signal, body })
      dlog.info('fetch', `tauri-http response: ${res.status}, body readable: ${!!res.body}`)
      return res
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : JSON.stringify(e)
      dlog.warn('fetch', `tauri-http failed, falling back: ${errMsg}`, { type: typeof e, constructor: (e as object)?.constructor?.name, stringified: String(e).slice(0, 200) })
      console.warn('[tauri-http] falling back to native fetch:', errMsg)
    }
  } else {
    dlog.info('fetch', `using native fetch (non-Tauri): ${url}`)
  }
  return await fetch(url, { method: 'POST', headers, signal, body })
}

const yieldToPaint = () => new Promise<void>(r => setTimeout(r, 0))

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
  let chunkCount = 0
  let dataEventCount = 0
  dlog.info('postSSE', `streaming started from ${url}`)
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal?.aborted) { reader.cancel(); break }
    chunkCount++
    const chunk = decoder.decode(value, { stream: true })
    dlog.stream('postSSE', `chunk #${chunkCount} (${chunk.length} bytes)`, chunk.slice(0, 200))
    buf += chunk
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    // Collect data events from this chunk
    const events: string[] = []
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw && raw !== '[DONE]') events.push(raw)
    }

    // If many events arrived in one chunk (WKWebView buffering), yield between
    // processing them so the browser can repaint and show incremental progress
    if (events.length > 3) {
      dlog.info('postSSE', `buffered chunk detected: ${events.length} events in 1 chunk, yielding between events`)
      for (const raw of events) {
        if (signal?.aborted) break
        dataEventCount++
        onData(raw)
        await yieldToPaint()
      }
    } else {
      for (const raw of events) {
        dataEventCount++
        onData(raw)
      }
    }
  }
  dlog.info('postSSE', `streaming done: ${chunkCount} chunks, ${dataEventCount} data events`)
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
  toolStreamMode?: import('./types').ToolStreamMode,
) {
  const fullSystem = systemPrompt
  type ToolDef = { name: string; description: string; input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] } }
  const tools = [
    ...STORY_TOOLS,
    UPDATE_WRITING_RULES_TOOL,
    ADD_FORESHADOWING_TOOL,
    REPORT_FORWARD_FORESHADOWING_TOOL,
    ...(hasActiveForeshadowings ? [COLLECT_FORESHADOWING_TOOL] : []),
  ] as unknown as ToolDef[]

  if (cfg.apiFormat === 'anthropic') {
    await runAnthropicStreamingToolUse(
      cfg, fullSystem, messages, tools, onAction, onToolStart, onComplete, onError, signal, onStreamDelta,
    )
  } else if (toolStreamMode === 'streaming') {
    await runOpenAIToolUse(
      cfg, fullSystem, messages, tools, onAction, onToolStart, onComplete, onError, signal, onStreamDelta,
    )
  } else {
    // 'complete' or 'none': use plain text XML mode for true streaming
    dlog.info('generation', `using plain text mode (toolStreamMode=${toolStreamMode})`)
    await runOpenAIPlainFallback(
      cfg, fullSystem, messages, onAction, onToolStart, onComplete, onError, signal, onStreamDelta,
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
          if (block?.type === 'thinking') onToolStart('__reasoning__')
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
                  : block.name === 'update_writing_rules' ? 'content'
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
              const input = JSON.parse(block.buf) as Record<string, unknown>
              if (block.name === 'write_story') onAction({ type: 'write_story', content: (input.content as string) ?? '' })
              else if (block.name === 'update_state_card') onAction({ type: 'update_state_card', content: (input.content as string) ?? '' })
              else if (block.name === 'update_writing_rules') onAction({ type: 'update_writing_rules', content: (input.content as string) ?? '' })
              else if (block.name === 'chat_reply') { onAction({ type: 'chat_reply', content: (input.message as string) ?? '' }); hasChatReply = true }
              else if (block.name === 'collect_foreshadowing') onAction({ type: 'collect_foreshadowing', id: (input.id as string) ?? '', revealNote: (input.reveal_note as string) ?? '' })
              else if (block.name === 'add_foreshadowing') onAction({ type: 'add_foreshadowing', secret: (input.secret as string) ?? '', plantNote: (input.plant_note as string) ?? '' })
              else if (block.name === 'report_forward_foreshadowing') {
                onAction({
                  type: 'report_forward_foreshadowing',
                  used: (input.used as { detail: string; source: string; usage: string }[]) ?? [],
                  candidates: (input.candidates as { detail: string; source: string; potential: string }[]) ?? [],
                })
              }
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
  let reasoningNotified = false

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

        // Detect reasoning/thinking content (DeepSeek, GLM, etc.)
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content && !reasoningNotified) {
          reasoningNotified = true
          onToolStart('__reasoning__')
        }

        if (typeof delta.content === 'string' && delta.content) {
          plainContent += delta.content
          dlog.stream('openai-tool', 'plain content delta', delta.content.slice(0, 80))
        }

        const tcDeltas = delta.tool_calls as { index: number; function?: { name?: string; arguments?: string } }[] | undefined
        if (tcDeltas) {
          for (const tcd of tcDeltas) {
            let accum = toolAccums.get(tcd.index)
            if (!accum) {
              const name = tcd.function?.name ?? ''
              accum = { index: tcd.index, name, argBuf: '' }
              toolAccums.set(tcd.index, accum)
              if (name) { onToolStart(name); dlog.info('openai-tool', `tool started: ${name}`) }
            }
            if (tcd.function?.name && !accum.name) { accum.name = tcd.function.name; onToolStart(accum.name) }
            if (tcd.function?.arguments) {
              accum.argBuf += tcd.function.arguments
              dlog.stream('openai-tool', `arg delta [${accum.name}] bufLen=${accum.argBuf.length}`, tcd.function.arguments.slice(0, 100))
              if (onStreamDelta) {
                const streamKey = accum.name === 'write_story' ? 'content' : accum.name === 'update_state_card' ? 'content' : accum.name === 'update_writing_rules' ? 'content' : null
                if (streamKey) {
                  const text = extractPartialStringValue(accum.argBuf, streamKey)
                  dlog.stream('openai-tool', `extract [${accum.name}] result=${text !== null ? text.length + ' chars' : 'null'}`)
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
      const args = JSON.parse(accum.argBuf) as Record<string, unknown>
      if (accum.name === 'write_story') onAction({ type: 'write_story', content: (args.content as string) ?? '' })
      else if (accum.name === 'update_state_card') onAction({ type: 'update_state_card', content: (args.content as string) ?? '' })
      else if (accum.name === 'update_writing_rules') onAction({ type: 'update_writing_rules', content: (args.content as string) ?? '' })
      else if (accum.name === 'chat_reply') { onAction({ type: 'chat_reply', content: (args.message as string) ?? '' }); hasChatReply = true }
      else if (accum.name === 'collect_foreshadowing') onAction({ type: 'collect_foreshadowing', id: (args.id as string) ?? '', revealNote: (args.reveal_note as string) ?? '' })
      else if (accum.name === 'add_foreshadowing') onAction({ type: 'add_foreshadowing', secret: (args.secret as string) ?? '', plantNote: (args.plant_note as string) ?? '' })
      else if (accum.name === 'report_forward_foreshadowing') {
        onAction({
          type: 'report_forward_foreshadowing',
          used: (args.used as { detail: string; source: string; usage: string }[]) ?? [],
          candidates: (args.candidates as { detail: string; source: string; potential: string }[]) ?? [],
        })
      }
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

更新写作规则时（用户要求修改写作风格、叙事规则等）：
<update_writing_rules>
完整的写作规则文本
</update_writing_rules>

添加伏笔时（用户要求创建伏笔，或伏笔为空时主动设计）：
<add_foreshadowing secret="隐藏的真相" plant_note="暗示与误导方式" />
可多次使用添加多条。

回收伏笔时（仅当伏笔档案有待回收项）：
<collect_foreshadowing id="F1" reveal_note="如何揭示的说明" />

如果写了故事正文，必须报告正伏笔使用情况：
<forward_foreshadowing>
used: [{"detail":"上文细节","source":"出处","usage":"如何使用"}]
candidates: [{"detail":"上文细节","source":"出处","potential":"可以如何利用"}]
</forward_foreshadowing>
如果没有则传空数组。

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

  const writingRules = extractTag('update_writing_rules')
  if (writingRules) actions.push({ type: 'update_writing_rules', content: writingRules })

  // <add_foreshadowing secret="..." plant_note="..." />
  const afRe = /<add_foreshadowing\s+secret="([^"]*?)"\s+plant_note="([^"]*?)"\s*\/?>/g
  let afm
  while ((afm = afRe.exec(text)) !== null) {
    actions.push({ type: 'add_foreshadowing', secret: afm[1], plantNote: afm[2] })
  }

  // <collect_foreshadowing id="F1" reveal_note="..." /> or with closing tag
  const fRe = /<collect_foreshadowing\s+id="([^"]*?)"\s+reveal_note="([^"]*?)"\s*\/?>/g
  let fm
  while ((fm = fRe.exec(text)) !== null) {
    actions.push({ type: 'collect_foreshadowing', id: fm[1], revealNote: fm[2] })
  }

  // <forward_foreshadowing> block
  const ffBlock = extractTag('forward_foreshadowing')
  if (ffBlock) {
    try {
      const usedMatch = /used:\s*(\[[\s\S]*?\])/.exec(ffBlock)
      const candMatch = /candidates:\s*(\[[\s\S]*?\])/.exec(ffBlock)
      const used = usedMatch ? JSON.parse(usedMatch[1]) as { detail: string; source: string; usage: string }[] : []
      const candidates = candMatch ? JSON.parse(candMatch[1]) as { detail: string; source: string; potential: string }[] : []
      actions.push({ type: 'report_forward_foreshadowing', used, candidates })
    } catch { /* ignore parse errors */ }
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
  const STREAMABLE_TAGS = ['write_story', 'update_state_card', 'update_writing_rules', 'chat_reply'] as const
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
    const anthConnUrl = `${base}/v1/messages`
    const anthConnHeaders = anthropicHeaders(cfg.apiKey)
    try {
      res = await doStreamFetch(anthConnUrl, anthConnHeaders, JSON.stringify({ model: cfg.apiModel, max_tokens: 32, messages: testMsg }))
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
      const toolRes = await doStreamFetch(anthConnUrl, anthConnHeaders, JSON.stringify({
          model: cfg.apiModel, max_tokens: 64,
          messages: [{ role: 'user', content: '请调用test工具，参数msg填"ok"' }],
          tools: [{ name: 'test', description: '测试工具', input_schema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } }],
        }))
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
      const streamRes = await doStreamFetch(anthConnUrl, anthConnHeaders, JSON.stringify({ model: cfg.apiModel, max_tokens: 16, stream: true, messages: testMsg }))
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
    const connUrl = `${base}/chat/completions`
    const connHeaders = openaiHeaders(cfg.apiKey)
    const connBody = JSON.stringify({ model: cfg.apiModel, max_tokens: 32, messages: [{ role: 'system', content: 'reply OK' }, ...testMsg] })
    try {
      res = await doStreamFetch(connUrl, connHeaders, connBody)
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

    // 2. Tool use — streaming test to detect if arguments arrive incrementally
    try {
      let argDeltaCount = 0
      let hasTool = false
      const toolSSE = await postSSE(
        `${base}/chat/completions`,
        openaiHeaders(cfg.apiKey),
        {
          model: cfg.apiModel, max_tokens: 64, stream: true,
          messages: [{ role: 'user', content: '请调用test工具，参数msg填"ok"' }],
          tools: [{
            type: 'function',
            function: { name: 'test', description: '测试工具', parameters: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } },
          }],
          tool_choice: 'auto',
        },
        (raw) => {
          try {
            const evt = JSON.parse(raw) as { choices?: { delta: { tool_calls?: { function?: { arguments?: string } }[] } }[] }
            const tcs = evt.choices?.[0]?.delta?.tool_calls
            if (tcs) {
              hasTool = true
              for (const tc of tcs) {
                if (tc.function?.arguments) argDeltaCount++
              }
            }
          } catch { /* ignore */ }
        },
      )
      if (toolSSE.ok && hasTool) {
        // argDeltaCount > 2 means arguments streamed incrementally
        if (argDeltaCount > 2) {
          result.toolUse = { ok: true, message: 'Function Call 支持正常（参数增量流式）' }
          result.toolStreamMode = 'streaming'
        } else {
          result.toolUse = { ok: true, message: 'Function Call 支持正常（参数非增量，将使用纯文本流式模式）' }
          result.toolStreamMode = 'complete'
        }
      } else if (toolSSE.ok) {
        result.toolUse = { ok: true, message: '请求成功但模型未调用工具（将使用纯文本流式模式）' }
        result.toolStreamMode = 'none'
      } else {
        result.toolUse = { ok: false, message: `不支持 Function Call (HTTP ${(toolSSE as { status: number }).status})，将使用纯文本流式模式` }
        result.toolStreamMode = 'none'
      }
    } catch (e) {
      result.toolUse = { ok: false, message: (e as Error).message }
      result.toolStreamMode = 'none'
    }

    // 3. Streaming
    try {
      const streamRes = await doStreamFetch(
        `${base}/chat/completions`,
        openaiHeaders(cfg.apiKey),
        JSON.stringify({ model: cfg.apiModel, max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'say hi' }] }),
      )
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
