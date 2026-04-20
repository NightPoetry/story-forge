# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Web dev server (Vite, port 1420, browser only)
npm run tauri:dev    # Tauri desktop app with hot reload

# Production
npm run build        # TypeScript check + Vite bundle
npm run tauri:build  # Tauri release build (macOS/Windows binary)
```

No test suite is configured. TypeScript strict mode is enabled — `npm run build` is the primary correctness check.

## Architecture

**Tauri 2 desktop app** with React 18 + TypeScript frontend. The Rust backend is minimal (shell, fs, dialog plugins only); all application logic lives in TypeScript.

### Data flow

```
ChatPanel → api.ts (runIntelligentGeneration) → Anthropic/OpenAI API
                ↓ tool use response
         AIAction parsing → Zustand stores → React re-render
                                    ↓
                           storage.ts (1.5s debounce auto-save)
                                    ↓
                  Tauri FS (AppData/narrative-forge/) or localStorage fallback
```

### State management (Zustand)

- **`src/store.ts`** — story editing state: nodes map, selected/editing node IDs, foreshadowings, API settings. Settings persist to localStorage (`nf-settings`); story data is managed via project files, not persisted here.
- **`src/projectStore.ts`** — project lifecycle: list, current project, view mode (projects/editor), all export/import/password operations.

### AI integration (`src/api.ts`)

- `runIntelligentGeneration()` drives all AI interactions via **tool use**: four tools (`write_story`, `update_state_card`, `chat_reply`, `collect_foreshadowing`) return structured JSON instead of free text.
- Anthropic API uses streaming; OpenAI-compatible APIs use non-streaming.
- Vite proxies `/api/anthropic` → `https://api.anthropic.com` to avoid CORS in browser dev mode.
- `buildSystemPrompt()` assembles context: global settings, current node's state card, foreshadowing list, story chain ancestors.

### Storage (`src/storage.ts`)

- **Tauri runtime:** reads/writes JSON to `AppData/narrative-forge/`. Project index at `projects-index.json`, each project at `project-{id}.json`.
- **Browser dev:** falls back to localStorage. Check `isTauriEnv()` when adding file operations.
- Password protection uses SHA-256 hashing (Web Crypto API).

### Core types (`src/types.ts`)

Key interfaces: `StoryNodeData` (id, title, content, chatHistory, stateCard, parentId, branchType), `ForeshadowingItem` (id like F1/F2, secret, plantNote, status), `ProjectMeta`, `FullProjectData`.

### Component layout

- **`App.tsx`** — top-level router between `ProjectsPage` and the editor (NodeGraph + NodeEditor + ChatPanel + panels).
- **`NodeGraph.tsx`** — React Flow + Dagre layout rendering the branching story tree.
- **`ChatPanel.tsx`** — user prompt input; calls `runIntelligentGeneration()` and dispatches results to stores.
- **`StateCard.tsx` / `ForeshadowingPanel.tsx` / `GlobalSettings.tsx`** — sidebar panels for per-node and global story metadata.

### Styling

Tailwind with custom theme: `ink` (dark grays), `parchment` (beige), `gold` (accents), `slate` (branch edges). Cormorant Garamond for story text, DM Sans for UI chrome. CSS variables defined in `src/index.css`.
