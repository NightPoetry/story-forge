import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { useProjectStore } from './projectStore'
import { ApiFormat } from './types'
import Toolbar from './components/Toolbar'
import GlobalSettings from './components/GlobalSettings'
import NodeGraph from './components/NodeGraph'
import NodeEditor from './components/NodeEditor'
import ProjectsPage from './components/ProjectsPage'
import NodeTrashPanel from './components/NodeTrashPanel'

const FORMAT_DEFAULTS: Record<ApiFormat, { url: string; model: string }> = {
  anthropic: { url: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
  openai:    { url: 'https://api.openai.com',    model: 'gpt-4o' },
}

export default function App() {
  const {
    apiKey, apiUrl, apiFormat, apiModel,
    setApiKey, setApiUrl, setApiFormat, setApiModel,
    nodes, rootNodeId, editingNodeId,
    projectWritingGuide, writingGuideChatHistory,
    trashedNodes, autoSave, undo, redo,
  } = useStore()

  const { init, view, currentProjectId, saveProjectData, closeProject } = useProjectStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ key: '', url: '', model: '', format: 'anthropic' as ApiFormat })
  const [isDirty, setIsDirty] = useState(false)
  const [showNodeTrash, setShowNodeTrash] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Init project store on mount
  useEffect(() => { init() }, [])

  // Show API key modal if not configured
  useEffect(() => { if (!apiKey) setModalOpen(true) }, [apiKey])

  // Auto-save: debounced 1.5s, watches all project data
  useEffect(() => {
    if (!currentProjectId) return
    setIsDirty(true)
    if (!autoSave) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await saveProjectData(currentProjectId, nodes, rootNodeId, projectWritingGuide, writingGuideChatHistory, trashedNodes)
      setIsDirty(false)
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [nodes, rootNodeId, projectWritingGuide, writingGuideChatHistory, trashedNodes, currentProjectId, autoSave])

  // Manual save
  const handleManualSave = useCallback(async () => {
    if (!currentProjectId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await saveProjectData(currentProjectId, nodes, rootNodeId, projectWritingGuide, writingGuideChatHistory, trashedNodes)
    setIsDirty(false)
  }, [currentProjectId, nodes, rootNodeId, projectWritingGuide, writingGuideChatHistory, trashedNodes])

  // Back to projects
  const handleBack = useCallback(async () => {
    if (currentProjectId) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProjectData(currentProjectId, nodes, rootNodeId, projectWritingGuide, writingGuideChatHistory, trashedNodes)
      setIsDirty(false)
    }
    await closeProject()
  }, [currentProjectId, nodes, rootNodeId, projectWritingGuide, writingGuideChatHistory, trashedNodes])

  // Keyboard shortcuts: Ctrl+S, Ctrl+Z, Ctrl+R, Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 's') {
        e.preventDefault()
        handleManualSave()
      }
      const inEditable = document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT'
      if (e.key === 'z' && !e.shiftKey && !inEditable) {
        e.preventDefault()
        undo()
      }
      if ((e.key === 'r' || (e.key === 'z' && e.shiftKey)) && !inEditable) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleManualSave, undo, redo])

  const openModal = () => {
    setForm({ key: apiKey, url: apiUrl, model: apiModel, format: apiFormat })
    setModalOpen(true)
  }

  const handleFormatSwitch = (fmt: ApiFormat) =>
    setForm((f) => ({ ...f, format: fmt, url: FORMAT_DEFAULTS[fmt].url, model: FORMAT_DEFAULTS[fmt].model }))

  const handleSave = () => {
    if (!form.key.trim()) return
    setApiKey(form.key.trim())
    setApiUrl(form.url.trim() || FORMAT_DEFAULTS[form.format].url)
    setApiFormat(form.format)
    setApiModel(form.model.trim() || FORMAT_DEFAULTS[form.format].model)
    setModalOpen(false)
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {view === 'projects' ? (
        <ProjectsPage />
      ) : (
        <>
          <Toolbar
            onOpenApiSettings={openModal}
            isDirty={isDirty}
            onManualSave={handleManualSave}
            onBack={handleBack}
          />
          <div className="flex-1 relative overflow-hidden">
            <NodeGraph />
            {editingNodeId && <NodeEditor nodeId={editingNodeId} isDirty={isDirty} onManualSave={handleManualSave} />}
            <GlobalSettings />
            {showNodeTrash && <NodeTrashPanel onClose={() => setShowNodeTrash(false)} />}

            {/* Floating trash button — bottom-right, gold circle */}
            <button
              onClick={() => setShowNodeTrash(true)}
              title="节点回收站"
              className="absolute flex items-center justify-center rounded-full transition-all hover:scale-105"
              style={{
                bottom: '20px',
                right: '20px',
                width: '40px',
                height: '40px',
                background: trashedNodes.length > 0 ? 'rgba(201,169,110,0.15)' : 'rgba(201,169,110,0.08)',
                border: '1px solid var(--border-gold)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                zIndex: 5,
              }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4.5h10M5.5 4.5V3.5h5v1M4 4.5l.6 9h6.8l.6-9" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.5 7v4M9.5 7v4" stroke="var(--gold)" strokeWidth="1" strokeLinecap="round" />
              </svg>
              {trashedNodes.length > 0 && (
                <span
                  className="absolute flex items-center justify-center rounded-full"
                  style={{
                    top: '-3px',
                    right: '-3px',
                    width: '16px',
                    height: '16px',
                    background: 'var(--gold)',
                    color: '#0e0d15',
                    fontSize: '9px',
                    fontWeight: 700,
                  }}>
                  {trashedNodes.length}
                </span>
              )}
            </button>
          </div>
        </>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,9,18,0.88)', backdropFilter: 'blur(6px)' }}>
          <div
            className="w-full max-w-md rounded"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-gold)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h2 className="font-serif text-xl" style={{ color: 'var(--text-primary)' }}>API 连接配置</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>密钥仅存储在本地</p>
              </div>
              {apiKey && (
                <button onClick={() => setModalOpen(false)}
                  style={{ color: 'var(--text-muted)' }} className="hover:opacity-70">✕</button>
              )}
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Format */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>接口格式</label>
                <div className="flex gap-2">
                  {(['anthropic', 'openai'] as ApiFormat[]).map((fmt) => (
                    <button key={fmt} onClick={() => handleFormatSwitch(fmt)}
                      className="flex-1 py-2.5 rounded text-sm font-medium transition-all"
                      style={{
                        background: form.format === fmt ? 'var(--gold)' : 'var(--bg-elevated)',
                        color: form.format === fmt ? '#0e0d15' : 'var(--text-muted)',
                        border: `1px solid ${form.format === fmt ? 'var(--gold)' : 'var(--border-subtle)'}`,
                      }}>
                      {fmt === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.7 }}>
                  {form.format === 'anthropic' ? '适用于 Anthropic 官方 API 及兼容代理' : '适用于 OpenAI、Ollama、LM Studio、DeepSeek 等'}
                </p>
              </div>

              {/* URL */}
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>API 地址</label>
                <input type="url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder={FORMAT_DEFAULTS[form.format].url}
                  className="w-full px-3 py-2.5 rounded text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '12px' }} />
              </div>

              {/* Key */}
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>API 密钥</label>
                <input type="password" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  placeholder={form.format === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                  className="w-full px-3 py-2.5 rounded text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '12px' }}
                  autoFocus={!apiKey} />
              </div>

              {/* Model */}
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>模型名称</label>
                <input type="text" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder={FORMAT_DEFAULTS[form.format].model}
                  className="w-full px-3 py-2.5 rounded text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '12px' }} />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={handleSave} disabled={!form.key.trim()}
                className="flex-1 py-2.5 rounded text-sm font-medium transition-all"
                style={{ background: form.key.trim() ? 'var(--gold)' : 'var(--bg-elevated)', color: form.key.trim() ? '#0e0d15' : 'var(--text-muted)' }}>
                保存配置
              </button>
              {apiKey && (
                <button onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded text-sm hover:opacity-70 transition-all"
                  style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  取消
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
