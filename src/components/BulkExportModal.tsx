import { useState } from 'react'
import { useProjectStore } from '../projectStore'
import { verifyPassword } from '../storage'

interface Props {
  projectIds: string[]
  onClose: () => void
}

export default function BulkExportModal({ projectIds, onClose }: Props) {
  const { projects, exportMultipleBackup } = useProjectStore()

  const lockedProjects = projects.filter(
    (p) => projectIds.includes(p.id) && p.passwordHash,
  )
  const unlockedProjects = projects.filter(
    (p) => projectIds.includes(p.id) && !p.passwordHash,
  )

  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    const newErrors: Record<string, string> = {}

    // Verify passwords
    for (const p of lockedProjects) {
      const pw = passwords[p.id] ?? ''
      if (!pw) { newErrors[p.id] = '请输入密码'; continue }
      const ok = await verifyPassword(pw, p.passwordHash!)
      if (!ok) newErrors[p.id] = '密码错误'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setExporting(false)
      return
    }

    await exportMultipleBackup(projectIds, passwords)
    setExporting(false)
    setDone(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,9,18,0.88)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div
        className="w-full max-w-md rounded"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-gold)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="font-serif text-xl" style={{ color: 'var(--text-primary)' }}>导出备份</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {projectIds.length} 个项目 · 导出为单个 JSON 文件
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Locked projects requiring passwords */}
          {lockedProjects.length > 0 && (
            <div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                以下项目有访问密码，需要逐一确认：
              </p>
              <div className="space-y-3">
                {lockedProjects.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M4 5V4a2 2 0 1 1 4 0v1" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>「{p.name}」</span>
                    </div>
                    <input
                      type="password"
                      value={passwords[p.id] ?? ''}
                      onChange={(e) => {
                        setPasswords((prev) => ({ ...prev, [p.id]: e.target.value }))
                        setErrors((prev) => { const n = { ...prev }; delete n[p.id]; return n })
                      }}
                      placeholder="访问密码"
                      className="w-full px-3 py-2 rounded text-sm outline-none"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: `1px solid ${errors[p.id] ? 'rgba(200,80,80,0.5)' : 'var(--border-subtle)'}`,
                        color: 'var(--text-primary)',
                      }}
                    />
                    {errors[p.id] && (
                      <p className="text-xs mt-1" style={{ color: 'rgba(220,80,80,0.8)' }}>{errors[p.id]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unlocked projects */}
          {unlockedProjects.length > 0 && (
            <div>
              {lockedProjects.length > 0 && (
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>以下项目无需密码：</p>
              )}
              <div className="space-y-1.5">
                {unlockedProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm"
                    style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                    <span style={{ color: 'var(--gold-dim)', fontSize: '11px' }}>✓</span>
                    「{p.name}」
                  </div>
                ))}
              </div>
            </div>
          )}

          {done && (
            <p className="text-sm text-center" style={{ color: 'var(--gold)' }}>导出完成 ✓</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={handleExport}
            disabled={exporting || done}
            className="flex-1 py-2.5 rounded text-sm font-medium transition-all"
            style={{
              background: exporting || done ? 'var(--bg-elevated)' : 'var(--gold)',
              color: exporting || done ? 'var(--text-muted)' : '#0e0d15',
            }}>
            {exporting ? '导出中…' : done ? '已完成' : '确认导出'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded text-sm hover:opacity-70 transition-all"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
