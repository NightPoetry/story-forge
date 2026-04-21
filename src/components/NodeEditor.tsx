import { useEffect, useState } from 'react'
import { useStore } from '../store'
import StoryPanel from './StoryPanel'
import ChatPanel from './ChatPanel'
import WritingGuideModal from './WritingGuideModal'

interface Props {
  nodeId: string
  isDirty?: boolean
  onManualSave?: () => void
}

export default function NodeEditor({ nodeId, isDirty, onManualSave }: Props) {
  const { setEditingNode, nodes, continueNode, branchNode, projectWritingGuide, autoSave } = useStore()
  const node = nodes[nodeId]
  const [isStreaming, setIsStreaming] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showCreated, setShowCreated] = useState(() => !!node && Date.now() - node.createdAt < 2000)

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

  const openGuide = () => setShowGuide(true)

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
            {/* Save indicator */}
            <button
              onClick={isDirty ? onManualSave : undefined}
              title={isDirty ? (autoSave ? '等待自动保存… 点击立即保存' : 'Ctrl+S 保存') : '已保存'}
              className="flex-shrink-0 transition-all"
              style={{ cursor: isDirty ? 'pointer' : 'default' }}>
              <div
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  background: isDirty ? 'rgba(200,80,80,0.8)' : 'rgba(80,160,80,0.8)',
                  boxShadow: isDirty ? '0 0 6px rgba(200,80,80,0.3)' : 'none',
                }} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
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

            {/* Writing guide — gold/鎏金 styling, project-level */}
            <button
              onClick={openGuide}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs transition-all hover:opacity-85"
              style={{
                color: 'var(--gold)',
                border: '1px solid var(--border-gold)',
                background: projectWritingGuide.trim() ? 'rgba(201,169,110,0.08)' : 'transparent',
                fontSize: '11px',
                fontWeight: 500,
              }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2h6M2 5h4M2 8h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              故事设定
              {projectWritingGuide.trim() && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--gold)', opacity: 0.7 }} />
              )}
            </button>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 2px' }} />

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

        {/* Created banner */}
        {showCreated && (
          <div
            className="created-banner flex-shrink-0 flex items-center justify-center gap-2 py-1.5"
            onAnimationEnd={() => setShowCreated(false)}
            style={{
              background: node.branchType === 'branch'
                ? 'rgba(58,95,130,0.12)'
                : 'rgba(201,169,110,0.1)',
              borderBottom: `1px solid ${node.branchType === 'branch' ? 'rgba(58,95,130,0.25)' : 'var(--border-gold)'}`,
            }}>
            <span style={{
              color: node.branchType === 'branch' ? '#5080a8' : 'var(--gold)',
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.03em',
            }}>
              {node.branchType === 'branch' ? '⎇ 分支已创建' : node.branchType === 'continue' ? '↓ 续篇已创建' : ''}
            </span>
          </div>
        )}

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
      {showGuide && <WritingGuideModal onClose={() => setShowGuide(false)} />}
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
