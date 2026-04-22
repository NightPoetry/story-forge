import { useStore } from '../store'

interface Props {
  nodeId: string
}

export default function StateCard({ nodeId }: Props) {
  const { nodes, updateStateCard } = useStore()
  const node = nodes[nodeId]

  if (!node) return null

  return (
    <div className="flex flex-col h-full">
      <textarea
        value={node.stateCard.content}
        onChange={(e) =>
          updateStateCard(nodeId, {
            content: e.target.value,
            lastUpdated: Date.now(),
          })
        }
        placeholder="当前人物状态、世界状态、关键情节节点…&#10;&#10;AI 写作时会自动更新此卡片，也可手动编辑。"
        className="flex-1 text-xs resize-none outline-none"
        style={{
          background: 'rgba(58,95,130,0.04)',
          border: '1px solid rgba(58,95,130,0.15)',
          borderRadius: '6px',
          padding: '10px 12px',
          color: 'var(--text-primary)',
          fontFamily: '"DM Sans", sans-serif',
          lineHeight: '1.7',
          fontSize: '12px',
        }}
        spellCheck={false}
      />
    </div>
  )
}
