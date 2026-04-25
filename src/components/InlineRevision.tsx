import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { RevisionPoint, RevisionSnapshot } from '../types'
import { dlog } from '../debugLog'

// ── Locate a revision point in text using context anchors ──────────────

function findRevisionPosition(text: string, rp: RevisionPoint): { start: number; end: number } | null {
  const cur = rp.snapshots[rp.currentSnapshotId]?.text
  if (!cur) return null
  const full = rp.anchorBefore + cur + rp.anchorAfter
  const idx = text.indexOf(full)
  if (idx !== -1) return { start: idx + rp.anchorBefore.length, end: idx + rp.anchorBefore.length + cur.length }
  const idxCur = text.indexOf(cur)
  if (idxCur !== -1) return { start: idxCur, end: idxCur + cur.length }
  return null
}

// ── Floating "修改" button on text selection ────────────────────────────

export function FloatingEditButton({
  textareaRef,
  nodeId,
  disabled,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  nodeId: string
  disabled?: boolean
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const handleMouseUp = useCallback(() => {
    if (disabled) return
    const el = textareaRef.current
    if (!el) return
    requestAnimationFrame(() => {
      const s = el.selectionStart
      const e = el.selectionEnd
      if (s === e || s === undefined) { setPos(null); setSelection(null); return }
      const text = el.value.slice(s, e)
      if (!text.trim()) { setPos(null); setSelection(null); return }

      // Compute position using a mirror div
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const mirror = document.createElement('div')
      mirror.style.cssText = `position:fixed;top:-9999px;left:-9999px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;width:${rect.width}px;font:${style.font};font-size:${style.fontSize};line-height:${style.lineHeight};letter-spacing:${style.letterSpacing};padding:${style.padding};border:${style.border};box-sizing:border-box;`
      const before = document.createTextNode(el.value.slice(0, e))
      const span = document.createElement('span')
      span.textContent = '|'
      mirror.appendChild(before)
      mirror.appendChild(span)
      document.body.appendChild(mirror)
      const spanRect = span.getBoundingClientRect()
      document.body.removeChild(mirror)

      const scrollParent = el.parentElement
      const scrollTop = scrollParent?.scrollTop ?? 0
      const parentRect = scrollParent?.getBoundingClientRect() ?? rect

      const x = Math.min(spanRect.left - parentRect.left, rect.width - 80)
      const y = spanRect.top - parentRect.top + scrollTop + 20

      setPos({ x: Math.max(0, x), y })
      setSelection({ start: s, end: e, text })
    })
  }, [textareaRef, disabled])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.addEventListener('mouseup', handleMouseUp)
    const handleKeyUp = (e: KeyboardEvent) => { if (e.shiftKey) handleMouseUp() }
    el.addEventListener('keyup', handleKeyUp)
    return () => { el.removeEventListener('mouseup', handleMouseUp); el.removeEventListener('keyup', handleKeyUp) }
  }, [textareaRef.current, handleMouseUp])

  // Hide on scroll or click elsewhere
  useEffect(() => {
    if (!pos) return
    const hide = () => { setPos(null); setSelection(null) }
    const parent = textareaRef.current?.parentElement
    parent?.addEventListener('scroll', hide)
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.floating-edit-btn')) hide()
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 100)
    return () => { parent?.removeEventListener('scroll', hide); document.removeEventListener('mousedown', handleClick) }
  }, [pos])

  const handleOpen = () => {
    setModalOpen(true)
    setPos(null)
  }

  return (
    <>
      {pos && selection && (
        <button
          className="floating-edit-btn"
          onClick={handleOpen}
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            zIndex: 20,
            background: 'var(--gold)',
            color: '#0e0d15',
            border: 'none',
            borderRadius: '4px',
            padding: '3px 10px',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
          修改
        </button>
      )}
      {modalOpen && selection && (
        <RevisionModal
          nodeId={nodeId}
          originalText={selection.text}
          selectionStart={selection.start}
          selectionEnd={selection.end}
          onClose={() => { setModalOpen(false); setSelection(null) }}
        />
      )}
    </>
  )
}

