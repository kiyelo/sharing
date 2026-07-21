import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowIcon, CheckIcon } from './Icons.jsx'

function splitAtWidth(text, width) {
  if (!width || typeof document === 'undefined') return [text, '']
  const canvas = splitAtWidth.canvas || (splitAtWidth.canvas = document.createElement('canvas'))
  const context = canvas.getContext('2d')
  context.font = '580 15.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  if (context.measureText(text).width <= width) return [text, '']
  let low = 1; let high = text.length
  while (low < high) { const middle = (low + high + 1) >> 1; if (context.measureText(text.slice(0, middle)).width <= width) low = middle; else high = middle - 1 }
  return [text.slice(0, low), text.slice(low).trim()]
}

export default function TaskCard({ task, index, members, circle, onComplete, onEdit, onAssignee, onMove, onDragStart, onDragMove, onDragEnd, dragging, reorderable = true, selecting, selected, onSelect, onLongPress, showRank = true, searchHit = false }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(task.title)
  const [leaving, setLeaving] = useState(false)
  const [titleWidth, setTitleWidth] = useState(0)
  const input = useRef(null); const cardRef = useRef(null); const titleRef = useRef(null); const hold = useRef(null); const point = useRef(null)
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.setSelectionRange(value.length, value.length) } }, [editing])
  useLayoutEffect(() => {
    const element = titleRef.current
    if (!element) return undefined
    const measure = () => setTitleWidth(element.clientWidth)
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect()
  }, [editing])
  useEffect(() => { if (!editing) return undefined; const outside = (event) => { if (!cardRef.current?.contains(event.target)) { setValue(task.title); setEditing(false) } }; document.addEventListener('pointerdown', outside, true); return () => document.removeEventListener('pointerdown', outside, true) }, [editing, task.title])
  const save = () => { const next = value.trim(); if (next) onEdit(task.id, next); setEditing(false) }
  const start = (event) => { if (editing || task.done) return; point.current = { x: event.clientX, y: event.clientY }; hold.current = setTimeout(() => onLongPress?.(task.id), 520) }
  const move = (event) => { if (point.current && (Math.abs(event.clientX - point.current.x) > 7 || Math.abs(event.clientY - point.current.y) > 7)) clearTimeout(hold.current) }
  const clear = () => clearTimeout(hold.current)
  const finish = () => { if (task.done || selecting) return; setLeaving(true); window.setTimeout(() => { onComplete(task.id); setLeaving(false) }, 300) }
  const assignedMembers = (task.assignees || [task.assignee]).map((id) => members.find((member) => member.id === id)).filter(Boolean)
  const [line1, line2] = splitAtWidth(task.title, titleWidth)
  return <article ref={cardRef} data-task-id={task.id} className={`card${showRank ? ' hasrank' : ''}${index < 3 && !task.done ? ` t${index + 1}` : ''}${editing ? ' editing' : ''}${selected ? ' sel-on' : ''}${dragging ? ' lift' : ''}${leaving ? ' leaving' : ''}${searchHit ? ' search-hit' : ''}`} onPointerDown={start} onPointerMove={move} onPointerUp={clear} onPointerCancel={clear}>
    <button className={`ck${task.done || selected || leaving ? ' on' : ''}${leaving ? ' pop' : ''}`} aria-label={selecting ? `${selected ? '선택 해제' : '선택'}: ${task.title}` : `할 일 완료: ${task.title}`} data-act={selecting ? 'sel' : 'complete'} data-id={task.id} onClick={() => selecting ? onSelect(task.id) : finish()}>{(task.done || selected || leaving) && <CheckIcon />}</button>
    {showRank && <div className={`rank${index < 3 ? ' top' : ''}`}>#{index + 1}</div>}
    <div className="mid" ref={titleRef}>{editing ? <textarea ref={input} className="edit-text" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save() } if (event.key === 'Escape') { setValue(task.title); setEditing(false) } }} /> : <button className="t-title" data-act="title" data-id={task.id} onClick={() => selecting ? onSelect(task.id) : !task.done && setEditing(true)}><span className="t-main">{line1}</span>{line2 && <span className="t-rest">{line2}</span>}</button>}</div>
    <div className="acts">{!editing && circle && task.sourceUnread && <i className="source-unread-dot" aria-label="처음 확인하는 업데이트" />}{!editing && circle && assignedMembers.length === 1 && <span className="who">{assignedMembers[0].emoji}</span>}{!editing && circle && assignedMembers.length > 1 && <span className="whos">{assignedMembers.slice(0,3).map((member) => <span className="who" key={member.id}>{member.emoji}</span>)}{assignedMembers.length > 3 && <span className="who more">+{assignedMembers.length-3}</span>}</span>}{editing ? <button className="save edit-save" aria-label="수정 저장" data-act="edit-save" data-id={task.id} onClick={save}><ArrowIcon /></button> : !task.done && showRank && reorderable ? <button className="ico grip" data-act="grip" data-id={task.id} aria-label={`순서 변경: ${task.title}`} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onDragStart(task.id) }} onPointerMove={onDragMove} onPointerUp={(event) => { try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}; onDragEnd() }} onPointerCancel={onDragEnd} onKeyDown={(event) => { if (event.key === 'ArrowUp') onMove(task.id, -1); if (event.key === 'ArrowDown') onMove(task.id, 1) }}>⠿</button> : null}</div>
    {editing && circle && <div className="asgrow edit-assignee-picker" aria-label="담당자 선택">{members.map((member) => <button key={member.id} className={`asgc${(task.assignee || task.assignees?.[0]) === member.id ? ' on' : ''}`} data-act="edit-asg-pick" data-m={member.id} data-id={task.id} onClick={() => onAssignee(task.id, member.id)}><span className="av">{member.emoji}</span>{member.name}</button>)}</div>}
  </article>
}
