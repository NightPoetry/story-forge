import { useEffect, useRef, useState, useMemo, ReactNode, useCallback } from 'react'
import { useStore } from '../store'
import { StoryNodeData } from '../types'
import { dlog } from '../debugLog'

/* ── Inline Markdown Renderer ───────────────────────────────────────────── */

function renderInline(text: string): ReactNode {
  if (!text) return null
  const parts: ReactNode[] = []
  let key = 0

  const codeSplit = text.split(/(`[^`]+?`)/)
  for (const seg of codeSplit) {
    if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 1) {
      parts.push(
        <code key={key++} style={{
          background: 'rgba(201,169,110,0.1)',
          padding: '1px 4px',
          borderRadius: '3px',
          fontSize: '0.9em',
          color: 'var(--gold)',
        }}>
          {seg.slice(1, -1)}
        </code>,
      )
    } else if (seg) {
      const boldSplit = seg.split(/(\*\*[^*]+?\*\*)/)
      for (const bSeg of boldSplit) {
        if (bSeg.startsWith('**') && bSeg.endsWith('**') && bSeg.length > 4) {
          parts.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bSeg.slice(2, -2)}</strong>)
        } else if (bSeg) {
          const italicSplit = bSeg.split(/(\*[^*]+?\*)/)
          for (const iSeg of italicSplit) {
            if (iSeg.startsWith('*') && iSeg.endsWith('*') && iSeg.length > 2) {
              parts.push(<em key={key++} style={{ fontStyle: 'italic' }}>{iSeg.slice(1, -1)}</em>)
            } else if (iSeg) {
              parts.push(iSeg)
            }
          }
        }
      }
    }
  }

  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : <>{parts}</>
}

/* ── Block-level Markdown Preview ───────────────────────────────────────── */

function MarkdownPreview({ text }: { text: string }) {
  const elements = useMemo(() => {
    if (!text.trim()) return null
    const lines = text.split('\n')
    const result: ReactNode[] = []
    let i = 0
    let key = 0

    while (i < lines.length) {
      const line = lines[i]

      if (line.trimStart().startsWith('```')) {
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
          codeLines.push(lines[i])
          i++
        }
        if (i < lines.length) i++
        result.push(
          <pre key={key++} style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: '4px',
            padding: '8px 12px', fontSize: '12px', lineHeight: 1.6,
            overflow: 'auto', margin: '8px 0',
          }}>
            <code style={{ color: 'var(--text-primary)' }}>{codeLines.join('\n')}</code>
          </pre>,
        )
        continue
      }

      const hMatch = line.match(/^(#{1,3})\s+(.+)$/)
      if (hMatch) {
        const level = hMatch[1].length
        const styles: Record<number, React.CSSProperties> = {
          1: { fontSize: '16px', fontWeight: 600, color: 'var(--gold)', marginTop: '16px', marginBottom: '8px', fontFamily: '"Cormorant Garamond", serif' },
          2: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '12px', marginBottom: '6px' },
          3: { fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' },
        }
        const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
        result.push(<Tag key={key++} style={styles[level]}>{renderInline(hMatch[2])}</Tag>)
        i++
        continue
      }

      if (/^---+$/.test(line.trim())) {
        result.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '12px 0' }} />)
        i++
        continue
      }

      if (line.startsWith('> ')) {
        const quoteLines: string[] = []
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2))
          i++
        }
        result.push(
          <blockquote key={key++} style={{
            borderLeft: '2px solid var(--gold-dim)', paddingLeft: '12px',
            margin: '8px 0', color: 'var(--text-muted)', fontStyle: 'italic',
            fontSize: '12px', lineHeight: 1.7,
          }}>
            {quoteLines.map((l, j) => <div key={j}>{renderInline(l)}</div>)}
          </blockquote>,
        )
        continue
      }

      if (/^[-*]\s/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^[-*]\s/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s/, ''))
          i++
        }
        result.push(
          <ul key={key++} style={{ margin: '6px 0', paddingLeft: '20px', listStyleType: 'disc' }}>
            {items.map((item, j) => (
              <li key={j} style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-primary)', margin: '2px 0' }}>
                {renderInline(item)}
              </li>
            ))}
          </ul>,
        )
        continue
      }

      if (/^\d+\.\s/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s/, ''))
          i++
        }
        result.push(
          <ol key={key++} style={{ margin: '6px 0', paddingLeft: '20px', listStyleType: 'decimal' }}>
            {items.map((item, j) => (
              <li key={j} style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-primary)', margin: '2px 0' }}>
                {renderInline(item)}
              </li>
            ))}
          </ol>,
        )
        continue
      }

      if (!line.trim()) { i++; continue }

      result.push(
        <p key={key++} style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-primary)', margin: '6px 0' }}>
          {renderInline(line)}
        </p>,
      )
      i++
    }

    return result
  }, [text])

  if (!elements) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', opacity: 0.4 }}>
        <div style={{ fontSize: '11px' }}>写作规则为空</div>
        <div style={{ fontSize: '10px', marginTop: '4px' }}>在编辑栏输入内容，预览将实时更新</div>
      </div>
    )
  }

  return <div>{elements}</div>
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

