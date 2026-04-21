import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiFormat, BranchType, ChatMessage, ForeshadowingItem, FullProjectData, StateCardData, StoryNodeData } from './types'
import { genId } from './api'

function makeNode(
  parentId: string | null,
  branchType: BranchType,
  inherit?: StoryNodeData,
): StoryNodeData {
  const defaultTitles: Record<BranchType, string> = {
    root: '开篇', continue: '续篇', branch: '分支线',
  }
  return {
    id: genId(),
    title: defaultTitles[branchType],
    storyContent: branchType === 'branch' && inherit ? inherit.storyContent : '',
    chatHistory: branchType === 'branch' && inherit ? [...inherit.chatHistory] : [],
    stateCard: inherit ? { ...inherit.stateCard } : { content: '', lastUpdated: Date.now() },
    parentId,
    branchType,
    createdAt: Date.now(),
    targetWordCount: inherit?.targetWordCount,
    foreshadowings: inherit ? inherit.foreshadowings.map((f) => ({ ...f })) : [],
    foreshadowingCounter: inherit ? inherit.foreshadowingCounter : 0,
  }
}

interface AppStore {
  // Story data (NOT persisted — loaded from project files)
  nodes: Record<string, StoryNodeData>
  rootNodeId: string | null
  selectedNodeId: string | null
  editingNodeId: string | null
  isGenerating: boolean
  projectWritingGuide: string
  writingGuideChatHistory: ChatMessage[]

  // Settings (persisted in localStorage)
  globalSettings: string
  apiKey: string
  apiUrl: string
  apiFormat: ApiFormat
  apiModel: string
  isGlobalSettingsOpen: boolean

  // Editor typography settings (persisted)
  editorFontSize: number
  editorLineHeight: number
  editorLetterSpacing: number

  // Story actions
  resetWithProjectData: (nodes: Record<string, StoryNodeData>, rootNodeId: string | null, writingGuide?: string, writingGuideChatHistory?: ChatMessage[]) => void
  initRootNode: () => void
  continueNode: (nodeId: string) => string
  branchNode: (nodeId: string) => string
  deleteNode: (nodeId: string) => void
  updateNodeTitle: (nodeId: string, title: string) => void
  updateStoryContent: (nodeId: string, content: string) => void
  updateTargetWordCount: (nodeId: string, count: number | undefined) => void
  addChatMessage: (nodeId: string, msg: ChatMessage) => void
  updateStateCard: (nodeId: string, data: Partial<StateCardData>) => void
  setSelectedNode: (id: string | null) => void
  setEditingNode: (id: string | null) => void

  // Foreshadowing actions (per-node)
  addForeshadowing: (nodeId: string, secret: string, plantNote: string) => string
  updateForeshadowing: (nodeId: string, id: string, data: Partial<ForeshadowingItem>) => void
  collectForeshadowing: (nodeId: string, id: string, revealNote: string) => void
  removeForeshadowing: (nodeId: string, id: string) => void

  // Settings actions
  setGlobalSettings: (content: string) => void
  setProjectWritingGuide: (content: string) => void
  addWritingGuideChatMessage: (msg: ChatMessage) => void
  setWritingGuideChatHistory: (msgs: ChatMessage[]) => void
  setApiKey: (key: string) => void
  setApiUrl: (url: string) => void
  setApiFormat: (fmt: ApiFormat) => void
  setApiModel: (model: string) => void
  setIsGlobalSettingsOpen: (open: boolean) => void
  setIsGenerating: (v: boolean) => void
  setEditorFontSize: (v: number) => void
  setEditorLineHeight: (v: number) => void
  setEditorLetterSpacing: (v: number) => void

