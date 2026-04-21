import { useEffect, useState } from 'react'
import { useStore } from '../store'
import StoryPanel from './StoryPanel'
import ChatPanel from './ChatPanel'

interface Props {
  nodeId: string
}

export default function NodeEditor({ nodeId }: Props) {
  const { setEditingNode } = useStore()
  const [isStreaming, setIsStreaming] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingNode(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setEditingNode])

  return (
    <div
      className="fixed inset-0 z-20 overlay-enter"
      style={{ background: 'rgba(10,9,18,0.6)', backdropFilter: 'blur(3px)' }}>
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col"
        style={{
          top: '48px',
          background: '#13111e',
          borderTop: '1px solid var(--border-gold)',
          boxShadow: '0 -24px 80px rgba(0,0,0,0.7)',
        }}>
        {/* Split panels — full height, no internal toolbar */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden" style={{ minWidth: 0 }}>
            <StoryPanel nodeId={nodeId} isStreaming={isStreaming} />
          </div>
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{ width: 'min(360px, 45vw)', minWidth: '260px' }}>
            <ChatPanel nodeId={nodeId} onStreamingChange={setIsStreaming} />
          </div>
        </div>
      </div>
    </div>
  )
}
