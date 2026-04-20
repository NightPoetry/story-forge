import { useState } from 'react'
import { useStore } from '../store'
import { useProjectStore } from '../projectStore'
import ExportModal from './ExportModal'

interface Props {
  onOpenApiSettings: () => void
}

export default function Toolbar({ onOpenApiSettings }: Props) {
  const { apiKey, apiFormat, apiModel, isGenerating, setIsGlobalSettingsOpen, editingNodeId } = useStore()
  const { projects, currentProjectId, closeProject, saveProjectData } = useProjectStore()

  const [showExport, setShowExport] = useState(false)

  const project = projects.find((p) => p.id === currentProjectId)
  const modelShort = apiModel.length > 20 ? apiModel.slice(0, 18) + '…' : apiModel

  const handleBack = async () => {
    const { nodes, rootNodeId, projectWritingGuide } = useStore.getState()
    if (currentProjectId) {
      await saveProjectData(currentProjectId, nodes, rootNodeId, projectWritingGuide)
    }
    await closeProject()
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
        <div className="flex items-center gap-3">
          {/* Back to projects */}
          <button
            onClick={handleBack}
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

          {isGenerating && (
            <span className="text-xs generating-pulse" style={{ color: 'var(--gold)', fontSize: '11px' }}>
              生成中…
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
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
