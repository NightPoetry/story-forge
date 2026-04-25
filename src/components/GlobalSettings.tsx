import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { dlog } from '../debugLog'

export default function GlobalSettings() {
  const {
    isGlobalSettingsOpen, setIsGlobalSettingsOpen,
    aiWritingRules, setAiWritingRules,
    nodes, selectedNodeId, getAncestorChain,
    projectWritingGuide,
    apiKey, apiUrl, apiFormat, apiModel, globalSettings,
  } = useStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string; suggestion?: string; applied?: boolean; _prev?: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (isGlobalSettingsOpen) {
      setTimeout(() => textareaRef.current?.focus(), 120)
    }
  }, [isGlobalSettingsOpen])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatHistory])

  if (!isGlobalSettingsOpen) return null

  const node = selectedNodeId ? nodes[selectedNodeId] : null

  const buildContext = () => {
    const parts: string[] = []
    if (node) {
      const ancestors = getAncestorChain(selectedNodeId!)
      const withContent = ancestors.filter(a => a.storyContent.trim())
      if (withContent.length > 0) {
        parts.push('# 故事上文\n' + withContent.map(a => `【${a.title}】\n${a.storyContent.trim().slice(0, 300)}`).join('\n\n'))
      }
      if (node.storyContent.trim()) parts.push(`# 当前节点「${node.title}」\n${node.storyContent.trim().slice(0, 500)}`)
      if (node.stateCard.content.trim()) parts.push(`# 状态卡片\n${node.stateCard.content.trim()}`)
      const fs = node.foreshadowings?.filter(f => f.status === 'planted') ?? []
      if (fs.length > 0) parts.push(`# 伏笔档案\n${fs.map(f => `[${f.id}] ${f.secret}`).join('\n')}`)
    }
    if (projectWritingGuide.trim()) parts.push(`# 故事设定\n${projectWritingGuide.trim()}`)
    return parts.join('\n\n---\n\n')
  }

  const handleAISend = async () => {
    if (!chatInput.trim() || generating || !apiKey) return
    const userText = chatInput.trim()
    setChatInput('')

    const newHistory = [...chatHistory, { role: 'user' as const, content: userText }]
    setChatHistory(newHistory)

    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)

    try {
      const context = buildContext()
      const systemPrompt = `你是写作规则顾问，帮助作者编辑写作规则。你能看到完整的故事上下文。

当前写作规则：
${aiWritingRules.trim() || '（空）'}

你必须调用 edit_rules 工具回复。
- message：简短说明修改理由
- rules：修改后的完整写作规则文本（完整替换，不是差异）。如果不需要修改则不填
- 倾向于主动给出修改后的规则而非反问
${globalSettings.trim() ? `\n全局设定：${globalSettings.trim()}` : ''}`

      const toolDef = {
        name: 'edit_rules',
        description: '回复作者并可选提供写作规则修改建议',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '对作者的回复' },
            rules: { type: 'string', description: '修改后的完整写作规则文本。仅在建议修改时提供' },
          },
          required: ['message'],
        },
      }

      const chatMessages = [
        ...(context ? [{ role: 'user' as const, content: `故事上下文：\n\n${context}` }] : []),
        ...newHistory.map(m => ({ role: m.role, content: m.content })),
      ]

      const base = apiUrl.replace(/\/+$/, '')
      let reply = ''
      let suggestion: string | undefined

      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      const fetchFn = isTauri ? (await import('@tauri-apps/plugin-http')).fetch : fetch

      if (apiFormat === 'anthropic') {
        const resolvedBase = (() => {
          const isOfficial = base === 'https://api.anthropic.com' || base === 'http://api.anthropic.com'
          if (isOfficial && !isTauri) return '/api/anthropic'
          return base
        })()
        const res = await fetchFn(`${resolvedBase}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model: apiModel, max_tokens: 2048, system: systemPrompt, messages: chatMessages,
            tools: [{ name: toolDef.name, description: toolDef.description, input_schema: toolDef.parameters }],
          }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json() as { content?: { type: string; text?: string; input?: Record<string, string> }[] }
          for (const block of data.content ?? []) {
            if (block.type === 'text' && block.text) reply = block.text
            if (block.type === 'tool_use' && block.input) {
              reply = block.input.message ?? reply
              if (block.input.rules) suggestion = block.input.rules
            }
          }
        }
      } else {
        let resolvedBase = base
        if (!isTauri) {
          try {
            const u = new URL(base)
            const h = u.hostname
            if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.'))
              resolvedBase = `/api/local/${u.hostname}/${u.port}${u.pathname}`
          } catch { /* keep */ }
        }
        const res = await fetchFn(`${resolvedBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: apiModel, max_tokens: 2048,
            messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
            tools: [{ type: 'function', function: toolDef }],
            tool_choice: 'required',
          }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json() as { choices?: { message: { content?: string; tool_calls?: { function: { arguments: string } }[] } }[] }
          const msg = data.choices?.[0]?.message
          reply = msg?.content ?? ''
          const tc = msg?.tool_calls?.[0]
          if (tc) {
            try {
              const args = JSON.parse(tc.function.arguments) as Record<string, string>
              reply = args.message ?? reply
              if (args.rules) suggestion = args.rules
            } catch { /* ignore */ }
          }
        }
      }

      if (!controller.signal.aborted) {
        setChatHistory(prev => [...prev, {
          role: 'assistant', content: reply || '已分析。',
          ...(suggestion ? { suggestion } : {}),
        }])
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        dlog.warn('writing-rules', `AI error: ${(e as Error).message}`)
        setChatHistory(prev => [...prev, { role: 'assistant', content: `出错：${(e as Error).message}` }])
      }
    }
    setGenerating(false)
  }

  const applySuggestion = (idx: number) => {
    const msg = chatHistory[idx]
    if (!msg?.suggestion) return
    const prev = aiWritingRules
    setAiWritingRules(msg.suggestion)
    setChatHistory(p => p.map((m, i) => i === idx ? { ...m, applied: true, _prev: prev } : m))
  }

  const undoSuggestion = (idx: number) => {
    const msg = chatHistory[idx]
    if (msg?._prev === undefined) return
    setAiWritingRules(msg._prev)
    setChatHistory(p => p.map((m, i) => i === idx ? { ...m, applied: false, _prev: undefined } : m))
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        style={{ background: 'rgba(10,9,18,0.5)' }}
        onClick={() => setIsGlobalSettingsOpen(false)}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-40 flex flex-col drawer-enter"
        style={{
          width: 'min(420px, 100vw)',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-gold)',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.5)',
        }}>

        {/* Header */}
        <div
          className="flex-shrink-0 flex items-start justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="min-w-0 pr-3">
            <h2 className="font-serif text-lg" style={{ color: 'var(--text-primary)' }}>
              写作规则
            </h2>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              手动编辑或通过 AI 对话辅助修改
            </p>
          </div>
          <button
            onClick={() => setIsGlobalSettingsOpen(false)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        {/* Rules textarea */}
        <div className="flex-shrink-0 px-6 pt-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
              规则内容
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {aiWritingRules.length} 字符
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={aiWritingRules}
            onChange={(e) => setAiWritingRules(e.target.value)}
            placeholder={'示例：\n- 叙事视角：第三人称限知视角\n- 文风：克制内敛，少用形容词堆砌\n- 对话风格：简洁有力，避免说教'}
            className="w-full text-sm resize-none outline-none rounded p-3"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontFamily: '"DM Sans", sans-serif',
              lineHeight: '1.7',
              minHeight: '100px',
              maxHeight: '180px',
            }}
            spellCheck={false}
          />
        </div>

        {/* Divider */}
        <div className="flex-shrink-0 px-6 py-1">
          <div className="flex items-center gap-2">
            <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
            <span className="flex items-center gap-1" style={{ color: 'var(--gold)', fontSize: '9px', opacity: 0.7, whiteSpace: 'nowrap' }}>
              AI 辅助编辑
            </span>
            <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
          </div>
        </div>

        {/* AI Chat area */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-6 py-2">
          {chatHistory.length === 0 && (
            <div className="text-center py-6" style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.5, lineHeight: 1.8 }}>
              AI 能看到故事上下文
              <br />
              <span style={{ fontSize: '10px' }}>
                试试：「生成适合这个故事的写作规则」
                <br />
                「把文风改为轻松幽默」
              </span>
            </div>
          )}
          <div className="space-y-2.5">
            {chatHistory.map((msg, i) => (
              <div key={i}>
                <div className="text-xs mb-0.5" style={{ color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--gold-dim)', fontSize: '9px' }}>
                  {msg.role === 'user' ? '你' : 'AI'}
                </div>
                <div className="text-xs rounded px-2.5 py-2"
                  style={{
                    background: msg.role === 'user' ? 'rgba(240,235,224,0.06)' : 'rgba(201,169,110,0.05)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(240,235,224,0.08)' : 'var(--border-gold)'}`,
                    color: 'var(--text-primary)', fontSize: '12px', lineHeight: 1.65, whiteSpace: 'pre-wrap',
                  }}>
                  {msg.content}
                </div>
                {msg.suggestion && (
                  <div className="mt-1.5 rounded px-2.5 py-2"
                    style={{ background: 'rgba(180,140,90,0.08)', border: '1px solid rgba(180,140,90,0.2)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: '#b8916a', fontSize: '10px', fontWeight: 500 }}>
                        {msg.applied ? '已应用' : '建议修改'}
                      </span>
                      <div className="flex gap-1.5">
                        {msg.applied && (
                          <button onClick={() => undoSuggestion(i)}
                            className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-80"
                            style={{ color: 'rgba(200,80,80,0.7)', border: '1px solid rgba(200,80,80,0.25)', fontSize: '10px' }}>
                            撤销
                          </button>
                        )}
                        {!msg.applied && (
                          <button onClick={() => applySuggestion(i)}
                            className="text-xs px-2.5 py-0.5 rounded transition-all hover:brightness-110"
                            style={{ background: 'rgba(180,140,90,0.25)', color: '#b8916a', border: '1px solid rgba(180,140,90,0.4)', fontSize: '10px', fontWeight: 500 }}>
                            应用修改
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.5, opacity: msg.applied ? 0.5 : 1, maxHeight: '120px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                      {msg.suggestion.length > 200 ? msg.suggestion.slice(0, 200) + '…' : msg.suggestion}
                    </p>
                  </div>
                )}
              </div>
            ))}
            {generating && (
              <div className="flex items-center gap-2 text-xs px-2.5 py-2 rounded"
                style={{ background: 'rgba(201,169,110,0.05)', border: '1px solid var(--border-gold)', color: 'var(--text-muted)', fontSize: '11px' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full generating-pulse" style={{ background: 'var(--gold)', flexShrink: 0 }} />
                思考中…
              </div>
            )}
          </div>
          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        <div className="flex-shrink-0 flex items-end gap-1.5 px-6 pb-3 pt-2"
          style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAISend() } }}
            disabled={generating || !apiKey}
            placeholder={!apiKey ? '请先配置 API Key' : generating ? '生成中…' : '输入指令，回车发送…'}
            rows={2}
            className="flex-1 resize-none outline-none text-xs"
            style={{ background: 'transparent', color: 'var(--text-primary)', fontSize: '12px', lineHeight: 1.6 }}
          />
          <button onClick={handleAISend} disabled={generating || !apiKey || !chatInput.trim()}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all mb-0.5"
            style={{
              background: generating || !apiKey || !chatInput.trim() ? 'rgba(201,169,110,0.15)' : 'var(--gold)',
              opacity: generating || !apiKey || !chatInput.trim() ? 0.5 : 1,
            }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 10L6 2L10 10L6 8L2 10Z"
                fill={generating || !apiKey || !chatInput.trim() ? 'var(--gold)' : '#0e0d15'} />
            </svg>
          </button>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.55, fontSize: '10px' }}>
              优先级：写作规则 &lt; 故事设定 &lt; 状态卡片
            </p>
            {aiWritingRules.length > 0 && (
              <button
                onClick={() => setAiWritingRules('')}
                className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-70"
                style={{ color: 'rgba(200,80,80,0.6)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '10px' }}>
                清空
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
