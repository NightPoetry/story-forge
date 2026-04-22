import { create } from 'zustand'
import {
  readProjectIndex, writeProjectIndex,
  readProjectData, writeProjectData, deleteProjectData,
  hashPassword, verifyPassword,
  exportJsonFile, exportTextFile,
  importJsonFile, buildStoryChainText, initStorage,
} from './storage'
import {
  ChatMessage, FullProjectData, ProjectMeta, SingleBackupFile, MultiBackupFile, StoryNodeData, TrashedNodeGroup,
} from './types'
import { genId } from './api'

interface ProjectStore {
  projects: ProjectMeta[]
  currentProjectId: string | null
  view: 'projects' | 'editor'
  isLoading: boolean

  // Lifecycle
  init: () => Promise<void>
  loadProjects: () => Promise<void>
  createProject: (name: string, password?: string) => Promise<string>
  openProject: (id: string, password?: string) => Promise<'ok' | 'wrong-password' | 'needs-password'>
  closeProject: () => Promise<void>
  deleteProject: (id: string) => Promise<void>
  restoreProject: (id: string) => Promise<void>
  permanentDeleteProject: (id: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  saveProjectData: (projectId: string, nodes: FullProjectData['nodes'], rootNodeId: string | null, writingGuide?: string, writingGuideChatHistory?: ChatMessage[], trashedNodes?: TrashedNodeGroup[]) => Promise<void>

  // Export
  exportProjectBackup: (projectId: string, currentNodes?: FullProjectData['nodes'], rootNodeId?: string | null) => Promise<void>
  exportMultipleBackup: (projectIds: string[], passwords: Record<string, string>) => Promise<void>
  exportStoryChain: (chain: StoryNodeData[], projectName: string, fmt: 'txt' | 'md') => Promise<void>
  exportSingleNode: (node: StoryNodeData, projectName: string, fmt: 'txt' | 'md') => Promise<void>

  // Import
  importProjects: () => Promise<{ count: number; errors: string[] }>
}

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  projects: [],
  currentProjectId: null,
  view: 'projects',
  isLoading: false,

  init: async () => {
    await initStorage()
    await get().loadProjects()
  },

  loadProjects: async () => {
    set({ isLoading: true })
    const projects = await readProjectIndex()
    set({ projects, isLoading: false })
  },

  createProject: async (name, password) => {
    const id = genId()
    const now = Date.now()
    const passwordHash = password ? await hashPassword(password) : null

    const meta: ProjectMeta = { id, name, passwordHash, createdAt: now, updatedAt: now, nodeCount: 0 }
    const data: FullProjectData = { id, name, passwordHash, nodes: {}, rootNodeId: null, writingGuide: '', writingGuideChatHistory: [], trashedNodes: [], createdAt: now, updatedAt: now }

    await writeProjectData(data)

    const updated = [...get().projects, meta]
    await writeProjectIndex(updated)
    set({ projects: updated })
    return id
  },

  openProject: async (id, password) => {
    const meta = get().projects.find((p) => p.id === id)
    if (!meta) return 'ok'

    if (meta.passwordHash) {
      if (!password) return 'needs-password'
      const ok = await verifyPassword(password, meta.passwordHash)
      if (!ok) return 'wrong-password'
    }

    set({ currentProjectId: id, view: 'editor' })
    return 'ok'
  },

  closeProject: async () => {
    set({ currentProjectId: null, view: 'projects' })
  },

  deleteProject: async (id) => {
    const now = Date.now()
    const updated = get().projects.map((p) => p.id === id ? { ...p, deletedAt: now } : p)
    await writeProjectIndex(updated)
    set({ projects: updated })
  },

  restoreProject: async (id) => {
    const updated = get().projects.map((p) => p.id === id ? { ...p, deletedAt: undefined } : p)
    await writeProjectIndex(updated)
    set({ projects: updated })
  },

  permanentDeleteProject: async (id) => {
    await deleteProjectData(id)
    const updated = get().projects.filter((p) => p.id !== id)
    await writeProjectIndex(updated)
    set({ projects: updated })
  },

  renameProject: async (id, name) => {
    const updated = get().projects.map((p) => p.id === id ? { ...p, name } : p)
    await writeProjectIndex(updated)
    set({ projects: updated })
    // Also update in data file
    const data = await readProjectData(id)
    if (data) await writeProjectData({ ...data, name })
  },

