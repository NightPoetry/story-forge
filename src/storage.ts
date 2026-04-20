/**
 * Storage abstraction — uses Tauri FS plugin when available,
 * falls back to localStorage for browser dev.
 */
import { FullProjectData, ProjectMeta, SingleBackupFile, MultiBackupFile, StoryNodeData } from './types'

// ── Environment detection ──────────────────────────────────────────────────

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ── Lazy plugin imports (only used in Tauri context) ──────────────────────

async function fsAPI() {
  const m = await import('@tauri-apps/plugin-fs')
  return m
}

async function dialogAPI() {
  const m = await import('@tauri-apps/plugin-dialog')
  return m
}

// ── Path constants ─────────────────────────────────────────────────────────

const DIR = 'narrative-forge'
const INDEX = `${DIR}/projects-index.json`
const projectPath = (id: string) => `${DIR}/project-${id}.json`

// ── Init ───────────────────────────────────────────────────────────────────

export async function initStorage(): Promise<void> {
  if (!isTauri()) return
  const { exists, mkdir, BaseDirectory } = await fsAPI()
  const ok = await exists(DIR, { baseDir: BaseDirectory.AppData })
  if (!ok) await mkdir(DIR, { baseDir: BaseDirectory.AppData, recursive: true })
}

// ── Project index ──────────────────────────────────────────────────────────

export async function readProjectIndex(): Promise<ProjectMeta[]> {
  if (!isTauri()) {
    return JSON.parse(localStorage.getItem('nf-index') || '[]')
  }
  const { exists, readTextFile, BaseDirectory } = await fsAPI()
  try {
    if (!(await exists(INDEX, { baseDir: BaseDirectory.AppData }))) return []
    const txt = await readTextFile(INDEX, { baseDir: BaseDirectory.AppData })
    return JSON.parse(txt)
  } catch { return [] }
}

export async function writeProjectIndex(projects: ProjectMeta[]): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem('nf-index', JSON.stringify(projects))
    return
  }
  const { writeTextFile, BaseDirectory } = await fsAPI()
  await writeTextFile(INDEX, JSON.stringify(projects, null, 2), { baseDir: BaseDirectory.AppData })
}

// ── Project data ───────────────────────────────────────────────────────────

export async function readProjectData(id: string): Promise<FullProjectData | null> {
  if (!isTauri()) {
    const s = localStorage.getItem(`nf-proj-${id}`)
    return s ? JSON.parse(s) : null
  }
  const { exists, readTextFile, BaseDirectory } = await fsAPI()
  try {
    const p = projectPath(id)
    if (!(await exists(p, { baseDir: BaseDirectory.AppData }))) return null
    const txt = await readTextFile(p, { baseDir: BaseDirectory.AppData })
    return JSON.parse(txt)
  } catch { return null }
}

export async function writeProjectData(data: FullProjectData): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(`nf-proj-${data.id}`, JSON.stringify(data))
    return
  }
  const { writeTextFile, BaseDirectory } = await fsAPI()
  await writeTextFile(projectPath(data.id), JSON.stringify(data, null, 2), {
    baseDir: BaseDirectory.AppData,
  })
}

export async function deleteProjectData(id: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(`nf-proj-${id}`)
    return
  }
  const { exists, remove, BaseDirectory } = await fsAPI()
  const p = projectPath(id)
  if (await exists(p, { baseDir: BaseDirectory.AppData })) {
    await remove(p, { baseDir: BaseDirectory.AppData })
  }
}

// ── Crypto ─────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await hashPassword(password)) === hash
}

// ── File export ────────────────────────────────────────────────────────────

async function saveFile(content: string, defaultName: string, filterName: string, ext: string[]) {
  if (!isTauri()) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: defaultName })
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  const { save } = await dialogAPI()
  const path = await save({ defaultPath: defaultName, filters: [{ name: filterName, extensions: ext }] })
  if (path) {
    const { writeTextFile } = await fsAPI()
    await writeTextFile(path as string, content)
  }
}

export async function exportTextFile(content: string, defaultName: string): Promise<void> {
  await saveFile(content, defaultName, 'Text', ['txt', 'md'])
}

export async function exportJsonFile(data: object, defaultName: string): Promise<void> {
  await saveFile(JSON.stringify(data, null, 2), defaultName, 'JSON Backup', ['json'])
}

// ── File import ────────────────────────────────────────────────────────────

export async function importJsonFile(): Promise<unknown | null> {
  if (!isTauri()) {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file', accept: '.json',
      })
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return resolve(null)
        try { resolve(JSON.parse(await file.text())) } catch { resolve(null) }
      }
      input.click()
    })
  }
  const { open } = await dialogAPI()
  const selected = await open({ multiple: false, filters: [{ name: 'JSON Backup', extensions: ['json'] }] })
  if (!selected || Array.isArray(selected)) return null
  const { readTextFile } = await fsAPI()
  try { return JSON.parse(await readTextFile(selected as string)) } catch { return null }
}

// ── Story chain text builder ───────────────────────────────────────────────

export function buildStoryChainText(
  nodes: StoryNodeData[],
  projectName: string,
  format: 'txt' | 'md',
): string {
  const sep = format === 'md' ? '\n\n---\n\n' : '\n\n════════════════════\n\n'
  const heading = (title: string) =>
    format === 'md' ? `## ${title}\n\n` : `【${title}】\n\n`

  const header =
    format === 'md'
      ? `# ${projectName}\n\n*导出时间：${new Date().toLocaleString('zh-CN')}*\n\n---\n\n`
      : `《${projectName}》\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n════════════════════\n\n`

  const body = nodes
    .filter((n) => n.storyContent.trim())
    .map((n) => heading(n.title) + n.storyContent.trim())
    .join(sep)

  return header + body
}
