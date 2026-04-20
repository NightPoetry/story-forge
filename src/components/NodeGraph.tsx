import { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Node as RFNode,
  Edge as RFEdge,
  useNodesState,
  useEdgesState,
  NodeMouseHandler,
  ConnectionLineType,
} from 'reactflow'
import dagre from '@dagrejs/dagre'
import { useStore } from '../store'
import StoryNodeComponent, { StoryNodeFlowData } from './StoryNode'

const NODE_WIDTH = 220
const NODE_HEIGHT = 120

const nodeTypes = { storyNode: StoryNodeComponent }

function buildLayout(
  rfNodes: RFNode[],
  rfEdges: RFEdge[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })

  rfNodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  rfEdges.forEach((e) => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return {
    nodes: rfNodes.map((n) => {
      const pos = g.node(n.id)
      return {
        ...n,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
      }
    }),
    edges: rfEdges,
  }
}

export default function NodeGraph() {
  const { nodes: storeNodes, selectedNodeId, setSelectedNode, setEditingNode, rootNodeId } =
    useStore()

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<StoryNodeFlowData>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    const nodeList = Object.values(storeNodes)
    if (nodeList.length === 0) return

    const newRfNodes: RFNode<StoryNodeFlowData>[] = nodeList.map((n) => ({
      id: n.id,
      type: 'storyNode',
      position: { x: 0, y: 0 },
      data: { nodeId: n.id },
      selected: n.id === selectedNodeId,
      draggable: true,
    }))

    const newRfEdges: RFEdge[] = nodeList
      .filter((n) => n.parentId)
      .map((n) => ({
        id: `e_${n.parentId}_${n.id}`,
        source: n.parentId!,
        target: n.id,
        type: 'smoothstep',
        className: n.branchType === 'branch' ? 'branch-edge' : '',
        style: {
          stroke:
            n.branchType === 'branch'
              ? 'rgba(58,95,130,0.5)'
              : 'rgba(201,169,110,0.3)',
          strokeWidth: 1.5,
          strokeDasharray: n.branchType === 'branch' ? '6 4' : undefined,
        },
        animated: false,
      }))

    const { nodes: laid, edges: laidEdges } = buildLayout(newRfNodes, newRfEdges)
    setRfNodes(laid)
    setRfEdges(laidEdges)
  }, [storeNodes, selectedNodeId])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode],
  )

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      setEditingNode(node.id)
    },
    [setEditingNode],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  if (!rootNodeId) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>初始化中…</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}>
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(201,169,110,0.06)"
        />
        <Controls
          showInteractive={false}
          style={{ bottom: 20, left: 20, top: 'auto' }}
        />
      </ReactFlow>
    </div>
  )
}
