import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { FloatingEditButton, RevisionOverlay } from './InlineRevision'
import type { StoryEdit, Strikethrough } from '../types'
import { genId } from '../api'

interface Props {
  nodeId: string
  isStreaming?: boolean
}

const FONT_SIZES = [
  { label: '14', value: 14 },
  { label: '16', value: 16 },
  { label: '18', value: 18 },
  { label: '20', value: 20 },
  { label: '22', value: 22 },
]

const LINE_HEIGHTS = [
  { label: '1.5', value: 1.5 },
  { label: '1.7', value: 1.7 },
  { label: '1.9', value: 1.9 },
  { label: '2.2', value: 2.2 },
  { label: '2.5', value: 2.5 },
]

const LETTER_SPACINGS = [
  { label: '默', value: 0 },
  { label: '正', value: 0.01 },
  { label: '展', value: 0.05 },
  { label: '宽', value: 0.1 },
]

type DiffSegment =
  | { type: 'plain'; text: string }
  | { type: 'edit'; edit: StoryEdit }
  | { type: 'strike'; st: Strikethrough }

function buildDiffSegments(content: string, edits: StoryEdit[], strikes: Strikethrough[]): DiffSegment[] {
  const marks: { start: number; end: number; seg: DiffSegment }[] = []

  for (const edit of edits) {
    if (edit.dismissed) continue
    const idx = content.indexOf(edit.newText)
    if (idx >= 0) marks.push({ start: idx, end: idx + edit.newText.length, seg: { type: 'edit', edit } })
  }
  for (const st of strikes) {
    const idx = content.indexOf(st.text)
    if (idx >= 0) marks.push({ start: idx, end: idx + st.text.length, seg: { type: 'strike', st } })
  }

  marks.sort((a, b) => a.start - b.start)
  const filtered: typeof marks = []
  let lastEnd = 0
  for (const m of marks) {
    if (m.start >= lastEnd) { filtered.push(m); lastEnd = m.end }
  }

  const segments: DiffSegment[] = []
  let cursor = 0
  for (const m of filtered) {
    if (m.start > cursor) segments.push({ type: 'plain', text: content.slice(cursor, m.start) })
    segments.push(m.seg)
    cursor = m.end
  }
  if (cursor < content.length) segments.push({ type: 'plain', text: content.slice(cursor) })
  return segments
}

