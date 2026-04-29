import { useState } from 'react'
import { useStore } from '../store'
import { CharacterCard } from '../types'

export default function CharacterPanel() {
  const { characterCards, addCharacterCard, updateCharacterCard, removeCharacterCard, addCharacterEvent, removeCharacterEvent } = useStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<{ charId: string; field: string } | null>(null)

  const handleAdd = () => {
    const id = addCharacterCard('新人物')
    setExpandedId(id)
    setEditingField({ charId: id, field: 'name' })
  }

  const handleAddEvent = (charId: string) => {
    addCharacterEvent(charId, { nodeTitle: '', description: '', changes: '' })
  }

  return (
    <div className="flex flex-col gap-2">
      {characterCards.length === 0 && (
        <div className="text-center py-6" style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.5, lineHeight: 1.8 }}>
          暂无人物卡片
          <br />
          <span style={{ fontSize: '10px' }}>点击下方按钮添加，AI 写作后会自动更新</span>
        </div>
      )}

      {characterCards.map((char) => (
        <CardItem
          key={char.id}
          char={char}
          expanded={expandedId === char.id}
          onToggle={() => setExpandedId(expandedId === char.id ? null : char.id)}
          editingField={editingField?.charId === char.id ? editingField.field : null}
          onEditField={(field) => setEditingField(field ? { charId: char.id, field } : null)}
          onUpdate={(data) => updateCharacterCard(char.id, data)}
          onRemove={() => { removeCharacterCard(char.id); if (expandedId === char.id) setExpandedId(null) }}
          onAddEvent={() => handleAddEvent(char.id)}
          onRemoveEvent={(eventId) => removeCharacterEvent(char.id, eventId)}
          onUpdateEvent={(eventId, data) => {
            const events = char.events.map((e) => e.id === eventId ? { ...e, ...data } : e)
            updateCharacterCard(char.id, { events } as Partial<Omit<CharacterCard, 'id' | 'events' | 'createdAt'>> & { events: typeof events })
          }}
        />
      ))}

      <button
        onClick={handleAdd}
        className="w-full py-1.5 rounded text-xs transition-all hover:brightness-110"
        style={{
          background: 'rgba(201,169,110,0.1)',
          border: '1px dashed var(--border-gold)',
          color: 'var(--gold)',
          fontSize: '11px',
        }}
      >
        + 添加人物
      </button>
    </div>
  )
}

interface CardItemProps {
  char: CharacterCard
  expanded: boolean
  onToggle: () => void
  editingField: string | null
  onEditField: (field: string | null) => void
  onUpdate: (data: Record<string, unknown>) => void
  onRemove: () => void
  onAddEvent: () => void
  onRemoveEvent: (eventId: string) => void
  onUpdateEvent: (eventId: string, data: Record<string, string>) => void
}

