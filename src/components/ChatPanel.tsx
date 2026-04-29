import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { buildFixedSystemPrompt, buildDynamicContext, runIntelligentGeneration, runAutoInit, genId, AIAction } from '../api'
import { dlog } from '../debugLog'
import { ChatMessage } from '../types'
import StateCard from './StateCard'
import ForeshadowingPanel from './ForeshadowingPanel'
import CharacterPanel from './CharacterPanel'

interface Props {
  nodeId: string
  onStreamingChange: (streaming: boolean) => void
}

type Tab = 'chat' | 'state' | 'foreshadowing' | 'characters'

// Resize textarea without disturbing the scroll position of its parent container
function resizeTextarea(el: HTMLTextAreaElement) {
  const scroller = el.parentElement
  const scrollTop = scroller?.scrollTop ?? 0
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
  if (scroller) scroller.scrollTop = scrollTop
}

function isDuplicateForeshadowing(
  newSecret: string,
  existing: { secret: string }[],
): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const ns = normalize(newSecret)
  for (const e of existing) {
    const es = normalize(e.secret)
    if (ns === es) return true
    if (ns.length > 10 && es.length > 10 && (ns.includes(es) || es.includes(ns))) return true
  }
  return false
}

function buildActionSummary(actions: AIAction[]): string[] {
  const lines: string[] = []
  for (const a of actions) {
    if (a.type === 'write_story') {
      const chars = a.content.replace(/\s/g, '').length
      lines.push(`写入正文（${chars}字）`)
    } else if (a.type === 'update_state_card') {
      lines.push('更新状态卡片')
    } else if (a.type === 'update_writing_rules') {
      lines.push('更新写作规则')
    } else if (a.type === 'add_foreshadowings') {
      lines.push(`新增 ${a.items.length} 条伏笔`)
    } else if (a.type === 'collect_foreshadowing') {
      lines.push(`回收伏笔 ${a.id}`)
    }
  }
  return lines
}

const MODIFYING_ACTIONS = new Set(['write_story', 'update_state_card', 'update_writing_rules', 'add_foreshadowings', 'collect_foreshadowing'])

