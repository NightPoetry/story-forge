import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { buildFixedSystemPrompt, buildDynamicContext, runIntelligentGeneration, runAutoInit, genId } from '../api'
import { dlog } from '../debugLog'
import { ChatMessage } from '../types'
import StateCard from './StateCard'
import ForeshadowingPanel from './ForeshadowingPanel'

interface Props {
  nodeId: string
  onStreamingChange: (streaming: boolean) => void
}

type Tab = 'chat' | 'state' | 'foreshadowing'

// Resize textarea without disturbing the scroll position of its parent container
function resizeTextarea(el: HTMLTextAreaElement) {
  const scroller = el.parentElement
  const scrollTop = scroller?.scrollTop ?? 0
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
  if (scroller) scroller.scrollTop = scrollTop
}

const TOOL_LABELS: Record<string, string> = {
  __reasoning__: '思考中…',
  write_story: '编写中…',
  update_state_card: '正在更新状态卡片…',
  update_writing_rules: '正在更新写作规则…',
  chat_reply: '正在生成回复…',
  add_foreshadowings: '正在创建伏笔…',
  collect_foreshadowing: '正在回收伏笔…',
  report_forward_foreshadowing: '分析正伏笔…',
}

function playDoneSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
    setTimeout(() => ctx.close(), 500)
  } catch { /* audio not available */ }
}

