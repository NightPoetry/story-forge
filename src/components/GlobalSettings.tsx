import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function GlobalSettings() {
  const {
    isGlobalSettingsOpen, setIsGlobalSettingsOpen,
    globalSettings, setGlobalSettings,
    aiWritingRules, setAiWritingRules,
  } = useStore()
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
              手动规则跨项目生效，AI 规则为当前项目独立配置。
            </p>
          </div>
          <button
            onClick={() => setIsGlobalSettingsOpen(false)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-all hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        {/* Two-section content area */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {/* Top section: Manual rules */}
          <div className="flex-shrink-0 px-6 pt-4 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                手动规则（全局）
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                {globalSettings.length} 字符
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={globalSettings}
              onChange={(e) => setGlobalSettings(e.target.value)}
              placeholder={'示例：\n- 始终用简体中文回复\n- 叙事视角：第三人称限知视角\n- 文风：克制内敛，少用形容词堆砌'}
              className="w-full text-sm resize-none outline-none rounded p-3"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: '"DM Sans", sans-serif',
                lineHeight: '1.7',
                minHeight: '100px',
                maxHeight: '200px',
              }}
              spellCheck={false}
            />
          </div>

          {/* Divider */}
          <div className="flex-shrink-0 px-6 py-1">
            <div style={{ borderTop: '1px solid var(--border-subtle)' }} />
          </div>

          {/* Bottom section: AI-managed rules */}
          <div className="flex-1 min-h-0 flex flex-col px-6 pt-2 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                  AI 规则（本项目）
                </span>
                <span className="px-1 py-0.5 rounded text-xs"
                  style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--gold)', fontSize: '9px', letterSpacing: '0.04em' }}>
                  可对话编辑
                </span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                {aiWritingRules.length} 字符
              </span>
            </div>
            <textarea
              value={aiWritingRules}
              onChange={(e) => setAiWritingRules(e.target.value)}
              placeholder={'由 AI 通过对话自动生成或编辑。\n你也可以在这里手动修改。\n\n在对话中输入类似指令：\n「把写作风格改为轻松幽默」\n「增加一条规则：避免使用感叹号」'}
              className="flex-1 min-h-0 w-full text-sm resize-none outline-none rounded p-3"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid rgba(201,169,110,0.2)',
                color: 'var(--text-primary)',
                fontFamily: '"DM Sans", sans-serif',
                lineHeight: '1.7',
                minHeight: '120px',
              }}
              spellCheck={false}
            />
          </div>
        </div>

        {/* Footer — always visible, never pushed off screen */}
        <div
          className="flex-shrink-0 px-6 py-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', opacity: 0.55, fontSize: '10px' }}>
              优先级：写作规则 &lt; 故事设定 &lt; 状态卡片
            </p>
            <div className="flex gap-2">
              {aiWritingRules.length > 0 && (
                <button
                  onClick={() => setAiWritingRules('')}
                  className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-70"
                  style={{ color: 'rgba(200,80,80,0.6)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '10px' }}>
                  清空 AI
                </button>
              )}
              {globalSettings.length > 0 && (
                <button
                  onClick={() => setGlobalSettings('')}
                  className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-70"
                  style={{ color: 'rgba(200,80,80,0.6)', border: '1px solid rgba(200,80,80,0.2)', fontSize: '10px' }}>
                  清空手动
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
