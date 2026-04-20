import { useState } from 'react'
import { useStore } from '../store'
import { useProjectStore } from '../projectStore'

interface Props {
  nodeId: string
  onClose: () => void
}

type ExportFmt = 'txt' | 'md'

export default function ExportModal({ nodeId, onClose }: Props) {
  const { nodes, getAncestorChain, getProjectSnapshot } = useStore()
  const { currentProjectId, projects, exportProjectBackup, exportStoryChain, exportSingleNode } = useProjectStore()
  const node = nodes[nodeId]
  const projectMeta = projects.find((p) => p.id === currentProjectId)

  const [storyFmt, setStoryFmt] = useState<ExportFmt>('txt')
  const [nodeFmt, setNodeFmt] = useState<ExportFmt>('txt')
  const [exporting, setExporting] = useState<string | null>(null)

  if (!node || !projectMeta) return null

  const ancestors = getAncestorChain(nodeId)
  const chain = [...ancestors, node]
  const projectName = projectMeta.name

  const handle = async (type: string, fn: () => Promise<void>) => {
    setExporting(type)
    try { await fn() } finally { setExporting(null) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,9,18,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div
        className="w-full max-w-md rounded"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-gold)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="font-serif text-xl" style={{ color: 'var(--text-primary)' }}>导出故事</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            当前节点：{node.title} · 故事链 {chain.length} 节
          </p>
        </div>

        <div className="px-6 py-5 space-y-3">
          {/* Option 1: Complete chain */}
          <ExportOption
            icon="📖"
            title="完整故事链"
            desc={`从「${chain[0].title}」到「${node.title}」，${chain.length} 个节点合并为完整故事`}
            fmt={storyFmt}
            onFmtChange={setStoryFmt}
            loading={exporting === 'chain'}
            onExport={() => handle('chain', () => exportStoryChain(chain, projectName, storyFmt))}
          />

          {/* Option 2: Current node only */}
          <ExportOption
            icon="📄"
            title="仅当前节点"
            desc={`仅导出「${node.title}」的内容，${node.storyContent.replace(/\s/g, '').length} 字`}
            fmt={nodeFmt}
            onFmtChange={setNodeFmt}
            loading={exporting === 'node'}
            onExport={() => handle('node', () => exportSingleNode(node, projectName, nodeFmt))}
          />

          {/* Option 3: Project backup */}
          <div
            className="rounded p-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: '14px' }}>💾</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>项目备份</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  导出完整项目数据（JSON），可在另一台设备导入还原
                </p>
              </div>
              <button
                onClick={() => {
                  const snap = getProjectSnapshot()
                  handle('backup', () => exportProjectBackup(currentProjectId!, snap.nodes, snap.rootNodeId))
                }}
                disabled={exporting === 'backup'}
                className="flex-shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-all"
                style={{
                  background: exporting === 'backup' ? 'var(--bg-card)' : 'var(--gold)',
                  color: exporting === 'backup' ? 'var(--text-muted)' : '#0e0d15',
                }}>
                {exporting === 'backup' ? '导出中…' : '导出'}
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded text-sm hover:opacity-70 transition-all"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function ExportOption({
  icon, title, desc, fmt, onFmtChange, loading, onExport,
}: {
  icon: string
  title: string
  desc: string
  fmt: ExportFmt
  onFmtChange: (f: ExportFmt) => void
  loading: boolean
  onExport: () => void
}) {
  return (
    <div className="rounded p-4"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: '14px' }}>{icon}</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
          <div className="flex items-center gap-1">
            {(['txt', 'md'] as ExportFmt[]).map((f) => (
              <button
                key={f}
                onClick={() => onFmtChange(f)}
                className="px-2 py-0.5 rounded text-xs transition-all"
                style={{
                  background: fmt === f ? 'rgba(201,169,110,0.15)' : 'transparent',
                  color: fmt === f ? 'var(--gold)' : 'var(--text-muted)',
                  border: `1px solid ${fmt === f ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                  fontSize: '10px',
                  fontFamily: 'monospace',
                }}>
                .{f}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onExport}
          disabled={loading}
          className="flex-shrink-0 self-center px-3 py-1.5 rounded text-xs font-medium transition-all"
          style={{
            background: loading ? 'var(--bg-card)' : 'var(--gold)',
            color: loading ? 'var(--text-muted)' : '#0e0d15',
          }}>
          {loading ? '导出中…' : '导出'}
        </button>
      </div>
    </div>
  )
}