const TOOL_LABELS: Record<string, string> = {
  __reasoning__: '思考中…',
  write_story: '编写中…',
  update_state_card: '正在更新状态卡片…',
  update_writing_rules: '正在更新写作规则…',
  chat_reply: '正在生成回复…',
  add_foreshadowings: '正在创建伏笔…',
  collect_foreshadowing: '正在回收伏笔…',
  report_forward_foreshadowing: '分析正伏笔…',
  update_characters: '更新人物卡片…',
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
    undo, undoStack, characterCards,
    addCharacterCard, updateCharacterCard, addCharacterEvent,
  } = useStore()

  const node = nodes[nodeId]
  const [input, setInput] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [fineTuneMode, setFineTuneMode] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ summary: string[]; actionTypes: string[]; hasPendingStory: boolean } | null>(null)
  const performedActionsRef = useRef<AIAction[]>([])
  const pendingStoryRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamRafRef = useRef<number>(0)
  const pendingStreamRef = useRef<{ story?: string; stateCard?: string }>({})
  const typewriterRef = useRef<{ timer: ReturnType<typeof setTimeout>; full: string; pos: number } | null>(null)
  const cfg = { apiKey, apiUrl, apiFormat, apiModel }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [node?.chatHistory, stage])

  useEffect(() => {
    setPendingConfirm(null)
    performedActionsRef.current = []
    pendingStoryRef.current = null
  }, [nodeId])

  if (!node) return null

  const foreshadowings = node.foreshadowings ?? []
  const plantedCount = foreshadowings.filter((f) => f.status === 'planted').length

  // Phase 2: full generation with all tools (story, foreshadowing, etc.)
  const runFullGeneration = async (userText: string) => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsGenerating(true)
    onStreamingChange(true)
    setStage('思考中…')

    const latestNode = useStore.getState().nodes[nodeId]
    if (!latestNode) { setIsGenerating(false); onStreamingChange(false); return }

    const ancestors = getAncestorChain(nodeId)
    const fixedSystem = buildFixedSystemPrompt(useStore.getState().globalSettings)
    const s = useStore.getState()
    const dynamicContext = buildDynamicContext(latestNode, ancestors, s.projectWritingGuide, s.aiWritingRules, undefined, s.characterCards)
    const hasActive = (latestNode.foreshadowings ?? []).some((f) => f.status === 'planted')

    const prevInstructions = latestNode.chatHistory
      .filter((m) => m.role === 'user')
      .map((m) => ({ role: 'user' as const, content: m.content }))
    const fineTuneNote = fineTuneMode
      ? '\n\n【微调模式】仅对当前正文中需要修改的部分做最小化改动。保留所有未涉及的段落原文不变，不要重写整段或整章。只修改用户指出的具体问题，输出修改后的完整正文。'
      : ''
    const msgs = [
      ...prevInstructions,
      { role: 'user' as const, content: `${dynamicContext}\n\n---\n\n${userText}${fineTuneNote}` },
    ]

    pushUndoSnapshot()

    await runIntelligentGeneration(
      cfg, fixedSystem, msgs, hasActive,
      (action) => {
        if (controller.signal.aborted) return
        if (action.type === 'write_story') updateStoryContent(nodeId, action.content)
        else if (action.type === 'update_state_card') updateStateCard(nodeId, { content: action.content, lastUpdated: Date.now() })
        else if (action.type === 'update_writing_rules') setAiWritingRules(action.content)
        else if (action.type === 'chat_reply') addChatMessage(nodeId, { id: genId(), role: 'assistant', content: action.content, timestamp: Date.now() })
        else if (action.type === 'add_foreshadowings') {
          const cur = useStore.getState().nodes[nodeId]?.foreshadowings ?? []
          for (const item of action.items) { if (!isDuplicateForeshadowing(item.secret, cur)) addForeshadowing(nodeId, item.secret, item.plantNote) }
        } else if (action.type === 'collect_foreshadowing') collectForeshadowing(nodeId, action.id, action.revealNote)
        else if (action.type === 'report_forward_foreshadowing') updateForwardForeshadowing(nodeId, { used: action.used, candidates: action.candidates })
        else if (action.type === 'update_characters') {
          const curCards = useStore.getState().characterCards
          const nodeTitle = useStore.getState().nodes[nodeId]?.title ?? ''
          for (const upd of action.updates) {
            const existing = curCards.find((c) => c.name === upd.name)
            if (existing) {
              if (upd.baseInfo) updateCharacterCard(existing.id, { baseInfo: upd.baseInfo })
              if (upd.personality) updateCharacterCard(existing.id, { personality: upd.personality })
              if (upd.speechStyle) updateCharacterCard(existing.id, { speechStyle: upd.speechStyle })
              addCharacterEvent(existing.id, { nodeTitle, description: upd.event, changes: upd.changes })
            } else {
              const newId = addCharacterCard(upd.name)
              if (upd.baseInfo) updateCharacterCard(newId, { baseInfo: upd.baseInfo })
              if (upd.personality) updateCharacterCard(newId, { personality: upd.personality })
              if (upd.speechStyle) updateCharacterCard(newId, { speechStyle: upd.speechStyle })
              addCharacterEvent(newId, { nodeTitle, description: upd.event, changes: upd.changes })
            }
          }
        }
      },
      (toolName) => { if (!controller.signal.aborted) setStage(TOOL_LABELS[toolName] ?? '处理中…') },
      async () => {
        flushPendingStream()
        // Auto-init
        const st = useStore.getState()
        const cn = st.nodes[nodeId]
        if (cn && !controller.signal.aborted) {
          const ctx = {
            stateCardEmpty: !cn.stateCard.content.trim(), aiWritingRulesEmpty: !st.aiWritingRules.trim(),
            foreshadowingsEmpty: cn.foreshadowings.length === 0, stateCardContent: cn.stateCard.content,
            storyContext: cn.storyContent, existingForeshadowings: cn.foreshadowings.map(f => ({ id: f.id, secret: f.secret })),
          }
          if (ctx.aiWritingRulesEmpty || ctx.foreshadowingsEmpty) {
            setStage('正在初始化…')
            await runAutoInit(cfg, ctx,
              (a) => {
                if (controller.signal.aborted) return
                if (a.type === 'update_writing_rules') setAiWritingRules(a.content)
                else if (a.type === 'add_foreshadowings') {
                  const fs = useStore.getState().nodes[nodeId]?.foreshadowings ?? []
                  for (const item of a.items) { if (!isDuplicateForeshadowing(item.secret, fs)) addForeshadowing(nodeId, item.secret, item.plantNote) }
                }
              },
              (tn) => { if (!controller.signal.aborted) setStage(TOOL_LABELS[tn] ?? '正在初始化…') },
              () => {}, controller.signal,
            )
          }
        }
        if (soundEnabled) playDoneSound()
        setStage(null); setIsGenerating(false); onStreamingChange(false)
      },
      (err) => {
        if (typewriterRef.current) { clearTimeout(typewriterRef.current.timer); typewriterRef.current = null }
        if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = 0 }
        pendingStreamRef.current = {}
        addChatMessage(nodeId, { id: genId(), role: 'assistant', content: `生成失败：${err}`, timestamp: Date.now() })
        setStage(null); setIsGenerating(false); onStreamingChange(false)
      },
      controller.signal,
      (toolName, text) => {
        if (controller.signal.aborted) return
        if (toolName === 'write_story') {
          const el = document.getElementById('story-textarea') as HTMLTextAreaElement | null
          const prevLen = el?.value?.length ?? 0
          const newChars = text.length - prevLen
          if (newChars > 20 && el) {
            if (typewriterRef.current) clearTimeout(typewriterRef.current.timer)
            const tw = { full: text, pos: prevLen, timer: 0 as unknown as ReturnType<typeof setTimeout> }
            typewriterRef.current = tw
            const CHARS_PER_TICK = newChars > 1000 ? Math.max(3, Math.ceil(newChars / 300)) : 3
            const tick = () => {
              if (controller.signal.aborted) { typewriterRef.current = null; return }
              tw.pos = Math.min(tw.pos + CHARS_PER_TICK, tw.full.length)
              if (el) { el.value = tw.full.slice(0, tw.pos); resizeTextarea(el) }
              pendingStreamRef.current.story = tw.full.slice(0, tw.pos)
              if (!streamRafRef.current) {
                streamRafRef.current = requestAnimationFrame(() => {
                  streamRafRef.current = 0
                  const p = pendingStreamRef.current
                  if (p.story !== undefined) { updateStoryContent(nodeId, p.story); p.story = undefined }
                  if (p.stateCard !== undefined) { updateStateCard(nodeId, { content: p.stateCard, lastUpdated: Date.now() }); p.stateCard = undefined }
                })
              }
              if (tw.pos < tw.full.length) tw.timer = setTimeout(tick, 16)
              else { typewriterRef.current = null; updateStoryContent(nodeId, tw.full) }
            }
            tw.timer = setTimeout(tick, 16)
          } else {
            if (typewriterRef.current) { typewriterRef.current.full = text } else {
              pendingStreamRef.current.story = text
              if (el) { el.value = text; resizeTextarea(el) }
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

  const handleSend = async () => {
    if (!input.trim() || isGenerating || !apiKey || pendingConfirm) return
    const userText = input.trim()
    setInput('')
    setActiveTab('chat')

    const userMsg: ChatMessage = {
      id: genId(), role: 'user', content: userText, timestamp: Date.now(),
    }
    addChatMessage(nodeId, userMsg)

    pushUndoSnapshot()
    const prevStoryContent = node.storyContent
    const prevStateCard = { ...node.stateCard }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsGenerating(true)
    onStreamingChange(true)
    setStage('思考中…')
    performedActionsRef.current = []
    pendingStoryRef.current = userText
    let phase1ChatReply = ''

    const ancestors = getAncestorChain(nodeId)
    const fixedSystem = buildFixedSystemPrompt(globalSettings)
    const dynamicContext = buildDynamicContext(node, ancestors, projectWritingGuide, aiWritingRules, undefined, characterCards)
    const hasActiveForeshadowings = foreshadowings.some((f) => f.status === 'planted')

    const prevInstructions = node.chatHistory
      .filter((m) => m.role === 'user')
      .map((m) => ({ role: 'user' as const, content: m.content }))

    const fineTuneNote = fineTuneMode
      ? '\n\n【微调模式】仅对当前正文中需要修改的部分做最小化改动，不要重写整段或整章。'
      : ''
    const messages = [
      ...prevInstructions,
      { role: 'user' as const, content: `${dynamicContext}\n\n---\n\n${userText}${fineTuneNote}` },
    ]

    // Phase 1: setup-only pass (write_story excluded)
    await runIntelligentGeneration(
      cfg,
      fixedSystem + '\n\n【本次调用限制】本次请求仅处理设定类操作（伏笔、状态卡片、写作规则等），不要输出故事正文。如果用户请求涉及写故事，请在 chat_reply 中简要说明你的创作计划即可。',
      messages,
      hasActiveForeshadowings,
      (action) => {
        if (controller.signal.aborted) return
        dlog.info('chatpanel', `Phase1 onAction: ${action.type}`)
        if (action.type === 'update_state_card') {
          performedActionsRef.current.push(action)
          updateStateCard(nodeId, { content: action.content, lastUpdated: Date.now() })
        } else if (action.type === 'update_writing_rules') {
          performedActionsRef.current.push(action)
          setAiWritingRules(action.content)
        } else if (action.type === 'chat_reply') {
          phase1ChatReply = action.content
        } else if (action.type === 'add_foreshadowings') {
          performedActionsRef.current.push(action)
          const cur = useStore.getState().nodes[nodeId]?.foreshadowings ?? []
          for (const item of action.items) { if (!isDuplicateForeshadowing(item.secret, cur)) addForeshadowing(nodeId, item.secret, item.plantNote) }
        } else if (action.type === 'collect_foreshadowing') {
          performedActionsRef.current.push(action)
          collectForeshadowing(nodeId, action.id, action.revealNote)
        }
      },
      (toolName) => {
        if (!controller.signal.aborted) setStage(TOOL_LABELS[toolName] ?? '处理中…')
      },
      async () => {
        flushPendingStream()
        // Auto-init
        const s = useStore.getState()
        const curNode = s.nodes[nodeId]
        if (curNode && !controller.signal.aborted) {
          const ctx = {
            stateCardEmpty: !curNode.stateCard.content.trim(), aiWritingRulesEmpty: !s.aiWritingRules.trim(),
            foreshadowingsEmpty: curNode.foreshadowings.length === 0, stateCardContent: curNode.stateCard.content,
            storyContext: curNode.storyContent, existingForeshadowings: curNode.foreshadowings.map(f => ({ id: f.id, secret: f.secret })),
          }
          if (ctx.aiWritingRulesEmpty || ctx.foreshadowingsEmpty) {
            setStage('正在初始化…')
            await runAutoInit(cfg, ctx,
              (a) => {
                if (controller.signal.aborted) return
                if (a.type === 'update_writing_rules') setAiWritingRules(a.content)
                else if (a.type === 'add_foreshadowings') {
                  const fs = useStore.getState().nodes[nodeId]?.foreshadowings ?? []
                  for (const item of a.items) { if (!isDuplicateForeshadowing(item.secret, fs)) addForeshadowing(nodeId, item.secret, item.plantNote) }
                }
              },
              (tn) => { if (!controller.signal.aborted) setStage(TOOL_LABELS[tn] ?? '正在初始化…') },
              () => {}, controller.signal,
            )
          }
        }

        const setupActions = performedActionsRef.current
        if (setupActions.length > 0) {
          // Setup changes happened — add chat_reply and show confirmation
          if (phase1ChatReply) {
            addChatMessage(nodeId, { id: genId(), role: 'assistant', content: phase1ChatReply, timestamp: Date.now() })
          }
          if (soundEnabled) playDoneSound()
          setStage(null); setIsGenerating(false); onStreamingChange(false)
          const summary = buildActionSummary(setupActions)
          const actionTypes = [...new Set(setupActions.map(a => a.type))]
          setPendingConfirm({ summary, actionTypes, hasPendingStory: true })
        } else {
          // No setup changes — skip confirmation, go straight to full generation
          // Don't add Phase 1 chat_reply (it's just noise like "好的我来写")
          setStage(null); setIsGenerating(false); onStreamingChange(false)
          await runFullGeneration(userText)
        }
      },
      (err) => {
        if (typewriterRef.current) { clearTimeout(typewriterRef.current.timer); typewriterRef.current = null }
        if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = 0 }
        pendingStreamRef.current = {}
        updateStoryContent(nodeId, prevStoryContent)
        updateStateCard(nodeId, prevStateCard)
        addChatMessage(nodeId, { id: genId(), role: 'assistant', content: `生成失败：${err}`, timestamp: Date.now() })
        setStage(null); setIsGenerating(false); onStreamingChange(false)
      },
      controller.signal,
      (toolName, text) => {
        if (controller.signal.aborted) return
        if (toolName === 'update_state_card') {
          pendingStreamRef.current.stateCard = text
          if (!streamRafRef.current) {
            streamRafRef.current = requestAnimationFrame(() => {
              streamRafRef.current = 0
              const p = pendingStreamRef.current
              if (p.stateCard !== undefined) { updateStateCard(nodeId, { content: p.stateCard, lastUpdated: Date.now() }); p.stateCard = undefined }
            })
          }
        } else if (toolName === 'update_writing_rules') {
          setAiWritingRules(text)
        }
      },
      toolStreamMode,
      ['write_story', 'report_forward_foreshadowing'],
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

  const handleConfirm = async () => {
    const userText = pendingStoryRef.current
    setPendingConfirm(null)
    performedActionsRef.current = []
    pendingStoryRef.current = null
    // Phase 2: generate with all tools, using confirmed setup context
    if (userText) {
      await runFullGeneration(userText)
    }
  }

  const handleReject = () => {
    pendingStoryRef.current = null
    setPendingConfirm(null)
    performedActionsRef.current = []
    undo()
  }

  const isEmpty = node.chatHistory.length === 0 && !stage && !pendingConfirm

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
          <button onClick={() => setActiveTab('characters')} style={tabStyle('characters')}>
            人物
            {characterCards.length > 0 && (
              <span className="ml-1 px-1 rounded-full"
                style={{ background: 'rgba(180,140,90,0.2)', color: '#b8916a', fontSize: '9px' }}>
                {characterCards.length}
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

      {activeTab === 'characters' && (
        <div className="flex-1 overflow-y-auto p-3">
          <CharacterPanel />
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

            {pendingConfirm && (
              <div className="msg-enter mb-2 rounded px-3 py-2.5"
                style={{
                  background: 'rgba(201,169,110,0.08)',
                  border: '1px solid var(--border-gold)',
                }}>
                <div className="text-xs mb-1.5" style={{ color: 'var(--gold)', fontSize: '10px', fontWeight: 500 }}>
                  AI 执行了以下操作，请审批{pendingConfirm.hasPendingStory ? '（正文将在确认后写入）' : ''}：
                </div>
                <div className="mb-2">
                  {pendingConfirm.summary.map((line, i) => (
                    <div key={i} className="flex items-center gap-1.5" style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.8 }}>
                      <span style={{ color: 'var(--gold)', fontSize: '8px' }}>●</span>
                      {line}
                    </div>
                  ))}
                  {pendingConfirm.hasPendingStory && (
                    <div className="mt-1" style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      确认后将继续生成正文
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleConfirm}
                    className="px-3 py-1 rounded text-xs transition-all hover:brightness-110"
                    style={{
                      background: 'rgba(201,169,110,0.2)',
                      border: '1px solid var(--border-gold)',
                      color: 'var(--gold)',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}>
                    确认保留
                  </button>
                  <button onClick={handleReject}
                    className="px-3 py-1 rounded text-xs transition-all hover:opacity-80"
                    style={{
                      border: '1px solid rgba(200,80,80,0.3)',
                      color: 'rgba(200,80,80,0.7)',
                      fontSize: '11px',
                    }}>
                    撤销全部
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3"
            style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            {/* Fine-tune toggle */}
            <div className="flex items-center gap-1.5 mb-2">
              <button
                onClick={() => setFineTuneMode(!fineTuneMode)}
                className="px-2 py-0.5 rounded transition-all"
                style={{
                  background: fineTuneMode ? 'rgba(201,169,110,0.15)' : 'transparent',
                  border: `1px solid ${fineTuneMode ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                  color: fineTuneMode ? 'var(--gold)' : 'var(--text-muted)',
                  opacity: fineTuneMode ? 1 : 0.5,
                  cursor: 'pointer',
                  fontSize: '10px',
                }}
              >
                微调模式
              </button>
              {fineTuneMode && (
                <span style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.6 }}>
                  仅对现有正文做最小化修改
                </span>
              )}
            </div>
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
                disabled={isGenerating || !apiKey || !!pendingConfirm}
                placeholder={pendingConfirm ? '请先确认或撤销上方操作…' : isGenerating ? '生成中…' : '输入创作指令，回车发送…'}
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
                disabled={isGenerating || !apiKey || !input.trim() || !!pendingConfirm}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all"
                style={{
                  background:
                    isGenerating || !apiKey || !input.trim() || pendingConfirm
                      ? 'rgba(201,169,110,0.15)'
                      : 'var(--gold)',
                  opacity: isGenerating || !apiKey || !input.trim() || pendingConfirm ? 0.5 : 1,
                }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10L6 2L10 10L6 8L2 10Z"
                    fill={isGenerating || !apiKey || !input.trim() || pendingConfirm ? 'var(--gold)' : '#0e0d15'} />
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
