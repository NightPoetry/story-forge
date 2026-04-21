import { useState } from 'react'
import { useStore } from '../store'
import { useProjectStore } from '../projectStore'
import ExportModal from './ExportModal'

interface Props {
  onOpenApiSettings: () => void
  isDirty: boolean
  onManualSave: () => void
  onBack: () => void
}

export default function Toolbar({
  onOpenApiSettings, isDirty, onManualSave, onBack,
}: Props) {
  const {
    apiKey, apiFormat, apiModel, isGenerating,
    setIsGlobalSettingsOpen, editingNodeId,
    autoSave, setAutoSave, undoStack, redoStack,
  } = useStore()
  const { projects, currentProjectId } = useProjectStore()

  const [showExport, setShowExport] = useState(false)

  const project = projects.find((p) => p.id === currentProjectId)
  const modelShort = apiModel.length > 20 ? apiModel.slice(0, 18) + '…' : apiModel

  return (
    <>
      <header
        className="flex items-center justify-between px-5 h-12 flex-shrink-0"
        style={{
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-subtle)',
          zIndex: 20,
          position: 'relative',
        }}>
        {/* Left */}
        <div className="flex items-center gap-3">
          {/* Back to projects */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all hover:opacity-80"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            项目
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />

          {/* Logo */}
          <div
            className="w-5 h-5 rounded-sm flex items-center justify-center"
            style={{ background: 'var(--gold)', opacity: 0.9 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M1 11L4 7L7 9L11 1" stroke="#0e0d15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Project name */}
          <span className="font-serif text-sm" style={{ color: 'var(--text-primary)', letterSpacing: '0.03em' }}>
            {project?.name ?? '叙事工坊'}
          </span>

          {/* Save indicator */}
          <button
            onClick={isDirty ? onManualSave : undefined}
            title={isDirty ? (autoSave ? '正在等待自动保存… 点击立即保存' : '有未保存的更改，点击或 Ctrl+S 保存') : '所有更改已保存'}
            className="flex items-center gap-1.5 ml-1 transition-all"
            style={{ cursor: isDirty ? 'pointer' : 'default' }}>
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300"
              style={{
                background: isDirty ? 'rgba(200,80,80,0.8)' : 'rgba(80,160,80,0.8)',
                boxShadow: isDirty ? '0 0 6px rgba(200,80,80,0.3)' : 'none',
              }} />
            {isDirty && !autoSave && (
              <span style={{ color: 'rgba(200,80,80,0.6)', fontSize: '10px' }}>Ctrl+S</span>
            )}
          </button>

          {isGenerating && (
            <span className="text-xs generating-pulse" style={{ color: 'var(--gold)', fontSize: '11px' }}>
              生成中…
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {/* Auto-save toggle */}
          <button
            onClick={() => setAutoSave(!autoSave)}
            title={autoSave ? '自动保存已开启，点击关闭' : '自动保存已关闭，点击开启'}
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
    </>
  )
}
