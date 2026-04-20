import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function GlobalSettings() {
  const { isGlobalSettingsOpen, setIsGlobalSettingsOpen, globalSettings, setGlobalSettings } =
    useStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isGlobalSettingsOpen) {
      setTimeout(() => textareaRef.current?.focus(), 120)
    }
  }, [isGlobalSettingsOpen])

  if (!isGlobalSettingsOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        style={{ background: 'rgba(10,9,18,0.5)' }}
        onClick={() => setIsGlobalSettingsOpen(false)}
      />

      {/* Drawer — flex column, never overflows */}
      <div
        className="fixed right-0 top-0 bottom-0 z-40 flex flex-col drawer-enter"
        style={{
          width: 'min(380px, 100vw)',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-gold)',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.5)',
        }}>

        {/* Header — fixed height */}
        <div
          className="flex-shrink-0 flex items-start justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="min-w-0 pr-3">
            <h2 className="font-serif text-lg" style={{ color: 'var(--text-primary)' }}>
              写作规则
            </h2>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              跨所有项目生效，固定置于上下文最前。
              适合填写通用语言风格、叙事视角、禁止事项等。
            </p>
          </div>
          <button
            onClick={() => setIsGlobalSettingsOpen(false)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        {/* Textarea area — flex-1, min-h-0 prevents overflow */}
        <div className="flex-1 min-h-0 flex flex-col px-6 py-4">
          <textarea
            ref={textareaRef}
            value={globalSettings}
            onChange={(e) => setGlobalSettings(e.target.value)}
            placeholder={'示例：\n\n- 始终用简体中文回复\n- 叙事视角：第三人称限知视角\n- 文风：克制内敛，少用形容词堆砌\n- 每段不超过 150 字'}
            className="flex-1 min-h-0 w-full text-sm resize-none outline-none rounded p-4"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontFamily: '"DM Sans", sans-serif',
              lineHeight: '1.7',
            }}
            spellCheck={false}
          />
        </div>

        {/* Footer — always visible, never pushed off screen */}
        <div
          className="flex-shrink-0 px-6 py-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {globalSettings.length} 字符
            </span>
            {globalSettings.length > 0 && (
              <button
                onClick={() => setGlobalSettings('')}
                className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-70"
                style={{ color: 'rgba(200,80,80,0.6)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '10px' }}>
                清空
              </button>
            )}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', opacity: 0.55 }}>
            优先级：写作规则 &lt; 故事设定 &lt; 状态卡片
          </p>
        </div>
      </div>
    </>
  )
}
