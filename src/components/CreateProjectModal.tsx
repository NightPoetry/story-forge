import { useState } from 'react'
import { useProjectStore } from '../projectStore'
import { useStore } from '../store'

interface Props {
  onClose: () => void
}

export default function CreateProjectModal({ onClose }: Props) {
  const { createProject, openProject } = useProjectStore()
  const { resetWithProjectData, initRootNode } = useStore()
  const [name, setName] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [pw, setPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const valid = name.trim() && (!usePassword || (pw.length >= 4 && pw === pwConfirm))

  const handleCreate = async () => {
    if (!valid || creating) return
    if (usePassword && pw !== pwConfirm) {
      setError('两次密码输入不一致')
      return
    }
    setCreating(true)
    const id = await createProject(name.trim(), usePassword ? pw : undefined)
    await openProject(id)
    resetWithProjectData({}, null)
    initRootNode()
    setCreating(false)
    onClose()
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
        }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="font-serif text-xl" style={{ color: 'var(--text-primary)' }}>新建故事项目</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>项目是一棵完整的故事节点树</p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
              项目名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="例如：深夜咖啡馆、侦探林默…"
              className="w-full px-3 py-2.5 rounded text-sm outline-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: '"Cormorant Garamond", serif',
                fontSize: '15px',
              }}
              autoFocus
            />
          </div>

          {/* Password toggle */}
          <div>
            <button
              onClick={() => { setUsePassword((v) => !v); setPw(''); setPwConfirm(''); setError('') }}
              className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
              style={{ color: usePassword ? 'var(--gold)' : 'var(--text-muted)' }}>
              <div
                className="w-9 h-5 rounded-full relative transition-all"
                style={{ background: usePassword ? 'rgba(201,169,110,0.3)' : 'var(--bg-elevated)', border: `1px solid ${usePassword ? 'var(--gold)' : 'var(--border-subtle)'}` }}>
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{ background: usePassword ? 'var(--gold)' : 'var(--text-muted)', left: usePassword ? '18px' : '2px', opacity: usePassword ? 1 : 0.5 }}
                />
              </div>
              设置访问密码
            </button>
          </div>

          {/* Password fields */}
          {usePassword && (
            <div className="space-y-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  密码（至少4位）
                </label>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setError('') }}
                  placeholder="••••••"
                  className="w-full px-3 py-2.5 rounded text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  确认密码
                </label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => { setPwConfirm(e.target.value); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="••••••"
                  className="w-full px-3 py-2.5 rounded text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${pwConfirm && pw !== pwConfirm ? 'rgba(200,80,80,0.5)' : 'var(--border-subtle)'}`,
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              {error && <p className="text-xs" style={{ color: 'rgba(220,80,80,0.8)' }}>{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={handleCreate}
            disabled={!valid || creating}
            className="flex-1 py-2.5 rounded text-sm font-medium transition-all"
            style={{
              background: valid && !creating ? 'var(--gold)' : 'var(--bg-elevated)',
              color: valid && !creating ? '#0e0d15' : 'var(--text-muted)',
            }}>
            {creating ? '创建中…' : '创建项目'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded text-sm transition-all hover:opacity-70"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
