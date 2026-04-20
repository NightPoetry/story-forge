import { useState } from 'react'
import { useStore } from '../store'
import { buildStateCardPrompt } from '../api'
import { generateStateCard } from '../api'

interface Props {
  nodeId: string
}

export default function StateCard({ nodeId }: Props) {
  const { nodes, updateStateCard, getAncestorChain, apiKey, apiUrl, apiFormat, apiModel } = useStore()
  const node = nodes[nodeId]
  const [collapsed, setCollapsed] = useState(false)
  const [updating, setUpdating] = useState(false)

  if (!node) return null

  const handleUpdate = async () => {
    if (!apiKey || !node.storyContent.trim()) return
    setUpdating(true)

    const ancestors = getAncestorChain(nodeId)
    const contextContent = ancestors
      .map((a) => a.storyContent.trim())
      .filter(Boolean)
      .join('\n\n')

    const prompt = buildStateCardPrompt(node.storyContent, contextContent)

    await generateStateCard(
      { apiKey, apiUrl, apiFormat, apiModel },
      prompt,
      (text) => {
        updateStateCard(nodeId, { content: text, lastUpdated: Date.now() })
        setUpdating(false)
      },
      (_err) => {
        setUpdating(false)
      },
    )
  }

  return (
    <div
      className="rounded overflow-hidden"
      style={{
        border: '1px solid var(--border-slate)',
        background: 'rgba(58,95,130,0.06)',
      }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        style={{ borderBottom: collapsed ? 'none' : '1px solid rgba(58,95,130,0.2)' }}>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium"
            style={{
              color: '#5080a8',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontSize: '10px',
            }}>
            派生状态卡片
          </span>
          {node.stateCard.lastUpdated > 0 && node.stateCard.content && (
            <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {new Date(node.stateCard.lastUpdated).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleUpdate()
              }}
              disabled={updating || !apiKey || !node.storyContent.trim()}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{
                color: updating ? 'var(--text-muted)' : '#5080a8',
                border: '1px solid rgba(58,95,130,0.3)',
                opacity: !apiKey || !node.storyContent.trim() ? 0.4 : 1,
                fontSize: '10px',
              }}>
              {updating ? '更新中…' : '自动更新'}
            </button>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{
              color: '#5080a8',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}>
            <path
              d="M2 3.5L5 6.5L8 3.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="p-3">
          <textarea
            value={node.stateCard.content}
            onChange={(e) =>
              updateStateCard(nodeId, {
                content: e.target.value,
                lastUpdated: Date.now(),
              })
            }
            placeholder="当前人物状态、世界状态、关键情节节点…"
            className="w-full text-xs resize-none outline-none"
            rows={4}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontFamily: '"DM Sans", sans-serif',
              lineHeight: '1.65',
              opacity: 0.85,
            }}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}
