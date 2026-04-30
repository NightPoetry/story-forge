import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { runSettingsGuideChat, genId } from '../api'
import { ChatMessage } from '../types'

const AUTO_START_MSG = { role: 'user' as const, content: '[对话开始] 请发起第一条引导消息。若当前设定文档为空，询问作者的故事构想；若有内容，针对最需补充的部分提问。' }

interface Props {
  onClose: () => void
}

type ContextMode = 'current' | 'full' | 'intent'

export default function WritingGuideModal({ onClose }: Props) {
  const {
    projectWritingGuide, setProjectWritingGuide,
    writingGuideChatHistory, addWritingGuideChatMessage,
    apiKey, apiUrl, apiFormat, apiModel,
    nodes, selectedNodeId, rootNodeId, getAncestorChain, aiWritingRules,
    characterCards,
  } = useStore()

  const [guideDraft, setGuideDraft] = useState(projectWritingGuide)
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cfg = { apiKey, apiUrl, apiFormat, apiModel }

  const [contextMode, setContextMode] = useState<ContextMode>('current')
  const [focusNodeId, setFocusNodeId] = useState<string>(selectedNodeId ?? rootNodeId ?? '')
  const [extraNodeIds, setExtraNodeIds] = useState<Set<string>>(new Set())

  const allNodes = Object.values(nodes)

  const toggleExtraNode = (id: string) => {
    setExtraNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const buildStoryContext = () => {
    const parts: string[] = []

    if (contextMode === 'intent') {
      // 用户意图模式：收集所有用户对话，不看正文
      const userMsgs: { source: string; content: string }[] = []

      // 各节点的用户对话
      for (const n of allNodes) {
        const userOnly = n.chatHistory.filter(m => m.role === 'user')
        for (const m of userOnly) userMsgs.push({ source: `节点「${n.title}」`, content: m.content })
      }

      // 设定助手的用户对话
      for (const m of writingGuideChatHistory) {
        if (m.role === 'user') userMsgs.push({ source: '设定助手', content: m.content })
      }

      if (userMsgs.length > 0) {
        parts.push('# 用户全部对话记录（按来源分组）\n以下是用户在各处发出的所有指令和对话。请从中提炼故事设定、世界观、人物关系、文风偏好等信息，整合到设定文档中。\n\n' +
          userMsgs.map(m => `[${m.source}] ${m.content}`).join('\n'))
      }

      // 各节点的状态卡片（包含设定信息）
      const stateCards = allNodes.filter(n => n.stateCard.content.trim())
      if (stateCards.length > 0) {
        parts.push('# 各节点状态卡片\n' + stateCards.map(n => `## 「${n.title}」\n${n.stateCard.content.trim()}`).join('\n\n'))
      }

      // 附加节点的正文（用户手动勾选）
      if (extraNodeIds.size > 0) {
        const extras = allNodes.filter(n => extraNodeIds.has(n.id) && n.storyContent.trim())
        if (extras.length > 0) {
          parts.push('# 附加参考节点正文\n' + extras.map(n => `## 「${n.title}」\n${n.storyContent.trim()}`).join('\n\n'))
        }
      }
    } else if (contextMode === 'full') {
      // 全量模式：所有节点完整正文 + 对话历史
      const sorted = allNodes.filter(n => n.storyContent.trim())
      if (sorted.length > 0) {
        parts.push('# 全量故事上下文\n' + sorted.map(n => {
          const lines = [`## 「${n.title}」（${n.branchType === 'root' ? '根' : n.branchType === 'branch' ? '分支' : '续篇'}）`]
          lines.push(n.storyContent.trim())
          if (n.chatHistory.length > 0) {
            lines.push('\n对话记录：')
            for (const m of n.chatHistory) lines.push(`[${m.role}] ${m.content}`)
          }
          return lines.join('\n')
        }).join('\n\n---\n\n'))
      }
    } else {
      // 微调模式：选中节点的完整内容
      const node = focusNodeId ? nodes[focusNodeId] : null
      if (node) {
        const ancestors = getAncestorChain(focusNodeId)
        const chain = [...ancestors, node].filter(n => n.storyContent.trim())
        if (chain.length > 0) {
          parts.push('# 故事上下文（至选中节点）\n' + chain.map(n =>
            `## 「${n.title}」\n${n.storyContent.trim()}`
          ).join('\n\n'))
        }
        if (node.chatHistory.length > 0) {
          parts.push('# 选中节点对话记录\n' + node.chatHistory.map(m => `[${m.role}] ${m.content}`).join('\n'))
        }
        if (node.stateCard.content.trim()) parts.push(`# 状态卡片\n${node.stateCard.content.trim()}`)
        const fs = node.foreshadowings?.filter(f => f.status === 'planted') ?? []
        if (fs.length > 0) parts.push(`# 伏笔\n${fs.map(f => `[${f.id}] ${f.secret}`).join('\n')}`)
      }
    }

    if (characterCards.length > 0) {
      parts.push('# 人物卡片\n' + characterCards.map(c => `${c.name}：${c.baseInfo}`).join('\n'))
    }
    if (aiWritingRules.trim()) parts.push(`# 写作规则\n${aiWritingRules.trim()}`)
    return parts.join('\n\n---\n\n')
  }

  // Sync draft when guide is updated from outside (e.g. another component)
  useEffect(() => { setGuideDraft(projectWritingGuide) }, [projectWritingGuide])

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [writingGuideChatHistory, stage])

  // Auto-start: trigger first AI greeting if chat is empty and key is set
  useEffect(() => {
    if (writingGuideChatHistory.length === 0 && apiKey) {
      triggerAutoStart()
    }
    return () => { abortRef.current?.abort() }
  }, [])

  const triggerAutoStart = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setIsGenerating(true)
    setStage('思考中…')

    await runSettingsGuideChat(
      cfg,
      projectWritingGuide,
      [AUTO_START_MSG],
      (action) => {
        if (controller.signal.aborted) return
        if (action.type === 'chat_reply') {
          addWritingGuideChatMessage({ id: genId(), role: 'assistant', content: action.content, timestamp: Date.now() })
        } else if (action.type === 'update_guide') {
          setGuideDraft(action.content)
        }
      },
      () => { setStage(null); setIsGenerating(false) },
      () => { setStage(null); setIsGenerating(false) },
      controller.signal,
      (toolName, text) => {
        if (toolName === 'update_guide') setGuideDraft(text)
      },
      buildStoryContext(),
    )
  }

  const handleSend = async () => {
    if (!input.trim() || isGenerating || !apiKey) return
    const userText = input.trim()
    setInput('')

    const userMsg: ChatMessage = { id: genId(), role: 'user', content: userText, timestamp: Date.now() }
    addWritingGuideChatMessage(userMsg)

    const controller = new AbortController()
    abortRef.current = controller
    setIsGenerating(true)
    setStage('思考中…')

    // Build message history for the API (exclude the hidden auto-start trigger)
    const apiMessages = [
      ...writingGuideChatHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userText },
    ]

    await runSettingsGuideChat(
      cfg,
      guideDraft,
      apiMessages,
      (action) => {
        if (controller.signal.aborted) return
        if (action.type === 'chat_reply') {
          addWritingGuideChatMessage({ id: genId(), role: 'assistant', content: action.content, timestamp: Date.now() })
        } else if (action.type === 'update_guide') {
          setGuideDraft(action.content)
        }
      },
      () => { setStage(null); setIsGenerating(false) },
      (err) => {
        addWritingGuideChatMessage({ id: genId(), role: 'assistant', content: `出错了：${err}`, timestamp: Date.now() })
        setStage(null)
        setIsGenerating(false)
      },
      controller.signal,
      (toolName, text) => {
        if (!controller.signal.aborted && toolName === 'update_guide') setGuideDraft(text)
      },
      buildStoryContext(),
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleAbort = () => {
    abortRef.current?.abort()
    setStage(null)
    setIsGenerating(false)
  }

  const handleSave = () => {
    setProjectWritingGuide(guideDraft)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center"
      style={{ background: 'rgba(10,9,18,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div
        className="flex flex-col rounded"
        style={{
          width: 'min(940px, calc(100vw - 48px))',
          height: 'min(82vh, calc(100vh - 64px))',
          background: 'var(--bg-card)',
          border: '1px solid rgba(80,160,80,0.3)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
        }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 className="font-serif text-base font-medium" style={{ color: 'var(--text-primary)' }}>
              故事设定
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
              世界观 · 人物 · 冲突 · 文风基调。每次发送时注入上下文，可被状态卡片覆盖。
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1 }}
            className="hover:opacity-70 mt-0.5 flex-shrink-0 ml-4">
            ✕
          </button>
        </div>

        {/* Split content */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* Left: guide editor */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ borderRight: '1px solid var(--border-subtle)' }}>
            {/* Left column label */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-5 py-2"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                设定文档
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.5 }}>
                可直接编辑
              </span>
            </div>
            {/* Textarea */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <textarea
                value={guideDraft}
                onChange={(e) => setGuideDraft(e.target.value)}
                placeholder={`例如：\n【类型】近未来架空悬疑\n【背景】2047年，记忆可被提取和篡改\n【人物】\n  - 林微：记忆侦探，擅长鉴别记忆真伪\n  - 陈零：神秘委托人，记忆存在矛盾\n【冲突】真相与制造的记忆难以分辨\n【文风】克制冷静，多内心独白，少对话`}
                className="w-full resize-none outline-none"
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontFamily: '"DM Sans", sans-serif',
                  lineHeight: '1.75',
                  fontSize: '13px',
                  minHeight: '100%',
                  height: 'auto',
                }}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Right: AI chat */}
          <div
            className="flex-shrink-0 flex flex-col"
            style={{ width: 'min(360px, 42%)' }}>

            {/* Right column label + context controls */}
            <div
              className="flex-shrink-0 px-4 py-2"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  AI 设定助手
                </span>
                {isGenerating && (
                  <button
                    onClick={handleAbort}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: '#e06060', border: '1px solid rgba(200,80,80,0.3)', fontSize: '10px' }}>
                    停止
                  </button>
                )}
              </div>
              {/* Mode toggle + node selector */}
              <div className="flex items-center gap-1 flex-wrap">
                {([
                  { mode: 'current' as ContextMode, label: '微调', tip: '聚焦单个章节：AI 看到从根到选中节点的完整正文、对话历史和状态卡片' },
                  { mode: 'full' as ContextMode, label: '全量', tip: '全局视野：AI 看到所有章节的正文和对话历史，适合整体性的设定调整' },
                  { mode: 'intent' as ContextMode, label: '用户意图', tip: '不看正文，只收集你在各处发出的所有对话指令，AI 从中提炼你的创作意图来生成设定' },
                ]).map(({ mode, label, tip }) => (
                  <button
                    key={mode}
                    onClick={() => setContextMode(mode)}
                    title={tip}
                    className="text-xs px-2 py-0.5 rounded transition-all"
                    style={{
                      background: contextMode === mode ? 'rgba(80,160,80,0.12)' : 'transparent',
                      border: `1px solid ${contextMode === mode ? 'rgba(80,160,80,0.3)' : 'var(--border-subtle)'}`,
                      color: contextMode === mode ? 'rgba(120,200,120,0.9)' : 'var(--text-muted)',
                      fontSize: '10px',
                    }}>
                    {label}
                  </button>
                ))}
                {contextMode === 'current' && (
                  <select
                    value={focusNodeId}
                    onChange={(e) => setFocusNodeId(e.target.value)}
                    title="选择 AI 聚焦的章节 — AI 将看到从根到此节点的完整正文链"
                    className="text-xs rounded outline-none flex-1 min-w-0"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '10px',
                      padding: '2px 4px',
                    }}>
                    {allNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.title}{n.storyContent.trim() ? ` (${n.storyContent.replace(/\s/g, '').length}字)` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {/* Mode description */}
              <p style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.6, marginTop: '4px', lineHeight: 1.5 }}>
                {{ current: '聚焦选中章节的上下文，适合针对特定剧情调整设定',
                   full: '包含所有章节正文和对话，适合全局设定梳理',
                   intent: '从你的全部对话中提炼创作意图，可勾选附加章节正文参考',
                }[contextMode]}
              </p>
              {/* 用户意图模式：附加节点选择 */}
              {contextMode === 'intent' && allNodes.some(n => n.storyContent.trim()) && (
                <div className="flex flex-wrap gap-1 mt-1.5" style={{ maxHeight: '52px', overflowY: 'auto' }}>
                  <span title="默认不看正文，勾选后 AI 额外参考这些章节的正文内容" style={{ color: 'var(--text-muted)', fontSize: '9px', lineHeight: '20px', cursor: 'help' }}>附加正文：</span>
                  {allNodes.filter(n => n.storyContent.trim()).map(n => (
                    <button
                      key={n.id}
                      onClick={() => toggleExtraNode(n.id)}
                      title={`${extraNodeIds.has(n.id) ? '取消' : '添加'}「${n.title}」的正文作为参考`}
                      className="text-xs px-1.5 py-0 rounded transition-all"
                      style={{
                        background: extraNodeIds.has(n.id) ? 'rgba(201,169,110,0.15)' : 'transparent',
                        border: `1px solid ${extraNodeIds.has(n.id) ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                        color: extraNodeIds.has(n.id) ? 'var(--gold)' : 'var(--text-muted)',
                        fontSize: '9px',
                        lineHeight: '18px',
                      }}>
                      {n.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              {writingGuideChatHistory.length === 0 && !stage && !isGenerating && !apiKey && (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.8 }}>
                  配置 API Key 后<br />
                  <span style={{ fontSize: '11px', opacity: 0.6 }}>AI 助手将引导你完善故事设定</span>
                </div>
              )}

              {writingGuideChatHistory.map((msg) => (
                <GuideMsgBubble key={msg.id} msg={msg} />
              ))}

              {stage && (
                <div className="msg-enter mb-2">
                  <div className="text-xs mb-1" style={{ color: 'rgba(120,180,120,0.7)', fontSize: '10px' }}>助手</div>
                  <div
                    className="flex items-center gap-2 text-xs px-3 py-2.5 rounded generating-pulse"
                    style={{
                      background: 'rgba(80,160,80,0.05)',
                      border: '1px solid rgba(80,160,80,0.2)',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                    }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full generating-pulse flex-shrink-0"
                      style={{ background: 'rgba(80,160,80,0.7)' }} />
                    {stage}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
              className="flex-shrink-0 px-3 py-3"
              style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {!apiKey && (
                <p className="text-xs text-center mb-2" style={{ color: 'rgba(200,80,80,0.7)', fontSize: '11px' }}>
                  请先在顶栏配置 API Key
                </p>
              )}
              <div
                className="flex gap-2 items-end rounded"
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${isGenerating ? 'rgba(80,160,80,0.3)' : 'var(--border-subtle)'}`,
                  padding: '7px 10px',
                  transition: 'border-color 0.15s ease',
                }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isGenerating || !apiKey}
                  placeholder={isGenerating ? '生成中…' : '和 AI 聊聊你的故事构想…'}
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
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-all"
                  style={{
                    background: isGenerating || !apiKey || !input.trim() ? 'rgba(80,160,80,0.1)' : 'rgba(80,160,80,0.85)',
                    opacity: isGenerating || !apiKey || !input.trim() ? 0.5 : 1,
                  }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 10L6 2L10 10L6 8L2 10Z"
                      fill={isGenerating || !apiKey || !input.trim() ? 'rgba(80,160,80,0.8)' : '#0e0d15'} />
                  </svg>
                </button>
              </div>
              <p className="text-center mt-1" style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.45 }}>
                Enter 发送 · Shift+Enter 换行
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.55 }}>
              {guideDraft.trim().length > 0 ? `${guideDraft.trim().length} 字符` : '暂无内容'}
            </span>
            {guideDraft.trim() && (
              <button
                onClick={() => setGuideDraft('')}
                className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-70"
                style={{ color: 'rgba(200,80,80,0.6)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '10px' }}>
                清空
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs transition-all hover:opacity-70"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '11px' }}>
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded text-xs font-medium transition-all hover:opacity-90"
              style={{ background: 'rgba(80,160,80,0.2)', color: 'rgba(120,200,120,0.9)', border: '1px solid rgba(80,160,80,0.3)', fontSize: '11px' }}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GuideMsgBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`msg-enter mb-3 ${isUser ? 'pl-2' : ''}`}>
      <div
        className="text-xs mb-1"
        style={{ color: isUser ? 'var(--text-muted)' : 'rgba(120,180,120,0.7)', fontSize: '10px', letterSpacing: '0.05em' }}>
        {isUser ? '你' : '助手'}
      </div>
      <div
        className="text-xs rounded p-2.5"
        style={{
          background: isUser ? 'rgba(240,235,224,0.05)' : 'rgba(80,160,80,0.05)',
          border: `1px solid ${isUser ? 'rgba(240,235,224,0.08)' : 'rgba(80,160,80,0.18)'}`,
          color: 'var(--text-primary)',
          lineHeight: '1.65',
          fontFamily: '"DM Sans", sans-serif',
          fontSize: '12px',
          opacity: 0.9,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
        {msg.content}
      </div>
    </div>
  )
}