interface OrderedNode extends StoryNodeData { depth: number }

function getOrderedNodes(nodes: Record<string, StoryNodeData>, rootNodeId: string | null): OrderedNode[] {
  if (!rootNodeId || !nodes[rootNodeId]) return Object.values(nodes).map(n => ({ ...n, depth: 0 }))
  const result: OrderedNode[] = []
  function dfs(id: string, depth: number) {
    const node = nodes[id]
    if (!node) return
    result.push({ ...node, depth })
    Object.values(nodes)
      .filter(n => n.parentId === id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach(n => dfs(n.id, depth + 1))
  }
  dfs(rootNodeId, 0)
  return result
}

function charCount(text: string): number {
  return text.replace(/\s/g, '').length
}

/* ── Chat Types ──────────────────────────────────────────────────────────── */

interface RuleChatMsg {
  role: 'user' | 'assistant'
  content: string
  suggestion?: string
  applied?: boolean
  _prev?: string
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function WritingRulesPanel() {
  const {
    isGlobalSettingsOpen, setIsGlobalSettingsOpen,
    aiWritingRules, setAiWritingRules,
    nodes, rootNodeId, selectedNodeId, getAncestorChain,
    projectWritingGuide,
    apiKey, apiUrl, apiFormat, apiModel, globalSettings,
  } = useStore()

  const editorRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [chatHistory, setChatHistory] = useState<RuleChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [showPreview, setShowPreview] = useState(true)
  const [closing, setClosing] = useState(false)

  const orderedNodes = useMemo(() => getOrderedNodes(nodes, rootNodeId), [nodes, rootNodeId])

  const selectedNodesContent = useMemo(
    () => orderedNodes
      .filter(n => selectedNodeIds.has(n.id))
      .map(n => ({ title: n.title, content: n.storyContent, chars: charCount(n.storyContent) })),
    [orderedNodes, selectedNodeIds],
  )

  const totalSelectedChars = useMemo(
    () => selectedNodesContent.reduce((sum, n) => sum + n.chars, 0),
    [selectedNodesContent],
  )

  useEffect(() => {
    if (isGlobalSettingsOpen) setTimeout(() => editorRef.current?.focus(), 150)
  }, [isGlobalSettingsOpen])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      setIsGlobalSettingsOpen(false)
    }, 300)
  }, [setIsGlobalSettingsOpen])

  const toggleNode = useCallback((id: string) => {
    setSelectedNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  if (!isGlobalSettingsOpen) return null

  /* ── Build AI context ───────────────────────────────────────────────── */

  const buildContext = () => {
    const parts: string[] = []

    if (selectedNodesContent.length > 0) {
      parts.push(
        '# 作者选择的参考文本\n' +
        selectedNodesContent.map(n =>
          `## ${n.title}（${n.chars}字）\n${n.content.trim()}`,
        ).join('\n\n---\n\n'),
      )
    } else {
      const node = selectedNodeId ? nodes[selectedNodeId] : null
      if (node) {
        const ancestors = getAncestorChain(selectedNodeId!)
        const withContent = ancestors.filter(a => a.storyContent.trim())
        if (withContent.length > 0) {
          parts.push('# 故事上文\n' + withContent.map(a => `【${a.title}】\n${a.storyContent.trim().slice(0, 300)}`).join('\n\n'))
        }
        if (node.storyContent.trim()) parts.push(`# 当前节点「${node.title}」\n${node.storyContent.trim().slice(0, 500)}`)
        if (node.stateCard.content.trim()) parts.push(`# 状态卡片\n${node.stateCard.content.trim()}`)
      }
    }

    if (projectWritingGuide.trim()) parts.push(`# 故事设定\n${projectWritingGuide.trim()}`)
    return parts.join('\n\n---\n\n')
  }

  /* ── AI send ────────────────────────────────────────────────────────── */

  const handleAISend = async (overrideInput?: string) => {
    const userText = (overrideInput || chatInput).trim()
    if (!userText || generating || !apiKey) return
    if (!overrideInput) setChatInput('')

    const newHistory: RuleChatMsg[] = [...chatHistory, { role: 'user', content: userText }]
    setChatHistory(newHistory)

    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)

    try {
      const context = buildContext()
      const hasSelectedNodes = selectedNodesContent.length > 0

      const systemPrompt = `你是专业的写作规则分析师和顾问。你的任务是帮助作者分析文本的写作风格并编辑写作规则。

当前写作规则：
${aiWritingRules.trim() || '（空）'}

你必须调用 edit_rules 工具回复。
- message：**详细说明**你的分析结论、修改了什么、为什么这样改。不要只说"已处理"或"已分析"这样的空话，必须让作者看到你的思考过程和具体判断。
- rules：修改后的完整写作规则文本（Markdown 格式，完整替换）。当作者讨论写作思路、文风方向、叙事策略时，必须据此生成或更新规则——不能只在 message 中讨论而不提供 rules。
- 倾向于主动给出修改后的规则而非反问${hasSelectedNodes ? `

作者已选择 ${selectedNodesContent.length} 个节点的文本作为参考（共 ${totalSelectedChars} 字）。
分析写作风格时，请关注以下维度并在规则中体现：
1. **叙事视角**：人称、视角类型（限知/全知/多重）
2. **文风特征**：整体文风描述（简洁/华丽/诗意/写实/克制等）
3. **对话风格**：对话的特点和习惯
4. **句式特征**：长短句偏好、段落节奏、修辞手法
5. **用词偏好**：常用词类、形容词密度、动词选择倾向
6. **典型示例**：从原文摘录 3-5 个最能体现风格的句子，用 > 引用格式标注

输出请使用 Markdown 格式（标题、列表、引用），便于预览。` : ''}${globalSettings.trim() ? `\n\n全局设定：${globalSettings.trim()}` : ''}`

      const toolDef = {
        name: 'edit_rules',
        description: '回复作者并提供写作规则修改。当作者讨论写作思路、文风方向时必须同时提供 rules。',
        parameters: {
          type: 'object' as const,
          properties: {
            message: { type: 'string', description: '详细说明分析结论和修改理由，不能是空话' },
            rules: { type: 'string', description: '修改后的完整写作规则文本（Markdown 格式）。当作者讨论写作方向时必须提供' },
          },
          required: ['message'],
        },
      }

      const chatMessages = [
        ...(context ? [{ role: 'user' as const, content: `参考上下文：\n\n${context}` }] : []),
        ...newHistory.map(m => ({ role: m.role, content: m.content })),
      ]

      const base = apiUrl.replace(/\/+$/, '')
      let reply = ''
      let suggestion: string | undefined

      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      const fetchFn = isTauri ? (await import('@tauri-apps/plugin-http')).fetch : fetch

      if (apiFormat === 'anthropic') {
        const resolvedBase = (() => {
          const isOfficial = base === 'https://api.anthropic.com' || base === 'http://api.anthropic.com'
          if (isOfficial && !isTauri) return '/api/anthropic'
          return base
        })()
        const res = await fetchFn(`${resolvedBase}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: apiModel, max_tokens: 4096, system: systemPrompt, messages: chatMessages,
            tools: [{ name: toolDef.name, description: toolDef.description, input_schema: toolDef.parameters }],
          }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json() as { content?: { type: string; text?: string; input?: Record<string, string> }[] }
          for (const block of data.content ?? []) {
            if (block.type === 'text' && block.text) reply = block.text
            if (block.type === 'tool_use' && block.input) {
              reply = block.input.message || reply
              if (block.input.rules) suggestion = block.input.rules
            }
          }
        }
      } else {
        let resolvedBase = base
        if (!isTauri) {
          try {
            const u = new URL(base)
            const h = u.hostname
            if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.'))
              resolvedBase = `/api/local/${u.hostname}/${u.port}${u.pathname}`
          } catch { /* keep */ }
        }
        const res = await fetchFn(`${resolvedBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: apiModel, max_tokens: 4096,
            messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
            tools: [{ type: 'function', function: toolDef }],
            tool_choice: 'required',
          }),
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json() as { choices?: { message: { content?: string; tool_calls?: { function: { arguments: string } }[] } }[] }
          const msg = data.choices?.[0]?.message
          reply = msg?.content ?? ''
          const tc = msg?.tool_calls?.[0]
          if (tc) {
            try {
              const args = JSON.parse(tc.function.arguments) as Record<string, string>
              reply = args.message || reply
              if (args.rules) suggestion = args.rules
            } catch { /* ignore */ }
          }
        }
      }

      if (!controller.signal.aborted) {
        setChatHistory(prev => [...prev, {
          role: 'assistant', content: reply || '已分析。',
          ...(suggestion ? { suggestion } : {}),
        }])
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        dlog.warn('writing-rules', `AI error: ${(e as Error).message}`)
        setChatHistory(prev => [...prev, { role: 'assistant', content: `出错：${(e as Error).message}` }])
      }
    }
    setGenerating(false)
  }

  /* ── Suggestion actions ─────────────────────────────────────────────── */

  const applySuggestion = (idx: number) => {
    const msg = chatHistory[idx]
    if (!msg?.suggestion) return
    const prev = aiWritingRules
    setAiWritingRules(msg.suggestion)
    setChatHistory(p => p.map((m, i) => i === idx ? { ...m, applied: true, _prev: prev } : m))
  }

  const undoSuggestion = (idx: number) => {
    const msg = chatHistory[idx]
    if (msg?._prev === undefined) return
    setAiWritingRules(msg._prev)
    setChatHistory(p => p.map((m, i) => i === idx ? { ...m, applied: false, _prev: undefined } : m))
  }

  /* ── Quick actions ──────────────────────────────────────────────────── */

  const handleGenerateDraft = () => {
    if (selectedNodeIds.size === 0) return
    handleAISend(
      `请分析我选择的 ${selectedNodeIds.size} 个节点的文本，生成一份完整的写作规则初稿。` +
      '包含叙事视角、文风特征、对话风格、句式特征、用词偏好，并从原文摘录典型示例句子。使用 Markdown 格式输出。',
    )
  }

  const handleAnalyzeStyle = () => {
    if (selectedNodeIds.size === 0) return
    handleAISend(
      '请深入分析选中文本的写作风格特征，提供详细的风格分析报告。' +
      '重点关注：句式节奏、情感表达方式、环境描写手法、人物刻画技巧。从文本中摘录最具代表性的例句。',
    )
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 ${closing ? 'backdrop-exit' : 'backdrop-enter'}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-40 flex flex-col ${closing ? 'drawer-exit' : 'drawer-enter'}`}
        style={{
          width: 'min(1200px, calc(100vw - 48px))',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-gold)',
          boxShadow: '-32px 0 80px rgba(0,0,0,0.6)',
        }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-4">
            <div>
              <h2 className="font-serif text-lg" style={{ color: 'var(--text-primary)' }}>
                写作规则
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                编辑规则 · Markdown 预览 · AI 辅助分析
              </p>
            </div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all hover:opacity-80"
              style={{
                color: showPreview ? 'var(--gold-dim)' : 'var(--text-muted)',
                border: `1px solid ${showPreview ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                fontSize: '10px',
              }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
              </svg>
              {showPreview ? '隐藏预览' : '显示预览'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {aiWritingRules.length > 0 && (
              <button
                onClick={() => setAiWritingRules('')}
                className="text-xs px-2.5 py-1 rounded transition-all hover:opacity-70"
                style={{ color: 'rgba(200,80,80,0.6)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '10px' }}>
                清空规则
              </button>
            )}
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded transition-all hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}>
              ✕
            </button>
          </div>
        </div>

        {/* ── Three-column Content ────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex">

          {/* Column 1: Markdown Preview */}
          {showPreview && (
            <>
              <div className="flex-1 min-w-0 flex flex-col" style={{ minWidth: '200px' }}>
                <div className="flex-shrink-0 flex items-center px-4" style={{ height: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                    预览
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                  <MarkdownPreview text={aiWritingRules} />
                </div>
              </div>
              <div className="flex-shrink-0" style={{ width: '1px', background: 'var(--border-subtle)' }} />
            </>
          )}

          {/* Column 2: Editor */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ minWidth: '220px', flex: showPreview ? 1.2 : 2 }}>
            <div className="flex-shrink-0 flex items-center justify-between px-4" style={{ height: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                编辑
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                {aiWritingRules.length} 字符
              </span>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <textarea
                ref={editorRef}
                value={aiWritingRules}
                onChange={e => setAiWritingRules(e.target.value)}
                placeholder={'写作规则将指导 AI 的创作风格，支持 Markdown。\n\n示例：\n# 叙事风格\n- 视角：第三人称限知视角\n- 文风：克制内敛，少用形容词堆砌\n\n# 对话风格\n- 简洁有力，避免说教\n- 潜台词优于直白表达\n\n# 典型示例\n> "她没有回头。"\n> — 而非 "她悲伤地、不舍地转身离去"'}
                className="w-full h-full resize-none outline-none rounded p-3"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontFamily: '"DM Sans", system-ui, sans-serif',
                  lineHeight: 1.7,
                  fontSize: '13px',
                }}
                spellCheck={false}
              />
            </div>
          </div>

          <div className="flex-shrink-0" style={{ width: '1px', background: 'var(--border-subtle)' }} />

          {/* Column 3: AI Chat */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ minWidth: '240px' }}>
            <div className="flex-shrink-0 flex items-center px-4" style={{ height: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                AI 辅助
              </span>
            </div>

            {/* Node picker */}
            <div className="flex-shrink-0 px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setPickerOpen(!pickerOpen)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-all hover:opacity-80"
                style={{
                  background: selectedNodeIds.size > 0 ? 'rgba(201,169,110,0.08)' : 'var(--bg-elevated)',
                  border: `1px solid ${selectedNodeIds.size > 0 ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                  color: selectedNodeIds.size > 0 ? 'var(--gold)' : 'var(--text-muted)',
                  fontSize: '11px',
                }}>
                <span className="flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    {selectedNodeIds.size > 0
                      ? <path d="M3.5 6l2 2 3-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      : <path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
                  </svg>
                  选择参考节点
                  {selectedNodeIds.size > 0 && (
                    <span style={{ color: 'var(--gold)', fontWeight: 500 }}>
                      {selectedNodeIds.size} 个 · {totalSelectedChars}字
                    </span>
                  )}
                </span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
                  style={{ transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {pickerOpen && (
                <div className="mt-2 rounded overflow-y-auto"
                  style={{ maxHeight: '180px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between px-2.5 py-1.5"
                    style={{ borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>
                    <button
                      onClick={() => setSelectedNodeIds(new Set(orderedNodes.filter(n => n.storyContent.trim()).map(n => n.id)))}
                      className="text-xs hover:opacity-70 transition-all"
                      style={{ color: 'var(--gold-dim)', fontSize: '10px' }}>
                      全选有内容
                    </button>
                    <button
                      onClick={() => setSelectedNodeIds(new Set())}
                      className="text-xs hover:opacity-70 transition-all"
                      style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                      清除选择
                    </button>
                  </div>
                  {orderedNodes.map(node => {
                    const wc = charCount(node.storyContent)
                    const hasContent = node.storyContent.trim().length > 0
                    return (
                      <label
                        key={node.id}
                        className="flex items-center gap-2 py-1.5 cursor-pointer transition-all hover:opacity-80"
                        style={{
                          paddingLeft: `${10 + node.depth * 16}px`,
                          paddingRight: '10px',
                          opacity: hasContent ? 1 : 0.4,
                          borderBottom: '1px solid rgba(201,169,110,0.05)',
                        }}>
                        <input
                          type="checkbox"
                          checked={selectedNodeIds.has(node.id)}
                          onChange={() => toggleNode(node.id)}
                          disabled={!hasContent}
                          className="flex-shrink-0"
                          style={{ accentColor: 'var(--gold)' }}
                        />
                        <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)', fontSize: '11px' }}>
                          {node.title}
                        </span>
                        <span className="flex-shrink-0" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                          {wc > 0 ? `${wc}字` : '空'}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              {selectedNodeIds.size > 0 && !generating && (
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={handleGenerateDraft}
                    className="flex-1 px-2 py-1.5 rounded text-xs transition-all hover:brightness-110"
                    style={{
                      background: 'rgba(201,169,110,0.15)',
                      border: '1px solid var(--border-gold)',
                      color: 'var(--gold)',
                      fontSize: '10px', fontWeight: 500,
                    }}>
                    生成规则初稿
                  </button>
                  <button
                    onClick={handleAnalyzeStyle}
                    className="flex-1 px-2 py-1.5 rounded text-xs transition-all hover:brightness-110"
                    style={{
                      background: 'rgba(58,95,130,0.12)',
                      border: '1px solid var(--border-slate)',
                      color: '#5080a8',
                      fontSize: '10px', fontWeight: 500,
                    }}>
                    分析写作风格
                  </button>
                </div>
              )}
            </div>

            {/* Chat messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
              {chatHistory.length === 0 && (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.5, lineHeight: 1.8 }}>
                  AI 能看到故事上下文
                  <br />
                  <span style={{ fontSize: '10px' }}>
                    选择参考节点后，可自动分析风格并生成规则
                    <br />
                    也可直接对话：「把文风改为轻松幽默」
                  </span>
                </div>
              )}
              <div className="space-y-2.5">
                {chatHistory.map((msg, i) => (
                  <div key={i}>
                    <div className="text-xs mb-0.5" style={{ color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--gold-dim)', fontSize: '9px' }}>
                      {msg.role === 'user' ? '你' : 'AI'}
                    </div>
                    <div className="text-xs rounded px-2.5 py-2"
                      style={{
                        background: msg.role === 'user' ? 'rgba(240,235,224,0.06)' : 'rgba(201,169,110,0.05)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(240,235,224,0.08)' : 'var(--border-gold)'}`,
                        color: 'var(--text-primary)', fontSize: '12px', lineHeight: 1.65, whiteSpace: 'pre-wrap',
                      }}>
                      {msg.content}
                    </div>
                    {msg.suggestion && (
                      <div className="mt-1.5 rounded px-2.5 py-2"
                        style={{ background: 'rgba(180,140,90,0.08)', border: '1px solid rgba(180,140,90,0.2)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ color: '#b8916a', fontSize: '10px', fontWeight: 500 }}>
                            {msg.applied ? '已应用' : '建议修改'}
                          </span>
                          <div className="flex gap-1.5">
                            {msg.applied && (
                              <button onClick={() => undoSuggestion(i)}
                                className="px-2 py-0.5 rounded transition-all hover:opacity-80"
                                style={{ color: 'rgba(200,80,80,0.7)', border: '1px solid rgba(200,80,80,0.25)', fontSize: '10px' }}>
                                撤销
                              </button>
                            )}
                            {!msg.applied && (
                              <button onClick={() => applySuggestion(i)}
                                className="px-2.5 py-0.5 rounded transition-all hover:brightness-110"
                                style={{ background: 'rgba(180,140,90,0.25)', color: '#b8916a', border: '1px solid rgba(180,140,90,0.4)', fontSize: '10px', fontWeight: 500 }}>
                                应用修改
                              </button>
                            )}
                          </div>
                        </div>
                        <p style={{
                          color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.5,
                          opacity: msg.applied ? 0.5 : 1, maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap',
                          margin: 0,
                        }}>
                          {msg.suggestion.length > 500 ? msg.suggestion.slice(0, 500) + '…' : msg.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                {generating && (
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded"
                    style={{ background: 'rgba(201,169,110,0.05)', border: '1px solid var(--border-gold)', color: 'var(--text-muted)', fontSize: '11px' }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full generating-pulse" style={{ background: 'var(--gold)', flexShrink: 0 }} />
                    思考中…
                  </div>
                )}
              </div>
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="flex-shrink-0 flex items-end gap-1.5 px-4 pb-3 pt-2"
              style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAISend() } }}
                disabled={generating || !apiKey}
                placeholder={!apiKey ? '请先配置 API Key' : generating ? '生成中…' : '输入指令，回车发送…'}
                rows={2}
                className="flex-1 resize-none outline-none"
                style={{ background: 'transparent', color: 'var(--text-primary)', fontSize: '12px', lineHeight: 1.6 }}
              />
              <button onClick={() => handleAISend()} disabled={generating || !apiKey || !chatInput.trim()}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all mb-0.5"
                style={{
                  background: generating || !apiKey || !chatInput.trim() ? 'rgba(201,169,110,0.15)' : 'var(--gold)',
                  opacity: generating || !apiKey || !chatInput.trim() ? 0.5 : 1,
                }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10L6 2L10 10L6 8L2 10Z"
                    fill={generating || !apiKey || !chatInput.trim() ? 'var(--gold)' : '#0e0d15'} />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-6 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ color: 'var(--text-muted)', opacity: 0.55, fontSize: '10px', margin: 0 }}>
            优先级：写作规则 &lt; 故事设定 &lt; 状态卡片 · 支持 Markdown 语法（标题、列表、引用、粗体）
          </p>
        </div>
      </div>
    </>
  )
}