export default function ChatPanel({ nodeId, onStreamingChange }: Props) {
  const {
    nodes, addChatMessage, updateStoryContent, updateStateCard,
    getAncestorChain, globalSettings, projectWritingGuide, aiWritingRules,
    apiKey, apiUrl, apiFormat, apiModel, toolStreamMode,
    isGenerating, setIsGenerating,
    collectForeshadowing, addForeshadowing, pushUndoSnapshot,
    soundEnabled, setSoundEnabled,
    updateForwardForeshadowing, setAiWritingRules,
    undo, undoStack,
  } = useStore()

  const node = nodes[nodeId]
  const [input, setInput] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamRafRef = useRef<number>(0)
  const pendingStreamRef = useRef<{ story?: string; stateCard?: string }>({})
  const typewriterRef = useRef<{ timer: ReturnType<typeof setTimeout>; full: string; pos: number } | null>(null)
  const cfg = { apiKey, apiUrl, apiFormat, apiModel }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [node?.chatHistory, stage])

  if (!node) return null

  const foreshadowings = node.foreshadowings ?? []
  const plantedCount = foreshadowings.filter((f) => f.status === 'planted').length

  const handleSend = async () => {
    if (!input.trim() || isGenerating || !apiKey) return
    const userText = input.trim()
    setInput('')
    setActiveTab('chat')

    const userMsg: ChatMessage = {
      id: genId(), role: 'user', content: userText, timestamp: Date.now(),
    }
    addChatMessage(nodeId, userMsg)

    // Undo snapshot + rollback snapshot
    pushUndoSnapshot()
    const prevStoryContent = node.storyContent
    const prevStateCard = { ...node.stateCard }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsGenerating(true)
    onStreamingChange(true)
    setStage('思考中…')

    const ancestors = getAncestorChain(nodeId)
    const fixedSystem = buildFixedSystemPrompt(globalSettings)
    const dynamicContext = buildDynamicContext(node, ancestors, projectWritingGuide, aiWritingRules)
    const hasActiveForeshadowings = foreshadowings.some((f) => f.status === 'planted')

    // Historical instructions (no AI replies — keeps context clean)
    const prevInstructions = node.chatHistory
      .filter((m) => m.role === 'user')
      .map((m) => ({ role: 'user' as const, content: m.content }))

    // Dynamic context is injected just before the current user message
    const messages = [
      ...prevInstructions,
      { role: 'user' as const, content: `${dynamicContext}\n\n---\n\n${userText}` },
    ]

    await runIntelligentGeneration(
      cfg,
      fixedSystem,
      messages,
      hasActiveForeshadowings,
      (action) => {
        if (controller.signal.aborted) return
        dlog.info('chatpanel', `onAction: ${action.type} len=${'content' in action ? action.content.length : 0}`)
        if (action.type === 'write_story') {
          updateStoryContent(nodeId, action.content)
        } else if (action.type === 'update_state_card') {
          updateStateCard(nodeId, { content: action.content, lastUpdated: Date.now() })
        } else if (action.type === 'update_writing_rules') {
          setAiWritingRules(action.content)
        } else if (action.type === 'chat_reply') {
          addChatMessage(nodeId, {
            id: genId(), role: 'assistant', content: action.content, timestamp: Date.now(),
          })
        } else if (action.type === 'add_foreshadowings') {
          for (const item of action.items) addForeshadowing(nodeId, item.secret, item.plantNote)
        } else if (action.type === 'collect_foreshadowing') {
          collectForeshadowing(nodeId, action.id, action.revealNote)
        } else if (action.type === 'report_forward_foreshadowing') {
          updateForwardForeshadowing(nodeId, { used: action.used, candidates: action.candidates })
        }
      },
      (toolName) => {
        if (!controller.signal.aborted) setStage(TOOL_LABELS[toolName] ?? '处理中…')
      },
      async () => {
        flushPendingStream()
        // Auto-init empty fields after main generation
        const s = useStore.getState()
        const curNode = s.nodes[nodeId]
        if (curNode && !controller.signal.aborted) {
          const ctx = {
            stateCardEmpty: !curNode.stateCard.content.trim(),
            aiWritingRulesEmpty: !s.aiWritingRules.trim(),
            foreshadowingsEmpty: curNode.foreshadowings.length === 0,
            stateCardContent: curNode.stateCard.content,
            storyContext: curNode.storyContent,
            existingForeshadowings: curNode.foreshadowings.map(f => ({ id: f.id, secret: f.secret })),
          }
          if (ctx.aiWritingRulesEmpty || ctx.foreshadowingsEmpty) {
            setStage('正在初始化…')
            await runAutoInit(cfg, ctx,
              (action) => {
                if (controller.signal.aborted) return
                if (action.type === 'update_writing_rules') setAiWritingRules(action.content)
                else if (action.type === 'add_foreshadowings') {
                  for (const item of action.items) addForeshadowing(nodeId, item.secret, item.plantNote)
                }
              },
              (toolName) => { if (!controller.signal.aborted) setStage(TOOL_LABELS[toolName] ?? '正在初始化…') },
              () => {},
              controller.signal,
            )
          }
        }
        if (soundEnabled) playDoneSound()
        setStage(null)
        setIsGenerating(false)
        onStreamingChange(false)
      },
      (err) => {
        // Cancel any pending stream updates before rolling back
        if (typewriterRef.current) { clearTimeout(typewriterRef.current.timer); typewriterRef.current = null }
        if (streamRafRef.current) {
          cancelAnimationFrame(streamRafRef.current)
          streamRafRef.current = 0
        }
        pendingStreamRef.current = {}
        updateStoryContent(nodeId, prevStoryContent)
        updateStateCard(nodeId, prevStateCard)
        addChatMessage(nodeId, {
          id: genId(), role: 'assistant', content: `生成失败：${err}`, timestamp: Date.now(),
        })
        setStage(null)
        setIsGenerating(false)
        onStreamingChange(false)
      },
      controller.signal,
      // Real-time streaming: direct DOM write for instant feedback + throttled store update
      // When a large block arrives at once (e.g. glm-5 sends full tool args in one shot),
      // use a typewriter effect so the user sees incremental text instead of a flash.
      (toolName, text) => {
        if (controller.signal.aborted) return
        dlog.stream('chatpanel', `onStreamDelta [${toolName}] len=${text.length}`)
        if (toolName === 'write_story') {
          const el = document.getElementById('story-textarea') as HTMLTextAreaElement | null
          const prevLen = el?.value?.length ?? 0
          const newChars = text.length - prevLen

          // If >20 new chars arrived at once, typewriter them in
          if (newChars > 20 && el) {
            // Cancel any existing typewriter
            if (typewriterRef.current) clearTimeout(typewriterRef.current.timer)
            const tw = { full: text, pos: prevLen, timer: 0 as unknown as ReturnType<typeof setTimeout> }
            typewriterRef.current = tw
            const CHARS_PER_TICK = newChars > 1000 ? Math.max(3, Math.ceil(newChars / 300)) : 3
            const TICK_MS = 16
            const tick = () => {
              if (controller.signal.aborted) { typewriterRef.current = null; return }
              tw.pos = Math.min(tw.pos + CHARS_PER_TICK, tw.full.length)
              const partial = tw.full.slice(0, tw.pos)
              el.value = partial
              resizeTextarea(el)
              pendingStreamRef.current.story = partial
              if (!streamRafRef.current) {
                streamRafRef.current = requestAnimationFrame(() => {
                  streamRafRef.current = 0
                  const p = pendingStreamRef.current
                  if (p.story !== undefined) { updateStoryContent(nodeId, p.story); p.story = undefined }
                  if (p.stateCard !== undefined) { updateStateCard(nodeId, { content: p.stateCard, lastUpdated: Date.now() }); p.stateCard = undefined }
                })
              }
              if (tw.pos < tw.full.length) {
                tw.timer = setTimeout(tick, TICK_MS)
              } else {
                typewriterRef.current = null
                updateStoryContent(nodeId, tw.full)
              }
            }
            tw.timer = setTimeout(tick, TICK_MS)
          } else {
            // Normal incremental streaming — write directly
            if (typewriterRef.current) {
              // Update the typewriter target if it's still running
              typewriterRef.current.full = text
            } else {
              pendingStreamRef.current.story = text
              if (el) {
                el.value = text
                resizeTextarea(el)
              }
              if (!streamRafRef.current) {
                streamRafRef.current = requestAnimationFrame(() => {
                  streamRafRef.current = 0
                  const p = pendingStreamRef.current
                  if (p.story !== undefined) { updateStoryContent(nodeId, p.story); p.story = undefined }
                  if (p.stateCard !== undefined) { updateStateCard(nodeId, { content: p.stateCard, lastUpdated: Date.now() }); p.stateCard = undefined }
                })
              }
            }
          }
        } else if (toolName === 'update_state_card') {
          pendingStreamRef.current.stateCard = text
          if (!streamRafRef.current) {
            streamRafRef.current = requestAnimationFrame(() => {
              streamRafRef.current = 0
              const p = pendingStreamRef.current
              if (p.story !== undefined) { updateStoryContent(nodeId, p.story); p.story = undefined }
              if (p.stateCard !== undefined) { updateStateCard(nodeId, { content: p.stateCard, lastUpdated: Date.now() }); p.stateCard = undefined }
            })
          }
        } else if (toolName === 'update_writing_rules') {
          setAiWritingRules(text)
        }
      },
      toolStreamMode,
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const flushPendingStream = () => {
    // Finish typewriter immediately if still running
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current.timer)
      const full = typewriterRef.current.full
      typewriterRef.current = null
      updateStoryContent(nodeId, full)
      const el = document.getElementById('story-textarea') as HTMLTextAreaElement | null
      if (el) el.value = full
    }
    if (streamRafRef.current) {
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = 0
    }
    const pending = pendingStreamRef.current
    if (pending.story !== undefined) {
      updateStoryContent(nodeId, pending.story)
      pending.story = undefined
    }
    if (pending.stateCard !== undefined) {
      updateStateCard(nodeId, { content: pending.stateCard, lastUpdated: Date.now() })
      pending.stateCard = undefined
    }
  }

  const handleAbort = () => {
    abortControllerRef.current?.abort()
    flushPendingStream()
    setStage(null)
    setIsGenerating(false)
    onStreamingChange(false)
  }

  const isEmpty = node.chatHistory.length === 0 && !stage

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: `2px solid ${activeTab === tab ? 'var(--gold)' : 'transparent'}`,
    paddingTop: '8px',
    paddingBottom: '8px',
    paddingLeft: '2px',
    paddingRight: '2px',
    fontSize: '11px',
    fontWeight: activeTab === tab ? 500 : 400,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    background: 'none',
    transition: 'color 0.15s ease',
  })

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{ borderLeft: '1px solid var(--border-subtle)' }}>
      {/* Tab bar */}
      <div className="flex items-end justify-between flex-shrink-0 px-3 min-w-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-end gap-3 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setActiveTab('chat')} style={tabStyle('chat')}>
            对话
          </button>
          <button onClick={() => setActiveTab('state')} style={tabStyle('state')}>
            状态卡
          </button>
          <button onClick={() => setActiveTab('foreshadowing')} style={tabStyle('foreshadowing')}>
            伏笔
            {plantedCount > 0 && (
              <span className="ml-1 px-1 rounded-full"
                style={{ background: 'rgba(180,140,90,0.2)', color: '#b8916a', fontSize: '9px' }}>
                {plantedCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2 mb-1">
          {isGenerating && (
            <button onClick={handleAbort}
              className="text-xs px-2 py-1 rounded"
              style={{ color: '#e06060', border: '1px solid rgba(200,80,80,0.3)', fontSize: '10px' }}>
              停止
            </button>
          )}
          {!isGenerating && undoStack.length > 0 && (
            <button onClick={undo}
              title="撤销上次 AI 生成 (Ctrl+Z)"
              className="text-xs px-2 py-1 rounded transition-all hover:opacity-80"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '10px' }}>
              撤销
            </button>
          )}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? '完成提示音：开' : '完成提示音：关'}
            className="flex items-center justify-center w-6 h-6 rounded transition-all hover:opacity-80"
            style={{ color: soundEnabled ? 'var(--gold)' : 'var(--text-muted)', opacity: soundEnabled ? 1 : 0.4 }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              {soundEnabled ? (
                <path d="M8 1.5L4 5.5H1v5h3l4 4V1.5zM11.5 4.5a4.5 4.5 0 010 7M13.5 2.5a8 8 0 010 11"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <>
                  <path d="M8 1.5L4 5.5H1v5h3l4 4V1.5z"
                    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 5.5l4 5M16 5.5l-4 5"
                    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'state' && (
        <div className="flex-1 overflow-y-auto p-3">
          <StateCard nodeId={nodeId} />
        </div>
      )}

      {activeTab === 'foreshadowing' && (
        <div className="flex-1 overflow-y-auto p-3">
          <ForeshadowingPanel nodeId={nodeId} />
        </div>
      )}

      {activeTab === 'chat' && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {isEmpty && (
              <div className="text-center py-8 text-sm"
                style={{ color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.8 }}>
                在下方输入创作指令
                <br />
                <span style={{ fontSize: '12px', opacity: 0.6 }}>
                  例如：「帮我写个基础设定」或「写开头，主角在深夜的咖啡馆醒来」
                </span>
              </div>
            )}

            {node.chatHistory.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {stage && (
              <div className="msg-enter mb-2">
                <div className="text-xs mb-1" style={{ color: 'var(--gold-dim)', fontSize: '10px' }}>AI</div>
                <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded generating-pulse"
                  style={{
                    background: 'rgba(201,169,110,0.05)',
                    border: '1px solid var(--border-gold)',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                  }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full generating-pulse"
                    style={{ background: 'var(--gold)', flexShrink: 0 }} />
                  {stage}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3"
            style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            {!apiKey && (
              <p className="text-xs text-center mb-2" style={{ color: 'rgba(200,80,80,0.7)', fontSize: '11px' }}>
                请先在顶栏配置 API Key
              </p>
            )}
            <div className="flex gap-2 items-end rounded"
              style={{
                background: 'var(--bg-elevated)',
                border: `1px solid ${isGenerating ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                padding: '8px 10px',
                transition: 'border-color 0.15s ease',
              }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isGenerating || !apiKey}
                placeholder={isGenerating ? '生成中…' : '输入创作指令，回车发送…'}
                rows={2}
                className="flex-1 resize-none outline-none text-xs"
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontFamily: '"DM Sans", sans-serif',
                  lineHeight: '1.6',
                  fontSize: '12px',
                }}
              />
              <button
                onClick={handleSend}
                disabled={isGenerating || !apiKey || !input.trim()}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all"
                style={{
                  background:
                    isGenerating || !apiKey || !input.trim()
                      ? 'rgba(201,169,110,0.15)'
                      : 'var(--gold)',
                  opacity: isGenerating || !apiKey || !input.trim() ? 0.5 : 1,
                }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10L6 2L10 10L6 8L2 10Z"
                    fill={isGenerating || !apiKey || !input.trim() ? 'var(--gold)' : '#0e0d15'} />
                </svg>
              </button>
            </div>
            <p className="text-center mt-1.5" style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.5 }}>
              Enter 发送 · Shift+Enter 换行
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const [modalOpen, setModalOpen] = useState(false)
  const isLong = msg.content.length > 200
  const display = isLong ? msg.content.slice(0, 200) + '…' : msg.content

  return (
    <>
      <div className={`msg-enter mb-3 ${isUser ? 'pl-3' : ''}`}>
        <div className="text-xs mb-1"
          style={{
            color: isUser ? 'var(--text-muted)' : 'var(--gold-dim)',
            letterSpacing: '0.05em',
            fontSize: '10px',
          }}>
          {isUser ? '你' : 'AI'}
        </div>
        <div
          className="text-xs rounded p-3"
          style={{
            background: isUser ? 'rgba(240,235,224,0.06)' : 'rgba(201,169,110,0.05)',
            border: `1px solid ${isUser ? 'rgba(240,235,224,0.08)' : 'var(--border-gold)'}`,
            color: 'var(--text-primary)',
            lineHeight: '1.65',
            fontFamily: '"DM Sans", sans-serif',
            fontSize: '12px',
            opacity: 0.9,
          }}>
          {display}
          {isLong && (
            <span
              onClick={() => setModalOpen(true)}
              style={{ color: 'var(--gold)', marginLeft: '6px', fontSize: '10px', cursor: 'pointer' }}>
              展开
            </span>
          )}
        </div>
      </div>

      {modalOpen && (
        <MessageModal
          role={msg.role}
          content={msg.content}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

function MessageModal({ role, content, onClose }: { role: string; content: string; onClose: () => void }) {
  const isUser = role === 'user'

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,9,18,0.7)' }}
      onClick={onClose}>
      <div
        className="relative flex flex-col rounded-lg"
        style={{
          width: 'min(720px, 90vw)',
          maxHeight: '80vh',
          background: 'var(--bg-card)',
          border: `1px solid ${isUser ? 'var(--border-subtle)' : 'var(--border-gold)'}`,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="text-xs" style={{ color: isUser ? 'var(--text-muted)' : 'var(--gold)', letterSpacing: '0.05em' }}>
            {isUser ? '你' : 'AI'} · {content.length} 字符
          </span>
          <button onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4"
          style={{
            color: 'var(--text-primary)',
            fontFamily: '"DM Sans", sans-serif',
            fontSize: '13px',
            lineHeight: '1.8',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
          {content}
        </div>
      </div>
    </div>
  )
}