  // Helpers
  getAncestorChain: (nodeId: string) => StoryNodeData[]
  getChildren: (nodeId: string) => StoryNodeData[]
  getProjectSnapshot: () => Pick<FullProjectData, 'nodes' | 'rootNodeId' | 'writingGuide' | 'writingGuideChatHistory'>
}

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Story state defaults (ephemeral)
      nodes: {},
      rootNodeId: null,
      selectedNodeId: null,
      editingNodeId: null,
      isGenerating: false,
      projectWritingGuide: '',
      writingGuideChatHistory: [],

      // Settings defaults (persisted)
      globalSettings: '',
      apiKey: '',
      apiUrl: 'https://api.anthropic.com',
      apiFormat: 'anthropic',
      apiModel: 'claude-sonnet-4-6',
      isGlobalSettingsOpen: false,

      // Editor typography defaults
      editorFontSize: 18,
      editorLineHeight: 1.9,
      editorLetterSpacing: 0.01,

      resetWithProjectData: (nodes, rootNodeId, writingGuide = '', writingGuideChatHistory = []) =>
        set({ nodes, rootNodeId, selectedNodeId: rootNodeId, editingNodeId: null, isGenerating: false, projectWritingGuide: writingGuide, writingGuideChatHistory }),

      initRootNode: () => {
        if (get().rootNodeId && get().nodes[get().rootNodeId!]) return
        const root = makeNode(null, 'root')
        set({ nodes: { [root.id]: root }, rootNodeId: root.id, selectedNodeId: root.id })
      },

      continueNode: (nodeId) => {
        const parent = get().nodes[nodeId]
        if (!parent) return nodeId
        const child = makeNode(nodeId, 'continue', { ...parent, storyContent: '', chatHistory: [] })
        set((s) => ({ nodes: { ...s.nodes, [child.id]: child }, selectedNodeId: child.id }))
        return child.id
      },

      branchNode: (nodeId) => {
        const parent = get().nodes[nodeId]
        if (!parent) return nodeId
        const child = makeNode(nodeId, 'branch', parent)
        set((s) => ({ nodes: { ...s.nodes, [child.id]: child }, selectedNodeId: child.id }))
        return child.id
      },

      deleteNode: (nodeId) => {
        if (nodeId === get().rootNodeId) return
        const allNodes = get().nodes
        const toDelete = new Set<string>()
        const collect = (id: string) => {
          toDelete.add(id)
          Object.values(allNodes).filter((n) => n.parentId === id).forEach((n) => collect(n.id))
        }
        collect(nodeId)
        const newNodes = { ...allNodes }
        toDelete.forEach((id) => delete newNodes[id])
        set((s) => ({
          nodes: newNodes,
          selectedNodeId: s.selectedNodeId && toDelete.has(s.selectedNodeId) ? get().rootNodeId : s.selectedNodeId,
          editingNodeId: s.editingNodeId && toDelete.has(s.editingNodeId) ? null : s.editingNodeId,
        }))
      },

      updateNodeTitle: (nodeId, title) =>
        set((s) => ({ nodes: { ...s.nodes, [nodeId]: { ...s.nodes[nodeId], title } } })),

      updateStoryContent: (nodeId, content) =>
        set((s) => ({ nodes: { ...s.nodes, [nodeId]: { ...s.nodes[nodeId], storyContent: content } } })),

      updateTargetWordCount: (nodeId, count) =>
        set((s) => ({ nodes: { ...s.nodes, [nodeId]: { ...s.nodes[nodeId], targetWordCount: count } } })),

      addChatMessage: (nodeId, msg) =>
        set((s) => ({
          nodes: {
            ...s.nodes,
            [nodeId]: { ...s.nodes[nodeId], chatHistory: [...s.nodes[nodeId].chatHistory, msg] },
          },
        })),

      updateStateCard: (nodeId, data) =>
        set((s) => ({
          nodes: {
            ...s.nodes,
            [nodeId]: { ...s.nodes[nodeId], stateCard: { ...s.nodes[nodeId].stateCard, ...data } },
          },
        })),

      setSelectedNode: (id) => set({ selectedNodeId: id }),
      setEditingNode: (id) => set({ editingNodeId: id }),

      addForeshadowing: (nodeId, secret, plantNote) => {
        const node = get().nodes[nodeId]
        if (!node) return ''
        const counter = node.foreshadowingCounter + 1
        const item: ForeshadowingItem = {
          id: `F${counter}`, secret, plantNote, status: 'planted', createdAt: Date.now(),
        }
        set((s) => ({
          nodes: {
            ...s.nodes,
            [nodeId]: {
              ...s.nodes[nodeId],
              foreshadowings: [...s.nodes[nodeId].foreshadowings, item],
              foreshadowingCounter: counter,
            },
          },
        }))
        return item.id
      },

      updateForeshadowing: (nodeId, id, data) =>
        set((s) => ({
          nodes: {
            ...s.nodes,
            [nodeId]: {
              ...s.nodes[nodeId],
              foreshadowings: s.nodes[nodeId].foreshadowings.map((f) => f.id === id ? { ...f, ...data } : f),
            },
          },
        })),

      collectForeshadowing: (nodeId, id, revealNote) =>
        set((s) => ({
          nodes: {
            ...s.nodes,
            [nodeId]: {
              ...s.nodes[nodeId],
              foreshadowings: s.nodes[nodeId].foreshadowings.map((f) =>
                f.id === id ? { ...f, status: 'collected', collectedAt: Date.now(), revealNote } : f,
              ),
            },
          },
        })),

      removeForeshadowing: (nodeId, id) =>
        set((s) => ({
          nodes: {
            ...s.nodes,
            [nodeId]: {
              ...s.nodes[nodeId],
              foreshadowings: s.nodes[nodeId].foreshadowings.filter((f) => f.id !== id),
            },
          },
        })),

      setGlobalSettings: (content) => set({ globalSettings: content }),
      setProjectWritingGuide: (content) => set({ projectWritingGuide: content }),
      addWritingGuideChatMessage: (msg) =>
        set((s) => ({ writingGuideChatHistory: [...s.writingGuideChatHistory, msg] })),
      setWritingGuideChatHistory: (msgs) => set({ writingGuideChatHistory: msgs }),
      setApiKey: (key) => set({ apiKey: key }),
      setApiUrl: (url) => set({ apiUrl: url }),
      setApiFormat: (fmt) => set({ apiFormat: fmt }),
      setApiModel: (model) => set({ apiModel: model }),
      setIsGlobalSettingsOpen: (open) => set({ isGlobalSettingsOpen: open }),
      setIsGenerating: (v) => set({ isGenerating: v }),
      setEditorFontSize: (v) => set({ editorFontSize: v }),
      setEditorLineHeight: (v) => set({ editorLineHeight: v }),
      setEditorLetterSpacing: (v) => set({ editorLetterSpacing: v }),

      getAncestorChain: (nodeId) => {
        const nodes = get().nodes
        const chain: StoryNodeData[] = []
        let current = nodes[nodeId]
        while (current?.parentId) {
          const parent = nodes[current.parentId]
          if (!parent) break
          chain.unshift(parent)
          current = parent
        }
        return chain
      },

      getChildren: (nodeId) => Object.values(get().nodes).filter((n) => n.parentId === nodeId),

      getProjectSnapshot: () => ({
        nodes: get().nodes,
        rootNodeId: get().rootNodeId,
        writingGuide: get().projectWritingGuide,
        writingGuideChatHistory: get().writingGuideChatHistory,
      }),
    }),
    {
      name: 'nf-settings',
      // Persist ONLY settings — story data is managed via project files
      partialize: (s) => ({
        globalSettings: s.globalSettings,
        apiKey: s.apiKey,
        apiUrl: s.apiUrl,
        apiFormat: s.apiFormat,
        apiModel: s.apiModel,
        editorFontSize: s.editorFontSize,
        editorLineHeight: s.editorLineHeight,
        editorLetterSpacing: s.editorLetterSpacing,
      }),
    },
  ),
)
