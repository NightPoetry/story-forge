import { useState } from 'react'
import { useStore } from '../store'
import { ForeshadowingItem, ForwardForeshadowingReport } from '../types'

interface Props {
  nodeId: string
}

export default function ForeshadowingPanel({ nodeId }: Props) {
  const { nodes, addForeshadowing, updateForeshadowing, removeForeshadowing } = useStore()
  const node = nodes[nodeId]
  const [adding, setAdding] = useState(false)
  const [newSecret, setNewSecret] = useState('')
  const [newPlantNote, setNewPlantNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  if (!node) return null

  const foreshadowings = node.foreshadowings ?? []
  const planted = foreshadowings.filter((f) => f.status === 'planted')
  const collected = foreshadowings.filter((f) => f.status === 'collected')

  const handleAdd = () => {
    if (!newSecret.trim()) return
    addForeshadowing(nodeId, newSecret.trim(), newPlantNote.trim())
    setNewSecret('')
    setNewPlantNote('')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium"
            style={{ color: '#b8916a', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
            伏笔设计
          </span>
          {planted.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(180,140,90,0.15)', color: '#b8916a', fontSize: '9px' }}>
              {planted.length} 待回收
            </span>
          )}
          {collected.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(80,160,100,0.1)', color: '#4a9060', fontSize: '9px' }}>
              {collected.length} 已回收
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="text-xs px-2 py-0.5 rounded transition-all"
          style={{ color: '#b8916a', border: '1px solid rgba(180,140,90,0.3)', fontSize: '10px' }}>
          + 添加
        </button>
      </div>

      {/* Forward foreshadowing chronicle */}
      <ForwardForeshadowingSection report={node.forwardForeshadowing} />

      {/* Divider between forward and reverse sections */}
      <div className="flex items-center gap-2 pt-1">
        <div style={{ height: '1px', flex: 1, background: 'rgba(180,140,90,0.15)' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.5, whiteSpace: 'nowrap' }}>逆伏笔设计</span>
        <div style={{ height: '1px', flex: 1, background: 'rgba(180,140,90,0.15)' }} />
      </div>

      {/* Add form */}
      {adding && (
        <div className="p-2 rounded space-y-1.5"
          style={{ background: 'rgba(180,140,90,0.06)', border: '1px dashed rgba(180,140,90,0.25)' }}>
          <textarea
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
            placeholder="隐藏真相（只有作者知道的秘密）…"
            rows={2}
            autoFocus
            className="w-full text-xs resize-none outline-none"
            style={{ background: 'transparent', color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.6, fontSize: '11px' }}
          />
          <textarea
            value={newPlantNote}
            onChange={(e) => setNewPlantNote(e.target.value)}
            placeholder="暗示与误导（可选）：如何暗示真相但让读者往相反方向理解…"
            rows={2}
            className="w-full text-xs resize-none outline-none"
            style={{ background: 'transparent', color: 'var(--text-muted)', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.6, fontSize: '11px' }}
          />
          <div className="flex gap-1.5">
            <button onClick={handleAdd} disabled={!newSecret.trim()}
              className="px-2 py-1 rounded text-xs transition-all"
              style={{ background: newSecret.trim() ? 'rgba(180,140,90,0.2)' : 'transparent', color: newSecret.trim() ? '#b8916a' : 'var(--text-muted)', border: '1px solid rgba(180,140,90,0.3)', fontSize: '10px' }}>
              添加伏笔
            </button>
            <button onClick={() => { setAdding(false); setNewSecret(''); setNewPlantNote('') }}
              className="px-2 py-1 rounded text-xs"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '10px' }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {foreshadowings.length === 0 && !adding && (
        <p className="text-center py-4 text-xs"
          style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: '11px', fontStyle: 'italic' }}>
          暂无伏笔 — 点击「+ 添加」设计隐藏真相
        </p>
      )}

      {/* Planted items */}
      <div className="space-y-1.5">
        {planted.map((f) => (
          <ForeshadowingCard
            key={f.id}
            item={f}
            editingId={editingId}
            setEditingId={setEditingId}
            onUpdate={(id, data) => updateForeshadowing(nodeId, id, data)}
            onRemove={(id) => removeForeshadowing(nodeId, id)}
          />
        ))}
      </div>

      {/* Collected items */}
      {collected.length > 0 && (
        <>
          {planted.length > 0 && (
            <div style={{ height: '1px', background: 'rgba(180,140,90,0.1)', margin: '4px 0' }} />
          )}
          <div className="space-y-1.5">
            {collected.map((f) => (
              <ForeshadowingCard
                key={f.id}
                item={f}
                editingId={editingId}
                setEditingId={setEditingId}
                onUpdate={(id, data) => updateForeshadowing(nodeId, id, data)}
                onRemove={(id) => removeForeshadowing(nodeId, id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ForeshadowingCard({
  item,
  editingId,
  setEditingId,
  onUpdate,
  onRemove,
}: {
  item: ForeshadowingItem
  editingId: string | null
  setEditingId: (id: string | null) => void
  onUpdate: (id: string, data: Partial<ForeshadowingItem>) => void
  onRemove: (id: string) => void
}) {
  const isEditing = editingId === item.id
  const isCollected = item.status === 'collected'
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded px-2.5 py-2"
      style={{
        background: isCollected ? 'rgba(80,160,100,0.05)' : 'rgba(180,140,90,0.05)',
        border: `1px solid ${isCollected ? 'rgba(80,160,100,0.2)' : 'rgba(180,140,90,0.2)'}`,
      }}>
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          {isCollected ? (
            <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(80,160,100,0.2)' }}>
              <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                <path d="M1 3.5L2.8 5.5L6 1.5" stroke="#4a9060" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ) : (
            <div className="w-3.5 h-3.5 rounded-full"
              style={{ background: 'rgba(180,140,90,0.2)', border: '1px solid rgba(180,140,90,0.4)' }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium"
              style={{ color: isCollected ? '#4a9060' : '#b8916a', fontFamily: 'monospace', fontSize: '10px' }}>
              {item.id}
            </span>
            {isCollected && (
              <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
                · 已回收
              </span>
            )}
            <button onClick={() => setExpanded((e) => !e)}
              className="ml-auto text-xs"
              style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.6 }}>
              {expanded ? '收起' : '展开'}
            </button>
          </div>

          {isEditing ? (
            <div className="space-y-1.5">
              <textarea
                defaultValue={item.secret}
                onBlur={(e) => onUpdate(item.id, { secret: e.target.value })}
                rows={2}
                className="w-full text-xs resize-none outline-none"
                style={{ background: 'rgba(180,140,90,0.05)', border: '1px solid rgba(180,140,90,0.2)', borderRadius: '3px', padding: '4px 6px', color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', lineHeight: 1.6 }}
              />
              <textarea
                defaultValue={item.plantNote}
                onBlur={(e) => onUpdate(item.id, { plantNote: e.target.value })}
                placeholder="暗示与误导方式…"
                rows={2}
                className="w-full text-xs resize-none outline-none"
                style={{ background: 'rgba(180,140,90,0.05)', border: '1px solid rgba(180,140,90,0.1)', borderRadius: '3px', padding: '4px 6px', color: 'var(--text-muted)', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', lineHeight: 1.6 }}
              />
              <button onClick={() => setEditingId(null)}
                className="text-xs px-2 py-0.5 rounded"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '10px' }}>
                完成
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs"
                style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.6, opacity: isCollected ? 0.7 : 1, textDecoration: isCollected ? 'line-through' : 'none' }}>
                {item.secret}
              </p>
              {expanded && (
                <div className="mt-1.5 space-y-1">
                  {item.plantNote && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                      <span style={{ color: '#b8916a', opacity: 0.7 }}>暗示与误导：</span>{item.plantNote}
                    </p>
                  )}
                  {isCollected && item.revealNote && (
                    <p className="text-xs" style={{ color: '#4a9060', fontSize: '10px', lineHeight: 1.5, opacity: 0.8 }}>
                      揭示：{item.revealNote}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!isEditing && !isCollected && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setEditingId(item.id)}
              className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-80 transition-all"
              style={{ color: '#b8916a' }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1 7.5l1.5-1.5L6 2.5l1 1-3.5 3.5L2 8.5l-1-1zm5-5.5l1 1-.5.5-1-1 .5-.5z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </button>
            <button onClick={() => onRemove(item.id)}
              className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-30 hover:opacity-70 transition-all"
              style={{ color: 'rgba(200,80,80,0.8)' }}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Forward foreshadowing chronicle ──────────────────────────────────────────

function ForwardForeshadowingSection({ report }: { report?: ForwardForeshadowingReport }) {
  const [showCandidates, setShowCandidates] = useState(false)
  const hasUsed = report && report.used.length > 0
  const hasCandidates = report && report.candidates.length > 0

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium"
        style={{ color: '#6aa0c8', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
        正伏笔小传
      </span>

      {/* Used forward foreshadowings */}
      {hasUsed ? (
        <div className="space-y-1">
          {report.used.map((item, i) => (
            <div key={i} className="rounded px-2.5 py-2"
              style={{ background: 'rgba(100,160,200,0.06)', border: '1px solid rgba(100,160,200,0.15)' }}>
              <p className="text-xs" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.6 }}>
                {item.detail}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                <span style={{ color: '#6aa0c8', opacity: 0.7 }}>出处：</span>{item.source}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                <span style={{ color: '#6aa0c8', opacity: 0.7 }}>作用：</span>{item.usage}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.5, fontStyle: 'italic' }}>
          无 — AI 写作时会自动从上文中寻找可用细节
        </p>
      )}

      {/* Candidate forward foreshadowings */}
      {hasCandidates && (
        <div>
          <button
            onClick={() => setShowCandidates((v) => !v)}
            className="flex items-center gap-1.5 text-xs transition-all hover:opacity-80"
            style={{ color: '#6aa0c8', fontSize: '10px', opacity: 0.8 }}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
              style={{ transform: showCandidates ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M2 1l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            待选素材 ({report!.candidates.length})
          </button>
          {showCandidates && (
            <div className="space-y-1 mt-1">
              {report!.candidates.map((item, i) => (
                <div key={i} className="rounded px-2.5 py-2"
                  style={{ background: 'rgba(100,160,200,0.03)', border: '1px dashed rgba(100,160,200,0.15)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.6, opacity: 0.8 }}>
                    {item.detail}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                    <span style={{ color: '#6aa0c8', opacity: 0.5 }}>出处：</span>{item.source}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                    <span style={{ color: '#6aa0c8', opacity: 0.5 }}>可用于：</span>{item.potential}
                  </p>
                </div>
              ))}
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: 0.5 }}>
                在对话中提及这些细节，AI 会将其编入剧情
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