function CardItem({ char, expanded, onToggle, editingField, onEditField, onUpdate, onRemove, onAddEvent, onRemoveEvent, onUpdateEvent }: CardItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fieldStyle: React.CSSProperties = {
    background: 'rgba(58,95,130,0.04)',
    border: '1px solid rgba(58,95,130,0.12)',
    borderRadius: '4px',
    padding: '6px 8px',
    color: 'var(--text-primary)',
    fontSize: '11px',
    lineHeight: 1.6,
    width: '100%',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: '"DM Sans", sans-serif',
  }

  const labelStyle: React.CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.03em',
    marginBottom: '3px',
  }

  return (
    <div className="rounded" style={{
      background: expanded ? 'rgba(201,169,110,0.04)' : 'transparent',
      border: `1px solid ${expanded ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
      transition: 'all 0.15s ease',
    }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 py-2 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: 'var(--gold)', fontSize: '10px' }}>
            {expanded ? '▾' : '▸'}
          </span>
          {editingField === 'name' ? (
            <input
              autoFocus
              defaultValue={char.name}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { onUpdate({ name: e.target.value || '未命名' }); onEditField(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="outline-none bg-transparent"
              style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 500, width: '100%', borderBottom: '1px solid var(--gold)' }}
            />
          ) : (
            <span
              className="truncate"
              style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 500 }}
              onDoubleClick={(e) => { e.stopPropagation(); onEditField('name') }}
            >
              {char.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {char.events.length > 0 && (
            <span className="px-1 rounded-full" style={{ background: 'rgba(180,140,90,0.2)', color: '#b8916a', fontSize: '9px' }}>
              {char.events.length}
            </span>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {/* Base info */}
          <div className="mt-2">
            <div style={labelStyle}>基本信息</div>
            <textarea
              value={char.baseInfo}
              onChange={(e) => onUpdate({ baseInfo: e.target.value })}
              placeholder="身份、外貌、背景…"
              rows={2}
              style={fieldStyle}
            />
          </div>

          {/* Speech style */}
          <div>
            <div style={labelStyle}>说话方式</div>
            <textarea
              value={char.speechStyle}
              onChange={(e) => onUpdate({ speechStyle: e.target.value })}
              placeholder="口头禅、语气特征、用词习惯…"
              rows={2}
              style={fieldStyle}
            />
          </div>

          {/* Personality */}
          <div>
            <div style={labelStyle}>性格 / 脾气</div>
            <textarea
              value={char.personality}
              onChange={(e) => onUpdate({ personality: e.target.value })}
              placeholder="性格特征、行为倾向、处事方式…"
              rows={2}
              style={fieldStyle}
            />
          </div>

          {/* Events timeline */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div style={labelStyle}>变化记录</div>
              <button
                onClick={onAddEvent}
                className="text-xs hover:opacity-80 transition-all"
                style={{ color: 'var(--gold-dim)', fontSize: '10px' }}
              >
                + 添加
              </button>
            </div>

            {char.events.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.4, padding: '4px 0' }}>
                暂无变化记录，AI 生成正文后会自动补充
              </div>
            )}

            {char.events.map((ev) => (
              <div key={ev.id} className="mb-1.5 rounded px-2 py-1.5" style={{
                background: 'rgba(0,0,0,0.1)',
                border: '1px solid rgba(58,95,130,0.08)',
                fontSize: '11px',
              }}>
                <div className="flex items-center justify-between mb-1">
                  <input
                    value={ev.nodeTitle}
                    onChange={(e) => onUpdateEvent(ev.id, { nodeTitle: e.target.value })}
                    placeholder="章节名"
                    className="outline-none bg-transparent"
                    style={{ color: 'var(--gold-dim)', fontSize: '10px', fontWeight: 500, width: '60%' }}
                  />
                  <button
                    onClick={() => onRemoveEvent(ev.id)}
                    className="hover:opacity-60 transition-all"
                    style={{ color: 'var(--text-muted)', fontSize: '10px' }}
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  value={ev.description}
                  onChange={(e) => onUpdateEvent(ev.id, { description: e.target.value })}
                  placeholder="发生了什么…"
                  rows={1}
                  style={{ ...fieldStyle, fontSize: '10px', padding: '4px 6px', marginBottom: '3px' }}
                />
                <textarea
                  value={ev.changes}
                  onChange={(e) => onUpdateEvent(ev.id, { changes: e.target.value })}
                  placeholder="人物因此发生了什么改变…"
                  rows={1}
                  style={{ ...fieldStyle, fontSize: '10px', padding: '4px 6px', borderLeft: '2px solid var(--gold-dim)' }}
                />
              </div>
            ))}
          </div>

          {/* Delete button */}
          <div className="flex justify-end mt-1">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>确认删除？</span>
                <button onClick={onRemove} className="text-xs px-1.5 py-0.5 rounded hover:opacity-80"
                  style={{ color: 'rgba(200,80,80,0.8)', border: '1px solid rgba(200,80,80,0.3)', fontSize: '10px' }}>
                  删除
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-1.5 py-0.5 rounded hover:opacity-80"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '10px' }}>
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs hover:opacity-80 transition-all"
                style={{ color: 'rgba(200,80,80,0.5)', fontSize: '10px' }}
              >
                删除人物
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
