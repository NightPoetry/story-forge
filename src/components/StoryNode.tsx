import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { useStore } from '../store'

export interface StoryNodeFlowData {
  nodeId: string
}

function StoryNodeComponent({ data, selected }: NodeProps<StoryNodeFlowData>) {
  const { nodes, continueNode, branchNode, setEditingNode, deleteNode, selectedNodeId } =
    useStore()
  const node = nodes[data.nodeId]
  if (!node) return null

  const isBranch = node.branchType === 'branch'
  const preview = node.storyContent.trim().slice(0, 50) || null
  const isRoot = node.branchType === 'root'

  const borderColor = selected
    ? 'var(--border-gold-active)'
    : isBranch
    ? 'var(--border-slate)'
    : 'var(--border-gold)'

  const handleContinue = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newId = continueNode(data.nodeId)
    setEditingNode(newId)
  }

  const handleBranch = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newId = branchNode(data.nodeId)
    setEditingNode(newId)
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingNode(data.nodeId)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isRoot) deleteNode(data.nodeId)
  }

  const isFresh = Date.now() - node.createdAt < 3000

  return (
    <div
      className={`story-node-wrapper${isFresh ? ' node-spawn' : ''}`}
      style={{ width: 220 }}
      onDoubleClick={handleEdit}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: 'var(--border-gold)',
          border: 'none',
          width: 6,
          height: 6,
          top: -3,
        }}
      />

      {/* Card */}
      <div
        className="rounded transition-all duration-150"
        style={{
          background: selected ? '#222038' : 'var(--bg-card)',
          border: `1px solid ${borderColor}`,
          boxShadow: selected
            ? '0 0 0 1px rgba(201,169,110,0.15), 0 8px 24px rgba(0,0,0,0.4)'
            : '0 2px 12px rgba(0,0,0,0.3)',
          padding: '12px 14px 10px',
        }}>
        {/* Type tag */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-xs"
            style={{
              color: isBranch ? 'var(--slate-light)' : 'var(--gold-dim)',
              letterSpacing: '0.08em',
              fontSize: '10px',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}>
            {node.branchType === 'root'
              ? '根节点'
              : node.branchType === 'branch'
              ? '分支线'
              : '续篇'}
          </span>
          <span
            className="text-xs"
            style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {node.storyContent.length > 0 ? `${node.storyContent.length}字` : '空'}
          </span>
        </div>

        {/* Title */}
        <div
          className="font-serif font-medium truncate"
          style={{
            color: 'var(--text-primary)',
            fontSize: '15px',
            letterSpacing: '0.02em',
            lineHeight: 1.4,
          }}>
          {node.title}
        </div>

        {/* Preview */}
        <div
          className="mt-1.5"
          style={{
            color: 'var(--text-muted)',
            fontSize: '11px',
            fontFamily: '"Cormorant Garamond", serif',
            fontStyle: preview ? 'italic' : 'normal',
            lineHeight: 1.5,
            minHeight: '18px',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
          }}>
          {preview ?? '— 暂无内容 —'}
        </div>

        {/* Actions */}
        <div
          className="node-actions flex items-center gap-1 mt-3 pt-2"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={handleEdit}
            className="flex-1 py-1 rounded text-xs transition-all hover:opacity-80"
            style={{
              background: 'rgba(201,169,110,0.1)',
              color: 'var(--gold)',
              fontSize: '11px',
            }}>
            编辑
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 py-1 rounded text-xs transition-all hover:opacity-80"
            style={{
              background: 'rgba(201,169,110,0.07)',
              color: 'var(--text-muted)',
              fontSize: '11px',
            }}>
            续写
          </button>
          <button
            onClick={handleBranch}
            className="flex-1 py-1 rounded text-xs transition-all hover:opacity-80"
            style={{
              background: 'rgba(58,95,130,0.1)',
              color: '#5080a8',
              fontSize: '11px',
            }}>
            派生
          </button>
          {!isRoot && (
            <button
              onClick={handleDelete}
              className="w-6 h-6 flex items-center justify-center rounded text-xs transition-all hover:opacity-80"
              style={{
                background: 'rgba(180,60,60,0.08)',
                color: 'rgba(200,80,80,0.5)',
                fontSize: '11px',
              }}>
              ✕
            </button>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: 'var(--border-gold)',
          border: 'none',
          width: 6,
          height: 6,
          bottom: -3,
        }}
      />
    </div>
  )
}

export default memo(StoryNodeComponent)