// ── Revision edit modal ─────────────────────────────────────────────────

function RevisionModal({
  nodeId,
  originalText,
  selectionStart,
  selectionEnd,
  onClose,
}: {
  nodeId: string
  originalText: string
  selectionStart: number
  selectionEnd: number
  onClose: () => void
}) {
  const { nodes, addRevisionPoint, apiKey, apiUrl, apiFormat, apiModel, globalSettings, projectWritingGuide, aiWritingRules, getAncestorChain } = useStore()
  const node = nodes[nodeId]
  const [editText, setEditText] = useState(originalText)
  const [aiInput, setAiInput] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !generating) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, generating])

  const handleApply = () => {
    if (editText === originalText) { onClose(); return }
    if (!node) return
    const content = node.storyContent
    const anchorBefore = content.slice(Math.max(0, selectionStart - 30), selectionStart)
    const anchorAfter = content.slice(selectionEnd, selectionEnd + 30)
    addRevisionPoint(nodeId, originalText, editText, anchorBefore, anchorAfter, 'manual')
    onClose()
  }

  const handleAISend = async () => {
    if (!aiInput.trim() || generating || !apiKey) return
    const userText = aiInput.trim()
    setAiInput('')
    setGenerating(true)
    setAiReply('')
    setAiSuggestion('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const ancestors = node ? getAncestorChain(nodeId) : []
      const contextParts: string[] = []
      const withContent = ancestors.filter(a => a.storyContent.trim())
      if (withContent.length > 0) contextParts.push('故事上文：\n' + withContent.map(a => `【${a.title}】${a.storyContent.trim().slice(0, 300)}`).join('\n'))
      if (node?.storyContent) contextParts.push(`当前节点正文（选区附近）：\n${node.storyContent.slice(Math.max(0, selectionStart - 300), selectionEnd + 300)}`)
      if (node?.stateCard.content.trim()) contextParts.push(`状态卡片：\n${node.stateCard.content.trim()}`)
      if (projectWritingGuide.trim()) contextParts.push(`故事设定：\n${projectWritingGuide.trim().slice(0, 300)}`)
      const fs = node?.foreshadowings?.filter(f => f.status === 'planted') ?? []
      if (fs.length > 0) contextParts.push(`伏笔档案：\n${fs.map(f => `[${f.id}] ${f.secret}`).join('\n')}`)

      const systemPrompt = `你是文本修改助手。作者选中了一段文字要求修改。你能看到完整的故事上下文、设定和伏笔，修改时必须保持与它们的一致性。

选中的原文：
「${originalText}」

当前编辑版本：
「${editText}」

你必须调用 revise_text 工具回复。message 写修改理由，revised_text 给出完整的修改后文本。
${globalSettings.trim() ? `写作规则：${globalSettings.trim()}` : ''}
${aiWritingRules.trim() ? `AI 写作规则：${aiWritingRules.trim()}` : ''}`

      const toolDef = {
        name: 'revise_text',
        description: '修改选中文本',
        parameters: { type: 'object', properties: { message: { type: 'string' }, revised_text: { type: 'string' } }, required: ['message', 'revised_text'] },
      }

      const messages = [
        ...(contextParts.length ? [{ role: 'user' as const, content: `上下文：\n${contextParts.join('\n\n')}` }] : []),
        { role: 'user' as const, content: userText },
      ]

      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      const fetchFn = isTauri ? (await import('@tauri-apps/plugin-http')).fetch : fetch
      const base = apiUrl.replace(/\/+$/, '')

      if (apiFormat === 'anthropic') {
        const resolvedBase = (base === 'https://api.anthropic.com' || base === 'http://api.anthropic.com') && !isTauri ? '/api/anthropic' : base
        const res = await fetchFn(`${resolvedBase}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: apiModel, max_tokens: 1024, system: systemPrompt, messages, tools: [{ name: toolDef.name, description: toolDef.description, input_schema: toolDef.parameters }] }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json() as { content?: { type: string; input?: Record<string, string> }[] }
          for (const block of data.content ?? []) {
            if (block.type === 'tool_use' && block.input) {
              setAiReply(block.input.message ?? '')
              if (block.input.revised_text) setAiSuggestion(block.input.revised_text)
            }
          }
        }
      } else {
        let resolvedBase = base
        if (!isTauri) {
          try { const u = new URL(base); const h = u.hostname; if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.')) resolvedBase = `/api/local/${u.hostname}/${u.port}${u.pathname}` } catch {}
        }
        const res = await fetchFn(`${resolvedBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: apiModel, max_tokens: 1024, messages: [{ role: 'system', content: systemPrompt }, ...messages], tools: [{ type: 'function', function: toolDef }], tool_choice: 'required' }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json() as { choices?: { message: { tool_calls?: { function: { arguments: string } }[] } }[] }
          const tc = data.choices?.[0]?.message?.tool_calls?.[0]
          if (tc) {
            try {
              const args = JSON.parse(tc.function.arguments) as Record<string, string>
              setAiReply(args.message ?? '')
              if (args.revised_text) setAiSuggestion(args.revised_text)
            } catch {}
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setAiReply(`出错：${(e as Error).message}`)
    }
    setGenerating(false)
  }

  const handleApplyAI = () => {
    if (aiSuggestion) setEditText(aiSuggestion)
  }

  const handleApplyAndClose = () => {
    const text = aiSuggestion || editText
    if (text === originalText) { onClose(); return }
    if (!node) return
    const content = node.storyContent
    const anchorBefore = content.slice(Math.max(0, selectionStart - 30), selectionStart)
    const anchorAfter = content.slice(selectionEnd, selectionEnd + 30)
    addRevisionPoint(nodeId, originalText, text, anchorBefore, anchorAfter, aiSuggestion ? 'ai' : 'manual')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(10,9,18,0.7)' }}
      onClick={() => !generating && onClose()}>
      <div className="flex flex-col rounded-lg overflow-hidden"
        style={{ width: 'min(800px, 92vw)', height: 'min(520px, 85vh)', background: 'var(--bg-card)', border: '1px solid var(--border-gold)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="text-sm font-serif" style={{ color: 'var(--text-primary)' }}>修改选中文本</span>
          <div className="flex gap-2">
            <button onClick={handleApplyAndClose}
              className="text-xs px-3 py-1 rounded transition-all hover:brightness-110"
              style={{ background: 'rgba(180,140,90,0.2)', color: '#b8916a', border: '1px solid rgba(180,140,90,0.3)', fontSize: '11px' }}>
              应用并关闭
            </button>
            <button onClick={() => !generating && onClose()}
              className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
        </div>

        {/* Body: split pane */}
        <div className="flex-1 flex min-h-0">
          {/* Left: edit */}
          <div className="flex-1 flex flex-col px-5 py-4 min-w-0 overflow-y-auto" style={{ borderRight: '1px solid var(--border-subtle)' }}>
            <label className="text-xs mb-1" style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>原文</label>
            <div className="rounded p-2.5 mb-3 text-xs" style={{ background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: '100px', overflow: 'auto' }}>
              {originalText}
            </div>
            <label className="text-xs mb-1" style={{ color: '#b8916a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>修改后</label>
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="flex-1 w-full resize-none outline-none rounded p-3"
              style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(180,140,90,0.2)', color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', lineHeight: 1.7, minHeight: '100px' }}
            />
          </div>

          {/* Right: AI */}
          <div className="flex flex-col min-w-0" style={{ width: '300px', flexShrink: 0 }}>
            <div className="flex items-center px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--gold)', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI 辅助修改</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {!aiReply && !generating && (
                <div className="text-center py-6" style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.5, lineHeight: 1.8 }}>
                  描述修改需求
                  <br /><span style={{ fontSize: '10px' }}>如：「让语气更紧张」「改为内心独白」</span>
                </div>
              )}
              {aiReply && (
                <div>
                  <div className="text-xs mb-0.5" style={{ color: 'var(--gold-dim)', fontSize: '9px' }}>AI</div>
                  <div className="text-xs rounded px-2.5 py-2" style={{ background: 'rgba(201,169,110,0.05)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', fontSize: '12px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                    {aiReply}
                  </div>
                </div>
              )}
              {aiSuggestion && (
                <div className="rounded px-2.5 py-2" style={{ background: 'rgba(180,140,90,0.08)', border: '1px solid rgba(180,140,90,0.2)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: '#b8916a', fontSize: '10px', fontWeight: 500 }}>建议</span>
                    <button onClick={handleApplyAI}
                      className="text-xs px-2.5 py-0.5 rounded transition-all hover:brightness-110"
                      style={{ background: 'rgba(180,140,90,0.25)', color: '#b8916a', border: '1px solid rgba(180,140,90,0.4)', fontSize: '10px', fontWeight: 500 }}>
                      填入左侧
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{aiSuggestion}</p>
                </div>
              )}
              {generating && (
                <div className="flex items-center gap-2 text-xs px-2.5 py-2 rounded" style={{ background: 'rgba(201,169,110,0.05)', border: '1px solid var(--border-gold)', color: 'var(--text-muted)', fontSize: '11px' }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full generating-pulse" style={{ background: 'var(--gold)' }} />
                  思考中…
                </div>
              )}
            </div>

            <div className="flex-shrink-0 flex items-end gap-1.5 px-4 pb-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              <textarea
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAISend() } }}
                disabled={generating || !apiKey}
                placeholder={!apiKey ? '需要 API Key' : '描述修改需求…'}
                rows={2}
                className="flex-1 resize-none outline-none text-xs"
                style={{ background: 'transparent', color: 'var(--text-primary)', fontSize: '12px', lineHeight: 1.6 }}
              />
              <button onClick={handleAISend} disabled={generating || !apiKey || !aiInput.trim()}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all mb-0.5"
                style={{ background: generating || !apiKey || !aiInput.trim() ? 'rgba(201,169,110,0.15)' : 'var(--gold)', opacity: generating || !apiKey || !aiInput.trim() ? 0.5 : 1 }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10L6 2L10 10L6 8L2 10Z" fill={generating || !apiKey || !aiInput.trim() ? 'var(--gold)' : '#0e0d15'} />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Revision overlay markers ────────────────────────────────────────────

export function RevisionOverlay({
  textareaRef,
  nodeId,
  editorFontSize,
  editorLineHeight,
  editorLetterSpacing,
  isStreaming,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  nodeId: string
  editorFontSize: number
  editorLineHeight: number
  editorLetterSpacing: number
  isStreaming?: boolean
}) {
  const { nodes } = useStore()
  const node = nodes[nodeId]
  const [markers, setMarkers] = useState<{ id: string; x: number; y: number; rpId: string }[]>([])
  const [activePopover, setActivePopover] = useState<string | null>(null)

  const revisionPoints = useMemo(() => node?.revisionPoints ?? [], [node?.revisionPoints])

  useEffect(() => {
    if (isStreaming || !node || revisionPoints.length === 0) { setMarkers([]); return }
    const el = textareaRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const newMarkers: typeof markers = []

    for (const rp of revisionPoints) {
      const pos = findRevisionPosition(node.storyContent, rp)
      if (!pos) continue

      const mirror = document.createElement('div')
      mirror.style.cssText = `position:fixed;top:-9999px;left:-9999px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;width:${rect.width}px;font:${style.font};font-size:${style.fontSize};line-height:${style.lineHeight};letter-spacing:${style.letterSpacing};padding:${style.padding};border:${style.border};box-sizing:border-box;`
      const before = document.createTextNode(node.storyContent.slice(0, pos.end))
      const span = document.createElement('span')
      span.textContent = '|'
      mirror.appendChild(before)
      mirror.appendChild(span)
      document.body.appendChild(mirror)
      const spanRect = span.getBoundingClientRect()
      const mirrorRect = mirror.getBoundingClientRect()
      document.body.removeChild(mirror)

      newMarkers.push({
        id: rp.id,
        x: spanRect.left - mirrorRect.left,
        y: spanRect.top - mirrorRect.top,
        rpId: rp.id,
      })
    }
    setMarkers(newMarkers)
  }, [node?.storyContent, revisionPoints, isStreaming, editorFontSize, editorLineHeight, editorLetterSpacing])

  if (isStreaming || markers.length === 0) return null

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {markers.map(m => (
        <span
          key={m.id}
          onClick={() => setActivePopover(activePopover === m.id ? null : m.id)}
          style={{
            position: 'absolute',
            left: m.x,
            top: m.y + 2,
            pointerEvents: 'auto',
            cursor: 'pointer',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--gold)',
            opacity: 0.7,
            boxShadow: '0 0 4px rgba(201,169,110,0.5)',
            zIndex: 10,
          }}
          title="点击查看修改历史"
        />
      ))}
      {activePopover && (
        <RevisionHistoryPopover
          nodeId={nodeId}
          rpId={activePopover}
          onClose={() => setActivePopover(null)}
          markers={markers}
        />
      )}
    </div>
  )
}

// ── Revision history popover ────────────────────────────────────────────

function RevisionHistoryPopover({
  nodeId,
  rpId,
  onClose,
  markers,
}: {
  nodeId: string
  rpId: string
  onClose: () => void
  markers: { id: string; x: number; y: number }[]
}) {
  const { nodes, restoreRevisionSnapshot, addRevisionBranch, removeRevisionPoint } = useStore()
  const node = nodes[nodeId]
  const rp = (node?.revisionPoints ?? []).find(r => r.id === rpId)
  const marker = markers.find(m => m.id === rpId)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!rp || !marker) return null

  const renderTree = (snapId: string, depth: number): JSX.Element[] => {
    const snap = rp.snapshots[snapId]
    if (!snap) return []
    const isCurrent = rp.currentSnapshotId === snapId
    const isRoot = snapId === rp.rootSnapshotId
    const elements: JSX.Element[] = []
    elements.push(
      <div key={snapId} style={{ marginLeft: depth * 12 }}
        className="flex items-start gap-1.5 py-1 rounded px-1.5 transition-all"
        style2-placeholder="">
        <div className="flex-shrink-0 mt-1 w-2 h-2 rounded-full" style={{ background: isCurrent ? 'var(--gold)' : 'var(--border-subtle)' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: isCurrent ? 'var(--gold)' : 'var(--text-muted)', fontSize: '9px' }}>
              {isRoot ? '原文' : snap.source === 'ai' ? 'AI' : '手动'} · {new Date(snap.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {!isCurrent && (
              <button onClick={() => restoreRevisionSnapshot(nodeId, rpId, snapId)}
                className="text-xs px-1.5 py-0 rounded hover:opacity-80"
                style={{ color: 'var(--gold)', border: '1px solid var(--border-gold)', fontSize: '9px' }}>
                还原
              </button>
            )}
            {isCurrent && <span className="text-xs" style={{ color: 'var(--gold)', fontSize: '9px' }}>当前</span>}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.4, opacity: isCurrent ? 1 : 0.6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {snap.text.slice(0, 100)}{snap.text.length > 100 ? '…' : ''}
          </p>
        </div>
      </div>
    )
    for (const childId of snap.children) {
      elements.push(...renderTree(childId, depth + 1))
    }
    return elements
  }

  return (
    <div style={{
      position: 'absolute',
      left: Math.min(marker.x, 200),
      top: marker.y + 14,
      pointerEvents: 'auto',
      zIndex: 30,
      width: '280px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-gold)',
      borderRadius: '6px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      padding: '8px',
      maxHeight: '300px',
      overflow: 'auto',
    }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: 'var(--gold)', fontSize: '10px', fontWeight: 500 }}>修改历史</span>
        <div className="flex gap-1.5">
          <button onClick={() => { removeRevisionPoint(nodeId, rpId); onClose() }}
            className="text-xs px-1.5 py-0 rounded hover:opacity-70"
            style={{ color: 'rgba(200,80,80,0.6)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '9px' }}>
            删除
          </button>
          <button onClick={onClose} className="w-4 h-4 flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>✕</button>
        </div>
      </div>
      <div className="space-y-0.5">
        {renderTree(rp.rootSnapshotId, 0)}
      </div>
    </div>
  )
}