function DiffView({ nodeId, content, edits, strikes, fontSize, lineHeight, letterSpacing }: {
  nodeId: string
  content: string
  edits: StoryEdit[]
  strikes: Strikethrough[]
  fontSize: number
  lineHeight: number
  letterSpacing: number
}) {
  const { dismissStoryEdit, undismissStoryEdit, removeStrikethrough } = useStore()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const segments = buildDiffSegments(content, edits, strikes)

  return (
    <div
      className="story-text w-full"
      style={{
        fontSize: `${fontSize}px`,
        lineHeight,
        letterSpacing: `${letterSpacing}em`,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: '200px',
      }}>
      {segments.map((seg, i) => {
        if (seg.type === 'plain') return <span key={i}>{seg.text}</span>

        if (seg.type === 'strike') return (
          <span
            key={seg.st.id}
            onMouseEnter={() => setHoveredId(seg.st.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              textDecoration: 'line-through',
              color: 'rgba(200,80,80,0.4)',
              background: 'rgba(200,80,80,0.05)',
              cursor: 'default',
              position: 'relative',
            }}>
            {seg.st.text}
            {hoveredId === seg.st.id && (
              <span style={{
                position: 'absolute', bottom: 'calc(100% + 4px)', left: 0,
                background: '#1a1825', border: '1px solid var(--border-gold)', borderRadius: '4px',
                padding: '6px 10px', fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)',
                whiteSpace: 'nowrap', zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}>
                <span style={{ color: 'rgba(200,80,80,0.7)', fontSize: '10px' }}>手动划掉 · {new Date(seg.st.timestamp).toLocaleString('zh-CN')}</span>
                <br />
                <button
                  onClick={(e) => { e.stopPropagation(); removeStrikethrough(nodeId, seg.st.id) }}
                  style={{ color: 'var(--gold)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  取消划掉
                </button>
              </span>
            )}
          </span>
        )

        // type === 'edit'
        return (
          <span key={seg.edit.id} className="relative inline">
            <span style={{ textDecoration: 'line-through', color: 'rgba(200,80,80,0.45)', background: 'rgba(200,80,80,0.06)' }}>
              {seg.edit.oldText}
            </span>
            <span
              onMouseEnter={() => setHoveredId(seg.edit.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                color: 'rgba(80,180,120,0.9)', background: 'rgba(80,180,120,0.08)',
                borderBottom: '1px dashed rgba(80,180,120,0.3)',
                cursor: 'default', position: 'relative',
              }}>
              {seg.edit.newText}
              {hoveredId === seg.edit.id && (
                <span style={{
                  position: 'absolute', bottom: 'calc(100% + 4px)', left: 0,
                  background: '#1a1825', border: '1px solid var(--border-gold)', borderRadius: '4px',
                  padding: '6px 10px', fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)',
                  whiteSpace: 'nowrap', zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}>
                  <span style={{ color: 'var(--gold)', fontSize: '10px' }}>
                    {new Date(seg.edit.timestamp).toLocaleString('zh-CN')}
                  </span>
                  <br />
                  <span style={{ fontSize: '10px' }}>触发：{seg.edit.trigger.slice(0, 60)}{seg.edit.trigger.length > 60 ? '…' : ''}</span>
                  <br />
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissStoryEdit(nodeId, seg.edit.id) }}
                    style={{ color: 'var(--gold)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: '2px' }}>
                    隐藏此修改
                  </button>
                </span>
              )}
            </span>
          </span>
        )
      })}
    </div>
  )
}

export default function StoryPanel({ nodeId, isStreaming }: Props) {
  const {
    nodes, updateStoryContent, updateNodeTitle, updateTargetWordCount,
    editorFontSize, editorLineHeight, editorLetterSpacing,
    setEditorFontSize, setEditorLineHeight, setEditorLetterSpacing,
    addStrikethrough, undismissStoryEdit,
  } = useStore()
  const node = nodes[nodeId]
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [showTypography, setShowTypography] = useState(false)
  const [showDiffs, setShowDiffs] = useState(true)
  const typographyRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  // Sync textarea height with content — preserve scroll position
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const scroller = el.parentElement
      const scrollTop = scroller?.scrollTop ?? 0
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
      if (scroller) scroller.scrollTop = scrollTop
    })
  }, [node?.storyContent])

  // When streaming ends, sync the DOM textarea value with the store
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      const el = textareaRef.current
      if (el && node) el.value = node.storyContent
    }
    prevStreamingRef.current = !!isStreaming
  }, [isStreaming, node?.storyContent])

  useEffect(() => {
    if (!showTypography) return
    const handler = (e: MouseEvent) => {
      if (typographyRef.current && !typographyRef.current.contains(e.target as Node)) {
        setShowTypography(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTypography])

  if (!node) return null

  const allEdits = node.editHistory ?? []
  const visibleEdits = allEdits.filter(e => !e.dismissed && node.storyContent.includes(e.newText))
  const dismissedEdits = allEdits.filter(e => e.dismissed && node.storyContent.includes(e.newText))
  const strikes = (node.strikethroughs ?? []).filter(st => node.storyContent.includes(st.text))
  const hasAnnotations = visibleEdits.length > 0 || strikes.length > 0

  const wordCount = node.storyContent.replace(/\s/g, '').length
  const target = node.targetWordCount

  const handleTargetClick = () => {
    setTargetInput(target ? String(target) : '')
    setEditingTarget(true)
  }

  const handleTargetSave = () => {
    const val = parseInt(targetInput, 10)
    updateTargetWordCount(nodeId, isNaN(val) || val <= 0 ? undefined : val)
    setEditingTarget(false)
  }

  const handleTargetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleTargetSave()
    if (e.key === 'Escape') setEditingTarget(false)
  }

  const isShort = target && wordCount < target
  const progress = target ? Math.min(wordCount / target, 1) : 0

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#13111e' }}>
      {/* Title area */}
      <div
        className="px-6 sm:px-10 pt-6 sm:pt-8 pb-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          className="flex flex-wrap items-center gap-2 mb-2 text-xs"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '10px' }}>
          <span style={{
            color: node.branchType === 'branch' ? '#5080a8'
              : node.branchType === 'root' ? 'var(--gold-dim)' : 'var(--text-muted)',
          }}>
            {node.branchType === 'root' ? '根节点' : node.branchType === 'branch' ? '分支线' : '续篇'}
          </span>
          <span>·</span>
          <span>{new Date(node.createdAt).toLocaleDateString('zh-CN')}</span>
        </div>
        <input
          value={node.title}
          onChange={(e) => updateNodeTitle(nodeId, e.target.value)}
          className="w-full bg-transparent outline-none font-serif"
          style={{
            color: 'var(--text-primary)',
            fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
            fontWeight: 500,
            letterSpacing: '0.02em',
            border: 'none',
          }}
          placeholder="节点标题…"
        />
      </div>

      {/* Scrollable story area */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6" style={{ position: 'relative' }}>
        {hasAnnotations && showDiffs && !isStreaming ? (
          <DiffView
            nodeId={nodeId}
            content={node.storyContent}
            edits={allEdits}
            strikes={strikes}
            fontSize={editorFontSize}
            lineHeight={editorLineHeight}
            letterSpacing={editorLetterSpacing}
          />
        ) : (
          <>
            <textarea
              id="story-textarea"
              ref={textareaRef}
              {...(isStreaming ? {} : { value: node.storyContent })}
              onChange={(e) => updateStoryContent(nodeId, e.target.value)}
              className={`story-text w-full${isStreaming ? ' cursor-blink' : ''}`}
              placeholder="这里是故事正文。在右侧对话栏输入创作指令，AI 将实时生成内容…"
              spellCheck={false}
              readOnly={isStreaming}
              style={{
                overflow: 'hidden',
                resize: 'none',
                minHeight: '200px',
                fontSize: `${editorFontSize}px`,
                lineHeight: editorLineHeight,
                letterSpacing: `${editorLetterSpacing}em`,
              }}
            />
            <FloatingEditButton textareaRef={textareaRef} nodeId={nodeId} disabled={isStreaming} />
            <RevisionOverlay
              textareaRef={textareaRef}
              nodeId={nodeId}
              editorFontSize={editorFontSize}
              editorLineHeight={editorLineHeight}
              editorLetterSpacing={editorLetterSpacing}
              isStreaming={isStreaming}
            />
          </>
        )}
      </div>

      {/* Footer stats — wraps on narrow widths */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-6 sm:px-10 py-2.5 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '11px' }}>

        {/* Left: word count + progress */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span style={{ color: isShort ? 'rgba(200,140,60,0.85)' : 'var(--text-muted)' }}>
            {wordCount.toLocaleString()} 字
          </span>
          {target && (
            <>
              <span style={{ opacity: 0.3 }}>/</span>
              <span style={{ color: isShort ? 'rgba(200,140,60,0.7)' : 'rgba(80,160,100,0.7)' }}>
                {target.toLocaleString()}
              </span>
              {!isShort
                ? <span style={{ color: 'rgba(80,160,100,0.6)', fontSize: '10px' }}>✓</span>
                : <span style={{ color: 'rgba(200,140,60,0.5)', fontSize: '10px' }}>↑还差{(target - wordCount).toLocaleString()}</span>
              }
              <div className="w-12 h-1 rounded-full overflow-hidden flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress * 100}%`,
                    background: isShort ? 'rgba(200,140,60,0.5)' : 'rgba(80,160,100,0.5)',
                  }} />
              </div>
            </>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: generating indicator + typography button + target button */}
        {isStreaming && (
          <span className="generating-pulse flex-shrink-0" style={{ color: 'var(--gold)' }}>正在生成…</span>
        )}

        {/* Diff / strikethrough controls */}
        {!isStreaming && (hasAnnotations || dismissedEdits.length > 0) && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setShowDiffs(!showDiffs)}
              title={showDiffs ? '切换到编辑模式，可以直接修改正文' : '查看 AI 的修改标记：删除线=旧文本，绿色=新文本'}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{
                background: showDiffs ? 'rgba(80,180,120,0.12)' : 'transparent',
                border: `1px solid ${showDiffs ? 'rgba(80,180,120,0.3)' : 'var(--border-subtle)'}`,
                color: showDiffs ? 'rgba(80,180,120,0.9)' : 'var(--text-muted)',
                fontSize: '10px',
              }}>
              {showDiffs ? '编辑模式' : `显示标记(${visibleEdits.length + strikes.length})`}
            </button>
            {dismissedEdits.length > 0 && (
              <button
                onClick={() => dismissedEdits.forEach(e => undismissStoryEdit(nodeId, e.id))}
                title="重新显示之前隐藏的修改标记"
                className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-80"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '10px' }}>
                恢复隐藏({dismissedEdits.length})
              </button>
            )}
          </div>
        )}
        {!isStreaming && !showDiffs && (
          <button
            onClick={() => {
              const el = textareaRef.current
              if (!el) return
              const sel = el.value.substring(el.selectionStart, el.selectionEnd)
              if (!sel.trim()) return
              addStrikethrough(nodeId, { id: genId(), text: sel, timestamp: Date.now() })
              setShowDiffs(true)
            }}
            title="先在正文中选中文本，点击此按钮将其标记为划掉 — 划掉的文本不会发送给 AI"
            className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-80 flex-shrink-0"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '10px' }}>
            划掉选中
          </button>
        )}

        {/* Typography settings */}
        <div className="relative flex-shrink-0" ref={typographyRef}>
          <button
            onClick={() => setShowTypography((v) => !v)}
            className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-80"
            style={{
              color: showTypography ? 'var(--gold)' : 'var(--text-muted)',
              border: `1px solid ${showTypography ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
              fontSize: '11px',
              fontFamily: '"Cormorant Garamond", serif',
              fontStyle: 'italic',
              letterSpacing: '0.03em',
            }}>
            Aa
          </button>

          {showTypography && (
            <div
              className="absolute rounded"
              style={{
                bottom: 'calc(100% + 6px)',
                right: 0,
                width: '208px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-gold)',
                boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
                padding: '12px 14px',
                zIndex: 50,
              }}>
              {/* Font size */}
              <div style={{ marginBottom: '10px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '5px', letterSpacing: '0.07em' }}>
                  字号
                </p>
                <div className="flex gap-1">
                  {FONT_SIZES.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setEditorFontSize(value)}
                      className="flex-1 rounded transition-all"
                      style={{
                        fontSize: '10px',
                        padding: '2px 0',
                        background: editorFontSize === value ? 'rgba(201,169,110,0.15)' : 'transparent',
                        border: `1px solid ${editorFontSize === value ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                        color: editorFontSize === value ? 'var(--gold)' : 'var(--text-muted)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line height */}
              <div style={{ marginBottom: '10px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '5px', letterSpacing: '0.07em' }}>
                  行距
                </p>
                <div className="flex gap-1">
                  {LINE_HEIGHTS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setEditorLineHeight(value)}
                      className="flex-1 rounded transition-all"
                      style={{
                        fontSize: '10px',
                        padding: '2px 0',
                        background: editorLineHeight === value ? 'rgba(201,169,110,0.15)' : 'transparent',
                        border: `1px solid ${editorLineHeight === value ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                        color: editorLineHeight === value ? 'var(--gold)' : 'var(--text-muted)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Letter spacing */}
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '5px', letterSpacing: '0.07em' }}>
                  字距
                </p>
                <div className="flex gap-1">
                  {LETTER_SPACINGS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setEditorLetterSpacing(value)}
                      className="flex-1 rounded transition-all"
                      style={{
                        fontSize: '10px',
                        padding: '2px 0',
                        background: editorLetterSpacing === value ? 'rgba(201,169,110,0.15)' : 'transparent',
                        border: `1px solid ${editorLetterSpacing === value ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
                        color: editorLetterSpacing === value ? 'var(--gold)' : 'var(--text-muted)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {editingTarget ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input
              type="text"
              inputMode="numeric"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={handleTargetSave}
              onKeyDown={handleTargetKeyDown}
              placeholder="目标字数"
              autoFocus
              className="text-xs outline-none rounded px-2 py-0.5 w-20"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-gold)',
                color: 'var(--text-primary)',
                fontSize: '11px',
              }}
            />
            <span style={{ fontSize: '10px', opacity: 0.4 }}>Enter</span>
          </div>
        ) : (
          <button
            onClick={handleTargetClick}
            className="flex-shrink-0 text-xs px-2 py-0.5 rounded transition-all hover:opacity-80"
            style={{
              color: target ? 'var(--gold-dim)' : 'var(--text-muted)',
              border: `1px solid ${target ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
              fontSize: '10px',
            }}>
            {target ? `目标 ${target.toLocaleString()}字` : '设目标字数'}
          </button>
        )}
      </div>
    </div>
  )
}
