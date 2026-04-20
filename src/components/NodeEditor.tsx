import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import StoryPanel from './StoryPanel'
import ChatPanel from './ChatPanel'

interface Props {
  nodeId: string
}

export default function NodeEditor({ nodeId }: Props) {
  const { setEditingNode, nodes, continueNode, branchNode, projectWritingGuide, setProjectWritingGuide } = useStore()
  const node = nodes[nodeId]
  const [isStreaming, setIsStreaming] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [guideDraft, setGuideDraft] = useState('')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showGuide) setEditingNode(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setEditingNode, showGuide])

  if (!node) return null

  const handleContinue = () => {
    const newId = continueNode(nodeId)
    setEditingNode(newId)
  }

  const handleBranch = () => {
    const newId = branchNode(nodeId)
    setEditingNode(newId)
  }

  const openGuide = () => {
    setGuideDraft(projectWritingGuide)
    setShowGuide(true)
  }

  const saveGuide = () => {
    setProjectWritingGuide(guideDraft)
    setShowGuide(false)
  }

  return (
    <div
      className="fixed inset-0 z-20 overlay-enter flex flex-col"
      style={{ background: 'rgba(10,9,18,0.6)', backdropFilter: 'blur(3px)' }}>
      {/* Editor container */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col"
        style={{
          top: '48px',
          background: '#13111e',
          borderTop: '1px solid var(--border-gold)',
          boxShadow: '0 -24px 80px rgba(0,0,0,0.7)',
        }}>
        {/* Editor top bar */}
        <div
          className="flex items-center justify-between px-4 py-2 flex-shrink-0 gap-2 min-w-0"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            background: '#111019',
          }}>
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <BreadcrumbNav nodeId={nodeId} />
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Writing guide button */}
            <button
              onClick={openGuide}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
              style={{
                color: projectWritingGuide.trim() ? 'rgba(120,180,120,0.9)' : 'var(--text-muted)',
                border: `1px solid ${projectWritingGuide.trim() ? 'rgba(80,160,80,0.3)' : 'var(--border-subtle)'}`,
                fontSize: '11px',
              }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2h6M2 5h4M2 8h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              故事设定
              {projectWritingGuide.trim() && (
                <span className="w-1 h-1 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(80,160,80,0.8)' }} />
              )}
            </button>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 2px' }} />

            <button
              onClick={handleContinue}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
              style={{
                color: 'var(--gold)',
                border: '1px solid var(--border-gold)',
                fontSize: '11px',
              }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 6l4 3 4-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              续写
            </button>
            <button
              onClick={handleBranch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
              style={{
                color: '#5080a8',
                border: '1px solid var(--border-slate)',
                fontSize: '11px',
              }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v3M2 8V6l3-2 3 2v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              派生分支
            </button>
            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 4px' }} />
            <button
              onClick={() => setEditingNode(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-70"
              style={{
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                fontSize: '11px',
              }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              关闭 Esc
            </button>
          </div>
        </div>

        {/* Split panels */}
        <div className="flex-1 flex overflow-hidden" style={{ flexDirection: 'row' }}>
          <div className="flex-1 overflow-hidden" style={{ minWidth: 0 }}>
            <StoryPanel nodeId={nodeId} isStreaming={isStreaming} />
          </div>
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{ width: 'min(360px, 45vw)', minWidth: '260px' }}>
            <ChatPanel nodeId={nodeId} onStreamingChange={setIsStreaming} />
          </div>
        </div>
      </div>

      {/* Writing Guide Modal */}
      {showGuide && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center"
          style={{ background: 'rgba(10,9,18,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowGuide(false)}>
          <div
            className="w-full rounded flex flex-col"
            style={{
              maxWidth: 'min(540px, calc(100vw - 32px))',
              background: 'var(--bg-card)',
              border: '1px solid rgba(80,160,80,0.3)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              maxHeight: 'min(70vh, calc(100vh - 96px))',
            }}
            onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-start justify-between px-6 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h2 className="font-serif text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                  故事设定
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  本项目的世界观、人物关系、背景设定。每次发送时注入上下文末尾，优先级高于写作规则，可被状态卡片覆盖。
                </p>
              </div>
              <button onClick={() => setShowGuide(false)}
                style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1 }}
                className="hover:opacity-70 mt-0.5">
                ✕
              </button>
            </div>

            {/* Textarea — flex-1 min-h-0 prevents overflow */}
            <div className="flex-1 min-h-0 flex flex-col p-4">
              <textarea
                value={guideDraft}
                onChange={(e) => setGuideDraft(e.target.value)}
                placeholder="例如：&#10;- 文风：简洁克制，少用形容词&#10;- 主角性格：冷静内敛，行事果断&#10;- 世界观：近未来架空，科技高度发达但贫富分化严重&#10;- 叙事视角：第三人称有限视角"
                className="flex-1 min-h-0 w-full resize-none outline-none text-sm"
                autoFocus
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontFamily: '"DM Sans", sans-serif',
                  lineHeight: '1.7',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.6 }}>
                {guideDraft.trim().length > 0 ? `${guideDraft.trim().length} 字符` : '留空则不附加'}
              </span>
              <div className="flex gap-2">
                {guideDraft.trim() && (
                  <button
                    onClick={() => setGuideDraft('')}
                    className="px-3 py-1.5 rounded text-xs transition-all hover:opacity-70"
                    style={{ color: 'rgba(200,80,80,0.7)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '11px' }}>
                    清空
                  </button>
                )}
                <button
                  onClick={() => setShowGuide(false)}
                  className="px-3 py-1.5 rounded text-xs transition-all hover:opacity-70"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '11px' }}>
                  取消
                </button>
                <button
                  onClick={saveGuide}
                  className="px-4 py-1.5 rounded text-xs font-medium transition-all hover:opacity-90"
                  style={{ background: 'rgba(80,160,80,0.2)', color: 'rgba(120,200,120,0.9)', border: '1px solid rgba(80,160,80,0.3)', fontSize: '11px' }}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BreadcrumbNav({ nodeId }: { nodeId: string }) {
  const { nodes, getAncestorChain, setEditingNode } = useStore()
  const node = nodes[nodeId]
  if (!node) return null

  const ancestors = getAncestorChain(nodeId)
  const crumbs = [...ancestors, node]

  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {crumbs.map((n, i) => (
        <div key={n.id} className="flex items-center gap-1 min-w-0">
          {i > 0 && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
              <path d="M2 1l4 3-4 3" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
          <button
            onClick={() => setEditingNode(n.id)}
            className="text-xs truncate max-w-24 transition-all hover:opacity-80"
            style={{
              color: n.id === nodeId ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: n.id === nodeId ? 500 : 400,
              fontSize: '12px',
            }}>
            {n.title}
          </button>
        </div>
      ))}
    </div>
  )
}
