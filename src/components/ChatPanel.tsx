import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { buildFixedSystemPrompt, buildDynamicContext, runIntelligentGeneration, genId } from '../api'
import { ChatMessage } from '../types'
import StateCard from './StateCard'
import ForeshadowingPanel from './ForeshadowingPanel'

interface Props {
  nodeId: string
  onStreamingChange: (streaming: boolean) => void
}

type Tab = 'chat' | 'state' | 'foreshadowing'

const TOOL_LABELS: Record<string, string> = {
  write_story: '正在撰写故事…',
  update_state_card: '正在更新状态卡片…',
  chat_reply: '正在生成回复…',
  collect_foreshadowing: '正在回收伏笔…',
}

export default function ChatPanel({ nodeId, onStreamingChange }: Props) {
  const {
    nodes, addChatMessage, updateStoryContent, updateStateCard,
    getAncestorChain, globalSettings, projectWritingGuide,
    apiKey, apiUrl, apiFormat, apiModel,
    isGenerating, setIsGenerating,
    collectForeshadowing,
  } = useStore()

  const node = nodes[nodeId]
  const [input, setInput] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
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

    // Snapshot state for rollback if generation fails
    const prevStoryContent = node.storyContent
    const prevStateCard = { ...node.stateCard }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsGenerating(true)
    onStreamingChange(true)
    setStage('思考中…')

    const ancestors = getAncestorChain(nodeId)
    const fixedSystem = buildFixedSystemPrompt(globalSettings)
    const dynamicContext = buildDynamicContext(node, ancestors, projectWritingGuide)
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
        if (action.type === 'write_story') {
          updateStoryContent(nodeId, action.content)
        } else if (action.type === 'update_state_card') {
          updateStateCard(nodeId, { content: action.content, lastUpdated: Date.now() })
        } else if (action.type === 'chat_reply') {
          addChatMessage(nodeId, {
            id: genId(), role: 'assistant', content: action.content, timestamp: Date.now(),
          })
        } else if (action.type === 'collect_foreshadowing') {
          collectForeshadowing(nodeId, action.id, action.revealNote)
        }
      },
      (toolName) => {
        if (!controller.signal.aborted) setStage(TOOL_LABELS[toolName] ?? '处理中…')
      },
      () => {
        setStage(null)
        setIsGenerating(false)
        onStreamingChange(false)
      },
      (err) => {
        // Roll back any partial writes so content isn't left in a broken state
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
      // Real-time streaming delta — updates content as it arrives
      (toolName, text) => {
        if (controller.signal.aborted) return
        if (toolName === 'write_story') {
          updateStoryContent(nodeId, text)
        } else if (toolName === 'update_state_card') {
          updateStateCard(nodeId, { content: text, lastUpdated: Date.now() })
        }
      },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleAbort = () => {
    abortControllerRef.current?.abort()
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
        {isGenerating && (
          <button onClick={handleAbort}
            className="flex-shrink-0 text-xs px-2 py-1 rounded mb-1 ml-2"
            style={{ color: '#e06060', border: '1px solid rgba(200,80,80,0.3)', fontSize: '10px' }}>
            停止
          </button>
        )}
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
  const [expanded, setExpanded] = useState(false)
  const truncated = msg.content.length > 200 && !expanded
  const display = truncated ? msg.content.slice(0, 200) + '…' : msg.content

  return (
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
        onClick={() => !isUser && msg.content.length > 200 && setExpanded((e) => !e)}
        style={{
          background: isUser ? 'rgba(240,235,224,0.06)' : 'rgba(201,169,110,0.05)',
          border: `1px solid ${isUser ? 'rgba(240,235,224,0.08)' : 'var(--border-gold)'}`,
          color: 'var(--text-primary)',
          lineHeight: '1.65',
          fontFamily: '"DM Sans", sans-serif',
          fontSize: '12px',
          opacity: 0.9,
          cursor: !isUser && msg.content.length > 200 ? 'pointer' : 'default',
        }}>
        {display}
        {msg.content.length > 200 && !isUser && (
          <span style={{ color: 'var(--gold-dim)', marginLeft: '4px', fontSize: '10px' }}>
            {expanded ? '收起' : '展开'}
          </span>
        )}
      </div>
    </div>
  )
}
