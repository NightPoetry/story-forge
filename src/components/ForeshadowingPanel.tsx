import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { ForeshadowingChatMessage, ForeshadowingItem, ForwardForeshadowingReport } from '../types'
import { genId } from '../api'
import { dlog } from '../debugLog'

interface Props {
  nodeId: string
}

export default function ForeshadowingPanel({ nodeId }: Props) {
  const { nodes, addForeshadowing, updateForeshadowing, removeForeshadowing } = useStore()
  const node = nodes[nodeId]
  const [adding, setAdding] = useState(false)
  const [newSecret, setNewSecret] = useState('')
  const [newPlantNote, setNewPlantNote] = useState('')

  if (!node) return null

  const foreshadowings = node.foreshadowings ?? []
  const planted = foreshadowings.filter((f) => f.status === 'planted')
  const collected = foreshadowings.filter((f) => f.status === 'collected')

  const handleAdd = () => {
    if (!newSecret.trim()) return
    addForeshadowing(nodeId, newSecret.trim(), newPlantNote.trim())
    setNewSecret('')
    setNewPlantNote('')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium"
            style={{ color: '#b8916a', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
            伏笔设计
          </span>
          {planted.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(180,140,90,0.15)', color: '#b8916a', fontSize: '9px' }}>
              {planted.length} 待回收
            </span>
          )}
          {collected.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(80,160,100,0.1)', color: '#4a9060', fontSize: '9px' }}>
              {collected.length} 已回收
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="text-xs px-2 py-0.5 rounded transition-all"
          style={{ color: '#b8916a', border: '1px solid rgba(180,140,90,0.3)', fontSize: '10px' }}>
          + 添加
        </button>
      </div>

      {/* Forward foreshadowing chronicle */}
      <ForwardForeshadowingSection report={node.forwardForeshadowing} />

      {/* Divider between forward and reverse sections */}
      <div className="flex items-center gap-2 pt-1">
        <div style={{ height: '1px', flex: 1, background: 'rgba(180,140,90,0.15)' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.5, whiteSpace: 'nowrap' }}>逆伏笔设计</span>
        <div style={{ height: '1px', flex: 1, background: 'rgba(180,140,90,0.15)' }} />
      </div>

      {/* Add form */}
      {adding && (
        <div className="p-2 rounded space-y-1.5"
          style={{ background: 'rgba(180,140,90,0.06)', border: '1px dashed rgba(180,140,90,0.25)' }}>
          <textarea
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
            placeholder="隐藏真相（只有作者知道的秘密）…"
            rows={2}
            autoFocus
            className="w-full text-xs resize-none outline-none"
            style={{ background: 'transparent', color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.6, fontSize: '11px' }}
          />
          <textarea
            value={newPlantNote}
            onChange={(e) => setNewPlantNote(e.target.value)}
            placeholder="暗示与误导（可选）：如何暗示真相但让读者往相反方向理解…"
            rows={2}
            className="w-full text-xs resize-none outline-none"
            style={{ background: 'transparent', color: 'var(--text-muted)', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.6, fontSize: '11px' }}
          />
          <div className="flex gap-1.5">
            <button onClick={handleAdd} disabled={!newSecret.trim()}
              className="px-2 py-1 rounded text-xs transition-all"
              style={{ background: newSecret.trim() ? 'rgba(180,140,90,0.2)' : 'transparent', color: newSecret.trim() ? '#b8916a' : 'var(--text-muted)', border: '1px solid rgba(180,140,90,0.3)', fontSize: '10px' }}>
              添加伏笔
            </button>
            <button onClick={() => { setAdding(false); setNewSecret(''); setNewPlantNote('') }}
              className="px-2 py-1 rounded text-xs"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '10px' }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {foreshadowings.length === 0 && !adding && (
        <p className="text-center py-4 text-xs"
          style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: '11px', fontStyle: 'italic' }}>
          暂无伏笔 — 点击「+ 添加」设计隐藏真相
        </p>
      )}

      {/* Planted items */}
      <div className="space-y-1.5">
        {planted.map((f) => (
          <ForeshadowingCard
            key={f.id}
            item={f}
            nodeId={nodeId}
            onUpdate={(id, data) => updateForeshadowing(nodeId, id, data)}
            onRemove={(id) => removeForeshadowing(nodeId, id)}
          />
        ))}
      </div>

      {/* Collected items */}
      {collected.length > 0 && (
        <>
          {planted.length > 0 && (
            <div style={{ height: '1px', background: 'rgba(180,140,90,0.1)', margin: '4px 0' }} />
          )}
          <div className="space-y-1.5">
            {collected.map((f) => (
              <ForeshadowingCard
                key={f.id}
                item={f}
                nodeId={nodeId}
                onUpdate={(id, data) => updateForeshadowing(nodeId, id, data)}
                onRemove={(id) => removeForeshadowing(nodeId, id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ForeshadowingCard({
  item,
  nodeId,
  onUpdate,
  onRemove,
}: {
  item: ForeshadowingItem
  nodeId: string
  onUpdate: (id: string, data: Partial<ForeshadowingItem>) => void
  onRemove: (id: string) => void
}) {
  const isCollected = item.status === 'collected'
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="rounded px-2.5 py-2 cursor-pointer transition-all hover:brightness-110"
        onClick={() => setModalOpen(true)}
        style={{
          background: isCollected ? 'rgba(80,160,100,0.05)' : 'rgba(180,140,90,0.05)',
          border: `1px solid ${isCollected ? 'rgba(80,160,100,0.2)' : 'rgba(180,140,90,0.2)'}`,
        }}>
        <div className="flex items-start gap-2">
          <div className="flex-shrink-0 mt-0.5">
            {isCollected ? (
              <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(80,160,100,0.2)' }}>
                <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                  <path d="M1 3.5L2.8 5.5L6 1.5" stroke="#4a9060" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : (
              <div className="w-3.5 h-3.5 rounded-full"
                style={{ background: 'rgba(180,140,90,0.2)', border: '1px solid rgba(180,140,90,0.4)' }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-medium"
                style={{ color: isCollected ? '#4a9060' : '#b8916a', fontFamily: 'monospace', fontSize: '10px' }}>
                {item.id}
              </span>
              {isCollected && (
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>· 已回收</span>
              )}
              <span className="ml-auto text-xs" style={{ color: 'var(--gold)', fontSize: '9px', opacity: 0.6 }}>展开</span>
            </div>
            <p className="text-xs"
              style={{
                color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.6,
                opacity: isCollected ? 0.7 : 1, textDecoration: isCollected ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
              {item.secret}
            </p>
          </div>
          {!isCollected && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
              className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-30 hover:opacity-70 transition-all flex-shrink-0"
              style={{ color: 'rgba(200,80,80,0.8)' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {modalOpen && (
        <ForeshadowingEditModal
          item={item}
          nodeId={nodeId}
          onUpdate={onUpdate}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

// ── Foreshadowing Edit Modal (split pane: edit + AI chat) ────────────────

function ForeshadowingEditModal({
  item,
  nodeId,
  onUpdate,
  onClose,
}: {
  item: ForeshadowingItem
  nodeId: string
  onUpdate: (id: string, data: Partial<ForeshadowingItem>) => void
  onClose: () => void
}) {
  const { nodes, getAncestorChain, apiKey, apiUrl, apiFormat, apiModel, globalSettings, projectWritingGuide, aiWritingRules } = useStore()
  const node = nodes[nodeId]
  const isCollected = item.status === 'collected'

  const [secret, setSecret] = useState(item.secret)
  const [plantNote, setPlantNote] = useState(item.plantNote)
  const [revealNote, setRevealNote] = useState(item.revealNote ?? '')

  type ChatMsg = ForeshadowingChatMessage
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>(item.chatHistory ?? [])
  const [chatInput, setChatInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Persist chat history whenever it changes
  useEffect(() => {
    onUpdate(item.id, { chatHistory })
  }, [chatHistory])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !generating) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, generating])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatHistory])

  const handleSave = () => {
    onUpdate(item.id, { secret, plantNote, ...(isCollected ? { revealNote } : {}) })
  }

  // Build full context for AI so it understands the whole story
  const buildAIContext = () => {
    if (!node) return ''
    const ancestors = getAncestorChain(nodeId)
    const parts: string[] = []

    // Story chain
    const withContent = ancestors.filter(a => a.storyContent.trim())
    if (withContent.length > 0) {
      parts.push('# 故事上文\n' + withContent.map(a => `【${a.title}】\n${a.storyContent.trim()}`).join('\n\n'))
    }
    if (node.storyContent.trim()) {
      parts.push(`# 当前节点「${node.title}」\n${node.storyContent.trim()}`)
    }

    // State card
    if (node.stateCard.content.trim()) {
      parts.push(`# 状态卡片\n${node.stateCard.content.trim()}`)
    }

    // Story settings
    if (projectWritingGuide.trim()) parts.push(`# 故事设定\n${projectWritingGuide.trim()}`)
    if (aiWritingRules.trim()) parts.push(`# AI 写作规则\n${aiWritingRules.trim()}`)

    // All foreshadowings for context
    const allF = node.foreshadowings ?? []
    if (allF.length > 0) {
      const fLines = allF.map(f => {
        const marker = f.id === item.id ? ' ← 当前编辑' : ''
        return `[${f.id}]${marker} ${f.status === 'collected' ? '(已回收)' : '(待回收)'}\n  真相：${f.secret}\n  暗示：${f.plantNote}${f.revealNote ? `\n  揭示：${f.revealNote}` : ''}`
      })
      parts.push(`# 所有伏笔\n${fLines.join('\n\n')}`)
    }

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
      const context = buildAIContext()
      const systemPrompt = `你是伏笔设计顾问。你能看到整个故事的全貌（上文、状态卡片、所有伏笔），现在帮助作者编辑伏笔 [${item.id}]。

当前伏笔内容：
- 隐藏真相：${secret}
- 暗示与误导：${plantNote}
${isCollected ? `- 揭示方式：${revealNote}` : ''}

作者可能要你：修改真相内容、调整暗示方式、评估可行性、提出改进建议等。

你必须调用 edit_foreshadowing 工具回复。
- message 字段：简短说明修改理由（1-3句）
- 如果作者要求修改或改进，必须在 secret / plant_note / reveal_note 字段给出完整的修改后文本（不是差异，是完整替换文本）
- 只有纯评估/分析且作者没要求改动时，才可以省略修改字段
- 倾向于主动给出修改建议而非反问
${globalSettings.trim() ? `\n写作规则：${globalSettings.trim()}` : ''}`

      const toolDef = {
        name: 'edit_foreshadowing',
        description: '回复作者并可选地提供修改建议',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '对作者的回复：分析、说明、建议理由' },
            secret: { type: 'string', description: '修改后的隐藏真相（完整文本）。仅在建议修改时提供' },
            plant_note: { type: 'string', description: '修改后的暗示与误导（完整文本）。仅在建议修改时提供' },
            ...(isCollected ? { reveal_note: { type: 'string', description: '修改后的揭示方式（完整文本）。仅在建议修改时提供' } } : {}),
          },
          required: ['message'],
        },
      }

      const chatMessages = [
        { role: 'user' as const, content: `以下是完整的故事上下文：\n\n${context}` },
        ...newHistory.map(m => ({ role: m.role, content: m.content })),
      ]

      const base = apiUrl.replace(/\/+$/, '')
      let reply = ''
      let suggestion: ChatMsg['suggestion'] = undefined

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
            model: apiModel, max_tokens: 1024, system: systemPrompt, messages: chatMessages,
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
              suggestion = parseSuggestion(block.input)
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
            model: apiModel, max_tokens: 1024,
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
              suggestion = parseSuggestion(args)
            } catch { /* ignore */ }
          }
        }
      }

      if (!controller.signal.aborted) {
        const hasChanges = suggestion && (suggestion.secret || suggestion.plantNote || suggestion.revealNote)
        setChatHistory(prev => [...prev, {
          role: 'assistant', content: reply || '已分析。',
          ...(hasChanges ? { suggestion } : {}),
        }])
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        dlog.warn('foreshadowing-modal', `AI error: ${(e as Error).message}`)
        setChatHistory(prev => [...prev, { role: 'assistant', content: `出错：${(e as Error).message}` }])
      }
    }
    setGenerating(false)
  }

  const parseSuggestion = (args: Record<string, string>): ChatMsg['suggestion'] => {
    const s: ChatMsg['suggestion'] = {}
    if (args.secret && args.secret !== secret) s.secret = args.secret
    if (args.plant_note && args.plant_note !== plantNote) s.plantNote = args.plant_note
    if (args.reveal_note && args.reveal_note !== revealNote) s.revealNote = args.reveal_note
    return s
  }

  const applySuggestion = (idx: number) => {
    const msg = chatHistory[idx]
    if (!msg?.suggestion) return
    const s = msg.suggestion
    const prev = { secret, plantNote, revealNote }
    if (s.secret) { setSecret(s.secret); onUpdate(item.id, { secret: s.secret }) }
    if (s.plantNote) { setPlantNote(s.plantNote); onUpdate(item.id, { plantNote: s.plantNote }) }
    if (s.revealNote) { setRevealNote(s.revealNote); onUpdate(item.id, { revealNote: s.revealNote }) }
    setChatHistory(p => p.map((m, i) => i === idx ? { ...m, applied: true, _prev: prev } : m))
  }

  const undoSuggestion = (idx: number) => {
    const msg = chatHistory[idx] as ChatMsg & { _prev?: { secret: string; plantNote: string; revealNote: string } }
    if (!msg?._prev) return
    const p = msg._prev
    setSecret(p.secret); onUpdate(item.id, { secret: p.secret })
    setPlantNote(p.plantNote); onUpdate(item.id, { plantNote: p.plantNote })
    if (isCollected) { setRevealNote(p.revealNote); onUpdate(item.id, { revealNote: p.revealNote }) }
    setChatHistory(prev => prev.map((m, i) => i === idx ? { ...m, applied: false, _prev: undefined } : m))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,9,18,0.7)' }}
      onClick={() => !generating && onClose()}>
      <div
        className="flex flex-col rounded-lg overflow-hidden"
        style={{
          width: 'min(900px, 92vw)',
          height: 'min(600px, 85vh)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-gold)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <span className="font-medium" style={{ color: isCollected ? '#4a9060' : '#b8916a', fontFamily: 'monospace', fontSize: '12px' }}>
              {item.id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {isCollected ? '已回收' : '待回收'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { handleSave(); onClose() }}
              className="text-xs px-3 py-1 rounded transition-all hover:brightness-110"
              style={{ background: 'rgba(180,140,90,0.2)', color: '#b8916a', border: '1px solid rgba(180,140,90,0.3)', fontSize: '11px' }}>
              保存关闭
            </button>
            <button onClick={() => !generating && onClose()}
              className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-muted)' }}>
              ✕
            </button>
          </div>
        </div>

        {/* Split pane */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Edit pane */}
          <div className="flex-1 flex flex-col overflow-y-auto px-5 py-4 min-w-0"
            style={{ borderRight: '1px solid var(--border-subtle)' }}>
            <label className="text-xs mb-1.5" style={{ color: '#b8916a', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              隐藏真相
            </label>
            <textarea
              value={secret}
              onChange={(e) => { setSecret(e.target.value); onUpdate(item.id, { secret: e.target.value }) }}
              rows={4}
              className="w-full text-sm resize-none outline-none rounded p-3 mb-4"
              style={{
                background: 'var(--bg-elevated)', border: '1px solid rgba(180,140,90,0.2)',
                color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif', lineHeight: '1.7', fontSize: '13px',
              }}
            />

            <label className="text-xs mb-1.5" style={{ color: '#b8916a', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              暗示与误导
            </label>
            <textarea
              value={plantNote}
              onChange={(e) => { setPlantNote(e.target.value); onUpdate(item.id, { plantNote: e.target.value }) }}
              placeholder="如何在故事中暗示真相，同时让读者往相反方向理解…"
              rows={4}
              className="w-full text-sm resize-none outline-none rounded p-3 mb-4"
              style={{
                background: 'var(--bg-elevated)', border: '1px solid rgba(180,140,90,0.15)',
                color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif', lineHeight: '1.7', fontSize: '13px',
              }}
            />

            {isCollected && (
              <>
                <label className="text-xs mb-1.5" style={{ color: '#4a9060', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  揭示方式
                </label>
                <textarea
                  value={revealNote}
                  onChange={(e) => { setRevealNote(e.target.value); onUpdate(item.id, { revealNote: e.target.value }) }}
                  rows={3}
                  className="w-full text-sm resize-none outline-none rounded p-3"
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid rgba(80,160,100,0.2)',
                    color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif', lineHeight: '1.7', fontSize: '13px',
                  }}
                />
              </>
            )}
          </div>

          {/* Right: AI chat pane */}
          <div className="flex flex-col min-w-0" style={{ width: '340px', flexShrink: 0 }}>
            {/* Chat header */}
            <div className="flex items-center px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--gold)', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                AI 辅助编辑
              </span>
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.5 }}>
                纵览全局
              </span>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
              {chatHistory.length === 0 && (
                <div className="text-center py-6" style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.5, lineHeight: 1.8 }}>
                  AI 能看到完整故事上下文
                  <br />
                  <span style={{ fontSize: '10px' }}>
                    试试：「这条伏笔合理吗？」
                    <br />
                    「帮我改进暗示方式」
                  </span>
                </div>
              )}
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
                  {/* Suggestion preview + apply button */}
                  {msg.suggestion && (msg.suggestion.secret || msg.suggestion.plantNote || msg.suggestion.revealNote) && (
                    <div className="mt-1.5 rounded px-2.5 py-2"
                      style={{ background: 'rgba(180,140,90,0.08)', border: '1px solid rgba(180,140,90,0.2)' }}>
                      <div className="flex items-center justify-between mb-1.5">
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
                      {msg.suggestion.secret && (
                        <div className="mb-1">
                          <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>真相</span>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.5, opacity: msg.applied ? 0.5 : 1 }}>
                            {msg.suggestion.secret}
                          </p>
                        </div>
                      )}
                      {msg.suggestion.plantNote && (
                        <div className="mb-1">
                          <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>暗示与误导</span>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.5, opacity: msg.applied ? 0.5 : 1 }}>
                            {msg.suggestion.plantNote}
                          </p>
                        </div>
                      )}
                      {msg.suggestion.revealNote && (
                        <div>
                          <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>揭示方式</span>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.5, opacity: msg.applied ? 0.5 : 1 }}>
                            {msg.suggestion.revealNote}
                          </p>
                        </div>
                      )}
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
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="flex-shrink-0 flex items-end gap-1.5 px-4 pb-3 pt-2"
              style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              {!apiKey && (
                <p className="text-xs text-center mb-1.5" style={{ color: 'rgba(200,80,80,0.7)', fontSize: '10px' }}>
                  请先配置 API Key
                </p>
              )}
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAISend() } }}
                disabled={generating || !apiKey}
                placeholder={generating ? '生成中…' : '输入指令，回车发送…'}
                rows={3}
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
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Forward foreshadowing chronicle ──────────────────────────────────────────

function ForwardForeshadowingSection({ report }: { report?: ForwardForeshadowingReport }) {
  const [showCandidates, setShowCandidates] = useState(false)
  const hasUsed = report && report.used.length > 0
  const hasCandidates = report && report.candidates.length > 0

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium"
        style={{ color: '#6aa0c8', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
        正伏笔小传
      </span>

      {/* Used forward foreshadowings */}
      {hasUsed ? (
        <div className="space-y-1">
          {report.used.map((item, i) => (
            <div key={i} className="rounded px-2.5 py-2"
              style={{ background: 'rgba(100,160,200,0.06)', border: '1px solid rgba(100,160,200,0.15)' }}>
              <p className="text-xs" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.6 }}>
                {item.detail}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                <span style={{ color: '#6aa0c8', opacity: 0.7 }}>出处：</span>{item.source}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                <span style={{ color: '#6aa0c8', opacity: 0.7 }}>作用：</span>{item.usage}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.5, fontStyle: 'italic' }}>
          无 — AI 写作时会自动从上文中寻找可用细节
        </p>
      )}

      {/* Candidate forward foreshadowings */}
      {hasCandidates && (
        <div>
          <button
            onClick={() => setShowCandidates((v) => !v)}
            className="flex items-center gap-1.5 text-xs transition-all hover:opacity-80"
            style={{ color: '#6aa0c8', fontSize: '10px', opacity: 0.8 }}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
              style={{ transform: showCandidates ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M2 1l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            待选素材 ({report!.candidates.length})
          </button>
          {showCandidates && (
            <div className="space-y-1 mt-1">
              {report!.candidates.map((item, i) => (
                <div key={i} className="rounded px-2.5 py-2"
                  style={{ background: 'rgba(100,160,200,0.03)', border: '1px dashed rgba(100,160,200,0.15)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.6, opacity: 0.8 }}>
                    {item.detail}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                    <span style={{ color: '#6aa0c8', opacity: 0.5 }}>出处：</span>{item.source}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                    <span style={{ color: '#6aa0c8', opacity: 0.5 }}>可用于：</span>{item.potential}
                  </p>
                </div>
              ))}
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.5 }}>
                在对话中提及这些细节，AI 会将其编入剧情
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
