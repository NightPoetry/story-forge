import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

interface Props {
  nodeId: string
  isStreaming?: boolean
}

export default function StoryPanel({ nodeId, isStreaming }: Props) {
  const { nodes, updateStoryContent, updateNodeTitle, updateTargetWordCount } = useStore()
  const node = nodes[nodeId]
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState('')

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [node?.storyContent])

  if (!node) return null

  const wordCount = node.storyContent.replace(/\s/g, '').length
  const target = node.targetWordCount

  const handleTargetClick = () => {
    setTargetInput(target ? String(target) : '')
    setEditingTarget(true)
  }

  const handleTargetSave = () => {
    const val = parseInt(targetInput, 10)
    updateTargetWordCount(nodeId, isNaN(val) || val <= 0 ? undefined : val)
    setEditingTarget(false)
  }

  const handleTargetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleTargetSave()
    if (e.key === 'Escape') setEditingTarget(false)
  }

  const isShort = target && wordCount < target
  const progress = target ? Math.min(wordCount / target, 1) : 0

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#13111e' }}>
      {/* Title area */}
      <div
        className="px-6 sm:px-10 pt-6 sm:pt-8 pb-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          className="flex flex-wrap items-center gap-2 mb-2 text-xs"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '10px' }}>
          <span style={{
            color: node.branchType === 'branch' ? '#5080a8'
              : node.branchType === 'root' ? 'var(--gold-dim)' : 'var(--text-muted)',
          }}>
            {node.branchType === 'root' ? '根节点' : node.branchType === 'branch' ? '分支线' : '续篇'}
          </span>
          <span>·</span>
          <span>{new Date(node.createdAt).toLocaleDateString('zh-CN')}</span>
        </div>
        <input
          value={node.title}
          onChange={(e) => updateNodeTitle(nodeId, e.target.value)}
          className="w-full bg-transparent outline-none font-serif"
          style={{
            color: 'var(--text-primary)',
            fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
            fontWeight: 500,
            letterSpacing: '0.02em',
            border: 'none',
          }}
          placeholder="节点标题…"
        />
      </div>

      {/* Scrollable story area */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6">
        <textarea
          ref={textareaRef}
          value={node.storyContent}
          onChange={(e) => updateStoryContent(nodeId, e.target.value)}
          className={`story-text w-full${isStreaming ? ' cursor-blink' : ''}`}
          placeholder="这里是故事正文。在右侧对话栏输入创作指令，AI 将实时生成内容…"
          spellCheck={false}
          style={{
            overflow: 'hidden',
            resize: 'none',
            minHeight: '200px',
          }}
        />
      </div>

      {/* Footer stats — wraps on narrow widths */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-6 sm:px-10 py-2.5 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '11px' }}>

        {/* Left: word count + progress */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span style={{ color: isShort ? 'rgba(200,140,60,0.85)' : 'var(--text-muted)' }}>
            {wordCount.toLocaleString()} 字
          </span>
          {target && (
            <>
              <span style={{ opacity: 0.3 }}>/</span>
              <span style={{ color: isShort ? 'rgba(200,140,60,0.7)' : 'rgba(80,160,100,0.7)' }}>
                {target.toLocaleString()}
              </span>
              {!isShort
                ? <span style={{ color: 'rgba(80,160,100,0.6)', fontSize: '10px' }}>✓</span>
                : <span style={{ color: 'rgba(200,140,60,0.5)', fontSize: '10px' }}>↑还差{(target - wordCount).toLocaleString()}</span>
              }
              <div className="w-12 h-1 rounded-full overflow-hidden flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress * 100}%`,
                    background: isShort ? 'rgba(200,140,60,0.5)' : 'rgba(80,160,100,0.5)',
                  }} />
              </div>
            </>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: generating indicator + target button */}
        {isStreaming && (
          <span className="generating-pulse flex-shrink-0" style={{ color: 'var(--gold)' }}>正在生成…</span>
        )}

        {editingTarget ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input
              type="number"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onBlur={handleTargetSave}
              onKeyDown={handleTargetKeyDown}
              placeholder="目标字数"
              autoFocus
              min={1}
              className="text-xs outline-none rounded px-2 py-0.5 w-20"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-gold)',
                color: 'var(--text-primary)',
                fontSize: '11px',
              }}
            />
            <span style={{ fontSize: '10px', opacity: 0.4 }}>Enter</span>
          </div>
        ) : (
          <button
            onClick={handleTargetClick}
            className="flex-shrink-0 text-xs px-2 py-0.5 rounded transition-all hover:opacity-80"
            style={{
              color: target ? 'var(--gold-dim)' : 'var(--text-muted)',
              border: `1px solid ${target ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
              fontSize: '10px',
            }}>
            {target ? `目标 ${target.toLocaleString()}字` : '设目标字数'}
          </button>
        )}
      </div>
    </div>
  )
}
