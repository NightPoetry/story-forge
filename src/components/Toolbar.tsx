import { useState } from 'react'
import { useStore } from '../store'
import { useProjectStore } from '../projectStore'
import ExportModal from './ExportModal'
import WritingGuideModal from './WritingGuideModal'

interface Props {
  onOpenApiSettings: () => void
  isDirty: boolean
  onManualSave: () => void
  onBack: () => void
}

export default function Toolbar({ onOpenApiSettings, isDirty, onManualSave, onBack }: Props) {
  const {
    apiKey, apiFormat, apiModel, isGenerating,
    setIsGlobalSettingsOpen, editingNodeId, setEditingNode,
    autoSave, setAutoSave,
    nodes, continueNode, branchNode, getAncestorChain,
    projectWritingGuide,
  } = useStore()
  const { projects, currentProjectId } = useProjectStore()

  const [showExport, setShowExport] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const project = projects.find((p) => p.id === currentProjectId)
  const modelShort = apiModel.length > 20 ? apiModel.slice(0, 18) + '…' : apiModel
  const editingNode = editingNodeId ? nodes[editingNodeId] : null

  const handleContinue = () => {
    if (!editingNodeId) return
    const newId = continueNode(editingNodeId)
    setEditingNode(newId)
  }

  const handleBranch = () => {
    if (!editingNodeId) return
    const newId = branchNode(editingNodeId)
    setEditingNode(newId)
  }

  return (
    <>
      <header
        className="flex items-center justify-between px-5 h-12 flex-shrink-0"
        style={{
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-subtle)',
          zIndex: 10,
        }}>
        {/* Left */}
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all hover:opacity-80 flex-shrink-0"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            项目
          </button>

          <div className="flex-shrink-0" style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />

          <div className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--gold)', opacity: 0.9 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M1 11L4 7L7 9L11 1" stroke="#0e0d15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Project name + breadcrumbs */}
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="font-serif text-sm flex-shrink-0" style={{ color: editingNode ? 'var(--text-muted)' : 'var(--text-primary)', letterSpacing: '0.03em' }}>
              {project?.name ?? '叙事工坊'}
            </span>
            {editingNode && (
              <>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="flex-shrink-0" style={{ opacity: 0.25 }}>
                  <path d="M2 1l4 3-4 3" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <BreadcrumbNav nodeId={editingNodeId!} />
              </>
            )}
          </div>

          {/* Save indicator */}
          <button
            onClick={isDirty ? onManualSave : undefined}
            title={isDirty ? (autoSave ? '正在等待自动保存… 点击立即保存' : '有未保存的更改，Ctrl+S 保存') : '已保存'}
            className="flex items-center gap-1.5 flex-shrink-0"
            style={{ cursor: isDirty ? 'pointer' : 'default' }}>
            <div
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background: isDirty ? 'rgba(200,80,80,0.8)' : 'rgba(80,160,80,0.8)',
                boxShadow: isDirty ? '0 0 6px rgba(200,80,80,0.3)' : 'none',
              }} />
            {isDirty && !autoSave && (
              <span style={{ color: 'rgba(200,80,80,0.6)', fontSize: '10px' }}>Ctrl+S</span>
            )}
          </button>

          {isGenerating && (
            <span className="text-xs generating-pulse flex-shrink-0" style={{ color: 'var(--gold)', fontSize: '11px' }}>
              生成中…
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Editing actions — only when a node is open */}
          {editingNode && (
            <>
              <button
                onClick={handleContinue}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
                style={{ color: 'var(--gold)', border: '1px solid var(--border-gold)', fontSize: '11px' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 6l4 3 4-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                续写
              </button>
              <button
                onClick={handleBranch}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
                style={{ color: '#5080a8', border: '1px solid var(--border-slate)', fontSize: '11px' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v3M2 8V6l3-2 3 2v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                派生分支
              </button>

              <div className="flex-shrink-0" style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />

              {/* Writing guide — gold/鎏金 */}
              <button
                onClick={() => setShowGuide(true)}
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

              <div className="flex-shrink-0" style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />

              <button
                onClick={() => setEditingNode(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-70"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '11px' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                关闭 Esc
              </button>

              <div className="flex-shrink-0" style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 3px' }} />
            </>
          )}

          {/* Auto-save toggle */}
          <button
            onClick={() => setAutoSave(!autoSave)}
            title={autoSave ? '自动保存已开启' : '自动保存已关闭'}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-all hover:opacity-80"
            style={{
              color: autoSave ? 'rgba(80,160,80,0.7)' : 'var(--text-muted)',
              border: `1px solid ${autoSave ? 'rgba(80,160,80,0.25)' : 'var(--border-subtle)'}`,
              fontSize: '10px',
            }}>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <path d="M2 1h6l1 1v6l-1 1H2L1 8V2l1-1z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M3 1v3h4V1" stroke="currentColor" strokeWidth="1" />
              <rect x="3" y="6" width="4" height="2" rx="0.5" stroke="currentColor" strokeWidth="0.8" />
            </svg>
            自动
          </button>

          {/* Export */}
          {editingNodeId && (
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
              style={{ color: 'var(--gold-dim)', border: '1px solid var(--border-gold)' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              导出
            </button>
          )}

          {/* API status */}
          <button
            onClick={onOpenApiSettings}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
            style={{
              border: `1px solid ${apiKey ? 'rgba(201,169,110,0.2)' : 'var(--border-subtle)'}`,
              color: apiKey ? 'var(--text-muted)' : 'rgba(200,80,80,0.7)',
            }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: apiKey ? 'var(--gold)' : 'rgba(200,80,80,0.6)' }} />
            {apiKey ? (
              <span className="flex items-center gap-1.5">
                <span className="px-1 py-0.5 rounded"
                  style={{
                    background: apiFormat === 'anthropic' ? 'rgba(201,169,110,0.12)' : 'rgba(58,95,130,0.15)',
                    color: apiFormat === 'anthropic' ? 'var(--gold-dim)' : '#5080a8',
                    fontSize: '10px', fontWeight: 500,
                  }}>
                  {apiFormat === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{modelShort}</span>
              </span>
            ) : (
              <span style={{ fontSize: '11px' }}>配置 API</span>
            )}
          </button>

          {/* Global settings */}
          <button
            onClick={() => setIsGlobalSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all hover:opacity-80"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.93 2.93l.7.7M10.37 10.37l.7.7M2.93 11.07l.7-.7M10.37 3.63l.7-.7"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            写作规则
          </button>
        </div>
      </header>

      {showExport && editingNodeId && (
        <ExportModal nodeId={editingNodeId} onClose={() => setShowExport(false)} />
      )}
      {showGuide && (
        <WritingGuideModal onClose={() => setShowGuide(false)} />
      )}
    </>
  )
}

function BreadcrumbNav({ nodeId }: { nodeId: string }) {
  const { nodes, getAncestorChain, setEditingNode } = useStore()
  const node = nodes[nodeId]
  if (!node) return null

  const ancestors = getAncestorChain(nodeId)
  const crumbs = [...ancestors, node]

  return (
    <div className="flex items-center gap-1 overflow-hidden min-w-0">
      {crumbs.map((n, i) => (
        <div key={n.id} className="flex items-center gap-1 min-w-0">
          {i > 0 && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0, opacity: 0.25 }}>
              <path d="M2 1l4 3-4 3" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
          <button
            onClick={() => setEditingNode(n.id)}
            className="text-xs truncate max-w-20 transition-all hover:opacity-80"
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
