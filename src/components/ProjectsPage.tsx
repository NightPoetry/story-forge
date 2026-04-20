import { useEffect, useState } from 'react'
import { useProjectStore } from '../projectStore'
import { useStore } from '../store'
import { readProjectData } from '../storage'
import { ProjectMeta } from '../types'
import CreateProjectModal from './CreateProjectModal'
import BulkExportModal from './BulkExportModal'

export default function ProjectsPage() {
  const { projects, openProject, deleteProject, importProjects, isLoading } = useProjectStore()
  const { resetWithProjectData, initRootNode } = useStore()

  const [unlocking, setUnlocking] = useState<ProjectMeta | null>(null)
  const [unlockPw, setUnlockPw] = useState('')
  const [unlockErr, setUnlockErr] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [multiMode, setMultiMode] = useState(false)
  const [showBulkExport, setShowBulkExport] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  const handleOpen = async (meta: ProjectMeta) => {
    if (multiMode) {
      setSelected((prev) => {
        const next = new Set(prev)
        next.has(meta.id) ? next.delete(meta.id) : next.add(meta.id)
        return next
      })
      return
    }
    if (meta.passwordHash) {
      setUnlocking(meta)
      setUnlockPw('')
      setUnlockErr('')
      return
    }
    await doOpen(meta.id)
  }

  const doOpen = async (id: string, password?: string) => {
    const res = await openProject(id, password)
    if (res === 'wrong-password') {
      setUnlockErr('密码错误，请重试')
      return
    }
    const data = await readProjectData(id)
    if (data && Object.keys(data.nodes).length > 0) {
      // Migrate: ensure each node has foreshadowings field; old saves stored them at project level
      const migratedNodes = Object.fromEntries(
        Object.entries(data.nodes).map(([nid, node]) => [nid, {
          ...node,
          foreshadowings: node.foreshadowings ?? (nid === data.rootNodeId ? (data.foreshadowings ?? []) : []),
          foreshadowingCounter: node.foreshadowingCounter ?? (nid === data.rootNodeId ? (data.foreshadowingCounter ?? 0) : 0),
        }])
      )
      resetWithProjectData(migratedNodes, data.rootNodeId, data.writingGuide ?? '')
    } else {
      resetWithProjectData({}, null, '')
      initRootNode()
    }
    setUnlocking(null)
  }

  const handleUnlockSubmit = async () => {
    if (!unlocking) return
    await doOpen(unlocking.id, unlockPw)
  }

  const handleDelete = async (id: string) => {
    await deleteProject(id)
    setDeleting(null)
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleImport = async () => {
    setImporting(true)
    setImportMsg('')
    const { count, errors } = await importProjects()
    setImporting(false)
    if (count > 0) setImportMsg(`成功导入 ${count} 个项目`)
    else if (errors.length > 0) setImportMsg(errors[0])
    setTimeout(() => setImportMsg(''), 3000)
  }

  const toggleMultiMode = () => {
    setMultiMode((m) => !m)
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-6 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-6 h-6 rounded-sm flex items-center justify-center"
              style={{ background: 'var(--gold)' }}>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                <path d="M1 11L4 7L7 9L11 1" stroke="#0e0d15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="font-serif text-2xl" style={{ color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
              叙事工坊
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)', paddingLeft: '36px' }}>
            选择故事项目，或创建一个新的
          </p>
        </div>

        <div className="flex items-center gap-2">
          {importMsg && (
            <span className="text-xs px-3 py-1 rounded" style={{ background: 'rgba(201,169,110,0.1)', color: 'var(--gold)', border: '1px solid var(--border-gold)' }}>
              {importMsg}
            </span>
          )}
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs transition-all hover:opacity-80"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {importing ? '导入中…' : '导入备份'}
          </button>
          {projects.length > 0 && (
            <button
              onClick={toggleMultiMode}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-xs transition-all hover:opacity-80"
              style={{
                border: `1px solid ${multiMode ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                color: multiMode ? 'var(--gold)' : 'var(--text-muted)',
                background: multiMode ? 'var(--gold-faint)' : 'transparent',
              }}>
              {multiMode ? `已选 ${selected.size} 个` : '多选'}
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32" style={{ color: 'var(--text-muted)' }}>
            加载中…
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {/* New project card */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex flex-col items-center justify-center rounded transition-all hover:opacity-80"
              style={{
                minHeight: '140px',
                border: '1px dashed var(--border-gold)',
                background: 'var(--gold-faint)',
                color: 'var(--gold)',
              }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mb-2">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-medium">新建项目</span>
            </button>

            {/* Project cards */}
            {projects.map((meta) => (
              <ProjectCard
                key={meta.id}
                meta={meta}
                selected={selected.has(meta.id)}
                multiMode={multiMode}
                onOpen={() => handleOpen(meta)}
                onDelete={() => setDeleting(meta.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Multi-select action bar */}
      {multiMode && selected.size > 0 && (
        <div
          className="flex items-center justify-between px-8 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border-gold)', background: 'rgba(201,169,110,0.05)' }}>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            已选 {selected.size} 个项目
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowBulkExport(true) }}
              className="px-4 py-2 rounded text-sm transition-all hover:opacity-80"
              style={{ background: 'var(--gold)', color: '#0e0d15', fontWeight: 500 }}>
              导出备份
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-4 py-2 rounded text-sm transition-all hover:opacity-70"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}

      {unlocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,9,18,0.85)', backdropFilter: 'blur(6px)' }}
          onClick={() => setUnlocking(null)}>
          <div className="w-full max-w-sm p-8 rounded"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl mb-1" style={{ color: 'var(--text-primary)' }}>解锁项目</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>「{unlocking.name}」</p>
            <input
              type="password"
              value={unlockPw}
              onChange={(e) => { setUnlockPw(e.target.value); setUnlockErr('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlockSubmit()}
              placeholder="输入访问密码…"
              className="w-full px-3 py-2.5 rounded text-sm outline-none mb-1"
              style={{ background: 'var(--bg-elevated)', border: `1px solid ${unlockErr ? 'rgba(200,80,80,0.5)' : 'var(--border-subtle)'}`, color: 'var(--text-primary)' }}
              autoFocus
            />
            {unlockErr && <p className="text-xs mb-3" style={{ color: 'rgba(220,80,80,0.8)' }}>{unlockErr}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={handleUnlockSubmit} disabled={!unlockPw.trim()}
                className="flex-1 py-2.5 rounded text-sm font-medium"
                style={{ background: unlockPw.trim() ? 'var(--gold)' : 'var(--bg-elevated)', color: unlockPw.trim() ? '#0e0d15' : 'var(--text-muted)' }}>
                解锁
              </button>
              <button onClick={() => setUnlocking(null)}
                className="px-4 py-2.5 rounded text-sm"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,9,18,0.85)', backdropFilter: 'blur(6px)' }}
          onClick={() => setDeleting(null)}>
          <div className="w-full max-w-sm p-8 rounded"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(200,80,80,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl mb-2" style={{ color: 'var(--text-primary)' }}>删除项目</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              确认删除「{projects.find(p => p.id === deleting)?.name}」？此操作不可撤销。
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleting!)}
                className="flex-1 py-2.5 rounded text-sm font-medium"
                style={{ background: 'rgba(200,60,60,0.15)', color: 'rgba(220,80,80,0.9)', border: '1px solid rgba(200,80,80,0.3)' }}>
                确认删除
              </button>
              <button onClick={() => setDeleting(null)}
                className="px-4 py-2.5 rounded text-sm"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkExport && (
        <BulkExportModal
          projectIds={Array.from(selected)}
          onClose={() => { setShowBulkExport(false); setMultiMode(false); setSelected(new Set()) }}
        />
      )}
    </div>
  )
}

// ── Project card ────────────────────────────────────────────────────────────

function ProjectCard({
  meta, selected, multiMode, onOpen, onDelete,
}: {
  meta: ProjectMeta
  selected: boolean
  multiMode: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const [hovering, setHovering] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(meta.name)
  const { renameProject } = useProjectStore()

  const handleRename = async () => {
    if (newName.trim() && newName !== meta.name) {
      await renameProject(meta.id, newName.trim())
    }
    setRenaming(false)
  }

  const date = new Date(meta.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })

  return (
    <div
      className="rounded relative cursor-pointer transition-all duration-150"
      style={{
        minHeight: '140px',
        background: selected ? '#222038' : hovering ? '#1e1d2c' : 'var(--bg-card)',
        border: `1px solid ${selected ? 'var(--border-gold-active)' : hovering ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
        boxShadow: selected ? '0 0 0 1px rgba(201,169,110,0.15)' : 'none',
        padding: '18px 18px 14px',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onOpen}>
      {/* Multi-select indicator */}
      {multiMode && (
        <div
          className="absolute top-3 right-3 w-5 h-5 rounded flex items-center justify-center"
          style={{
            border: `1.5px solid ${selected ? 'var(--gold)' : 'var(--border-subtle)'}`,
            background: selected ? 'var(--gold)' : 'transparent',
          }}>
          {selected && <span style={{ color: '#0e0d15', fontSize: '11px', fontWeight: 700 }}>✓</span>}
        </div>
      )}

      {/* Lock icon */}
      {meta.passwordHash && (
        <div className="absolute top-3 right-3" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4 5V4a2 2 0 1 1 4 0v1" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
      )}

      {/* Title */}
      {renaming ? (
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-transparent outline-none font-serif text-lg mb-2"
          style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-gold)' }}
          autoFocus
        />
      ) : (
        <h3 className="font-serif text-lg mb-2 pr-6"
          style={{ color: 'var(--text-primary)', lineHeight: 1.3, letterSpacing: '0.02em' }}>
          {meta.name}
        </h3>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 mt-auto pt-2"
        style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '12px' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
          {meta.nodeCount} 节点
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>·</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
          {date}
        </span>
      </div>

      {/* Hover actions */}
      {hovering && !multiMode && (
        <div
          className="absolute bottom-3 right-3 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setRenaming(true)}
            className="w-6 h-6 flex items-center justify-center rounded transition-all hover:opacity-70"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '10px' }}>
            ✎
          </button>
          <button
            onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded transition-all hover:opacity-70"
            style={{ background: 'rgba(200,60,60,0.1)', color: 'rgba(200,80,80,0.6)', fontSize: '10px' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
