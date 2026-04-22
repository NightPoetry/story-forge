export type BranchType = 'root' | 'continue' | 'branch'
export type ApiFormat = 'anthropic' | 'openai'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface StateCardData {
  content: string
  lastUpdated: number
}

// ── Foreshadowing ─────────────────────────────────────────────────────────

export interface ForeshadowingItem {
  id: string            // Readable ID like "F1", "F2"
  secret: string        // The actual truth / what will be revealed
  plantNote: string     // Optional: how to hint at it subtly
  status: 'planted' | 'collected'
  createdAt: number
  collectedAt?: number
  revealNote?: string   // How it was revealed in the story
}

export interface TrashedNodeGroup {
  id: string
  nodes: Record<string, StoryNodeData>
  rootId: string
  originalParentId: string | null
  deletedAt: number
  title: string
}

export interface StoryNodeData {
  id: string
  title: string
  storyContent: string
  chatHistory: ChatMessage[]
  stateCard: StateCardData
  parentId: string | null
  branchType: BranchType
  createdAt: number
  targetWordCount?: number
  foreshadowings: ForeshadowingItem[]
  foreshadowingCounter: number
}

// ── Project types ──────────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string
  name: string
  passwordHash: string | null  // SHA-256 hex; null = no password
  createdAt: number
  updatedAt: number
  nodeCount: number
  deletedAt?: number
}

export interface FullProjectData {
  id: string
  name: string
  passwordHash: string | null
  nodes: Record<string, StoryNodeData>
  rootNodeId: string | null
  writingGuide: string
  writingGuideChatHistory?: ChatMessage[]
  trashedNodes?: TrashedNodeGroup[]
  // Legacy fields kept for reading old saves
  foreshadowings?: ForeshadowingItem[]
  foreshadowingCounter?: number
  createdAt: number
  updatedAt: number
}

// ── API Check ─────────────────────────────────────────────────────────────

export type ToolStreamMode = 'streaming' | 'complete' | 'none'

export interface ApiCheckResult {
  ok: boolean
  connectivity: { ok: boolean; message: string }
  chat: { ok: boolean; message: string }
  toolUse: { ok: boolean; message: string }
  streaming: { ok: boolean; message: string }
  toolStreamMode?: ToolStreamMode
}

export interface SingleBackupFile {
  type: 'narrative-forge-project'
  version: 1
  exportedAt: number
  project: FullProjectData
}

export interface MultiBackupFile {
  type: 'narrative-forge-backup'
  version: 1
  exportedAt: number
  projects: FullProjectData[]
}
