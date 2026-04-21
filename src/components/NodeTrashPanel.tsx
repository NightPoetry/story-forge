import { useStore } from '../store'

interface Props {
  onClose: () => void
}

export default function NodeTrashPanel({ onClose }: Props) {
  const { trashedNodes, restoreNodeGroup, permanentDeleteNodeGroup } = useStore()

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center"
      style={{ background: 'rgba(10,9,18,0.7)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}>
      <div
        className="w-full flex flex-col rounded"
        style={{
          maxWidth: 'min(480px, calc(100vw - 48px))',
          maxHeight: 'min(60vh, calc(100vh - 120px))',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.5 }}>
              <path d="M2 3h8M4.5 3V2h3v1M3 3l.5 7h5l.5-7" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              节点回收站
            </h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              ({trashedNodes.length})
            </span>
          </div>
          <button onClick={onClose} className="hover:opacity-70"
            style={{ color: 'var(--text-muted)', fontSize: '14px' }}>✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {trashedNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12"
              style={{ color: 'var(--text-muted)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mb-3" style={{ opacity: 0.3 }}>
                <path d="M4 6h16M8 6V5h8v1M5 6l1 14h12l1-14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ fontSize: '12px', opacity: 0.6 }}>回收站是空的</p>
              <p style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>删除的节点会出现在这里</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {trashedNodes.map((group) => {
                const nodeCount = Object.keys(group.nodes).length
                const ago = formatTimeAgo(group.deletedAt)
                return (
                  <div
                    key={group.id}
                    className="flex items-center gap-3 rounded px-3 py-2.5"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {group.title}
                      </p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px' }}>
                        {nodeCount > 1 ? `${nodeCount} 个节点 · ` : ''}{ago}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => restoreNodeGroup(group.id)}
                        className="px-2.5 py-1 rounded text-xs transition-all hover:opacity-80"
                        style={{
                          color: 'rgba(80,160,80,0.9)',
                          border: '1px solid rgba(80,160,80,0.3)',
                          fontSize: '10px',
                        }}>
                        恢复
                      </button>
                      <button
                        onClick={() => permanentDeleteNodeGroup(group.id)}
                        className="px-2.5 py-1 rounded text-xs transition-all hover:opacity-80"
                        style={{
                          color: 'rgba(200,80,80,0.6)',
                          border: '1px solid rgba(200,80,80,0.2)',
                          fontSize: '10px',
                        }}>
                        彻底删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {trashedNodes.length > 0 && (
          <div className="flex-shrink-0 px-5 py-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.5 }}>
              恢复后节点将重新挂载到原始父节点下（若父节点已删除则挂载到根节点）
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}