  saveProjectData: async (projectId, nodes, rootNodeId, writingGuide = '', writingGuideChatHistory = [], trashedNodes = []) => {
    const meta = get().projects.find((p) => p.id === projectId)
    if (!meta) return

    const now = Date.now()
    const nodeCount = Object.keys(nodes).length
    const data: FullProjectData = {
      id: projectId,
      name: meta.name,
      passwordHash: meta.passwordHash,
      nodes,
      rootNodeId,
      writingGuide,
      writingGuideChatHistory,
      trashedNodes: trashedNodes ?? [],
      createdAt: meta.createdAt,
      updatedAt: now,
    }
    await writeProjectData(data)

    const updatedMeta: ProjectMeta = { ...meta, updatedAt: now, nodeCount }
    const updatedIndex = get().projects.map((p) => p.id === projectId ? updatedMeta : p)
    await writeProjectIndex(updatedIndex)
    set({ projects: updatedIndex })
  },

  // ── Export ──────────────────────────────────────────────────────────────

  exportProjectBackup: async (projectId, currentNodes, rootNodeId) => {
    const meta = get().projects.find((p) => p.id === projectId)
    if (!meta) return

    let data: FullProjectData | null
    if (currentNodes !== undefined) {
      data = {
        id: projectId, name: meta.name, passwordHash: meta.passwordHash,
        nodes: currentNodes, rootNodeId: rootNodeId ?? null,
        writingGuide: '',
        createdAt: meta.createdAt, updatedAt: Date.now(),
      }
    } else {
      data = await readProjectData(projectId)
    }
    if (!data) return

    const backup: SingleBackupFile = {
      type: 'narrative-forge-project', version: 1,
      exportedAt: Date.now(), project: data,
    }
    const safeName = meta.name.replace(/[^\u4e00-\u9fa5\w\s-]/g, '').trim() || projectId
    await exportJsonFile(backup, `${safeName}-备份.json`)
  },

  exportMultipleBackup: async (projectIds, passwords) => {
    const projects: FullProjectData[] = []
    for (const id of projectIds) {
      const meta = get().projects.find((p) => p.id === id)
      if (!meta) continue
      if (meta.passwordHash) {
        const pw = passwords[id] ?? ''
        const ok = await verifyPassword(pw, meta.passwordHash)
        if (!ok) continue
      }
      const data = await readProjectData(id)
      if (data) projects.push(data)
    }
    if (projects.length === 0) return

    const backup: MultiBackupFile = {
      type: 'narrative-forge-backup', version: 1,
      exportedAt: Date.now(), projects,
    }
    await exportJsonFile(backup, `叙事工坊-批量备份-${projects.length}项目.json`)
  },

  exportStoryChain: async (chain, projectName, fmt) => {
    const content = buildStoryChainText(chain, projectName, fmt)
    const safeName = projectName.replace(/[^\u4e00-\u9fa5\w\s-]/g, '').trim() || 'story'
    await exportTextFile(content, `${safeName}-完整故事.${fmt}`)
  },

  exportSingleNode: async (node, projectName, fmt) => {
    const content = buildStoryChainText([node], projectName, fmt)
    const safeName = node.title.replace(/[^\u4e00-\u9fa5\w\s-]/g, '').trim() || node.id
    await exportTextFile(content, `${safeName}.${fmt}`)
  },

  // ── Import ──────────────────────────────────────────────────────────────

  importProjects: async () => {
    const raw = await importJsonFile()
    if (!raw || typeof raw !== 'object') return { count: 0, errors: ['无效文件'] }

    const now = Date.now()
    const errors: string[] = []
    let count = 0

    const doImport = async (proj: FullProjectData) => {
      // Give a new ID to avoid collision
      const newId = genId()
      const newData: FullProjectData = { ...proj, id: newId }
      await writeProjectData(newData)

      const meta: ProjectMeta = {
        id: newId,
        name: proj.name + ' (导入)',
        passwordHash: proj.passwordHash,
        createdAt: now,
        updatedAt: now,
        nodeCount: Object.keys(proj.nodes).length,
      }
      const updated = [...get().projects, meta]
      await writeProjectIndex(updated)
      set({ projects: updated })
      count++
    }

    const r = raw as { type?: string; project?: FullProjectData; projects?: FullProjectData[] }

    if (r.type === 'narrative-forge-project' && r.project) {
      await doImport(r.project)
    } else if (r.type === 'narrative-forge-backup' && Array.isArray(r.projects)) {
      for (const p of r.projects) {
        try { await doImport(p) } catch (e) {
          errors.push(`导入「${p.name}」失败`)
        }
      }
    } else {
      return { count: 0, errors: ['文件格式不支持'] }
    }

    return { count, errors }
  },
}))

// @ts-ignore — Vite injects import.meta.env at build time
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__PROJECT_STORE__ = useProjectStore
}
