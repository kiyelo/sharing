import { useCallback, useEffect, useMemo, useState } from 'react'
import CircleFilters from './CircleFilters.jsx'
import Composer from './Composer.jsx'
import TaskCard from './TaskCard.jsx'
import useFloatingQueue from '../hooks/useFloatingQueue.js'
import { t } from '../i18n.js'

const H = { task: 72, ghost: 52, bundle: 56, collapse: 42, ad: 100, done: 56 }
const assignees = (task) => task.assignees || (task.assignee ? [task.assignee] : [])
const adBefore = (index) => index === 10 || (index > 10 && (index - 10) % 20 === 0)

function buildModel(active, filter, showContext, expanded, doneCount) {
  const rows = []; const slots = []; let y = 0
  const slot = (globalIndex) => { if (!slots.length || slots[slots.length - 1].globalIndex !== globalIndex) slots.push({ y, globalIndex }) }
  if (!filter) {
    active.forEach((task, globalIndex) => { slot(globalIndex); if (adBefore(globalIndex)) { rows.push({ kind: 'ad', y, key: `ad-${globalIndex}` }); y += H.ad; slot(globalIndex) } rows.push({ kind: 'task', task, globalIndex, y, key: task.id }); y += H.task })
    slots.push({ y, globalIndex: active.length })
  } else if (!showContext) {
    active.forEach((task, globalIndex) => { if (assignees(task).includes(filter)) { slot(globalIndex); rows.push({ kind: 'task', task, globalIndex, y, key: task.id }); y += H.task } })
    slots.push({ y, globalIndex: active.length })
  } else {
    let i = 0
    while (i < active.length) {
      if (assignees(active[i]).includes(filter)) { slot(i); rows.push({ kind: 'task', task: active[i], globalIndex: i, y, key: active[i].id }); y += H.task; i += 1; continue }
      let end = i
      while (end < active.length && !assignees(active[end]).includes(filter)) end += 1
      const key = `${i}-${end}`; const count = end - i
      if (count < 3 || expanded === key) {
        if (count >= 3) { rows.push({ kind: 'collapse', from: i, to: end, y, key }); y += H.collapse }
        for (let cursor = i; cursor < end; cursor += 1) { slot(cursor); rows.push({ kind: 'ghost', task: active[cursor], globalIndex: cursor, y, key: `ghost-${active[cursor].id}` }); y += H.ghost }
      } else { slot(i); rows.push({ kind: 'bundle', from: i, to: end, count, y, key }); y += H.bundle }
      i = end
    }
    slots.push({ y, globalIndex: active.length })
  }
  if (doneCount) { y += 6; rows.push({ kind: 'done', count: doneCount, y, key: 'done' }); y += H.done }
  return { rows, slots, total: y }
}
const markText = (title, query) => { const normalized = query.trim(); if (!normalized) return title; const index = title.toLowerCase().indexOf(normalized.toLowerCase()); return index < 0 ? title : <>{title.slice(0, index)}<mark>{title.slice(index, index + normalized.length)}</mark>{title.slice(index + normalized.length)}</> }

export default function QueueScreen(props) {
  const { tasks, members, circle, circleMode, onCreateCircle, query, onQuery, onSearchResult, focusTaskId, filter, onFilter, onAdd, onComplete, onEdit, onAssignee, onMove, onMoveTo, selecting, selected, onSelect, onLongPress, onSelectAll, onDeleteSelected, onAssignSelected, onCancelSelect, onCompleted, initialPosition = null, onPositionChange, language = 'ko' } = props
  const [draggingId, setDraggingId] = useState(null); const [assignOpen, setAssignOpen] = useState(false); const [composerOpen, setComposerOpen] = useState(false); const [expanded, setExpanded] = useState(null); const [flashId, setFlashId] = useState(focusTaskId)
  useEffect(() => { if (!selecting) setAssignOpen(false) }, [selecting])
  useEffect(() => { if (!focusTaskId) return undefined; setFlashId(focusTaskId); const timer = window.setTimeout(() => setFlashId(null), 2700); return () => window.clearTimeout(timer) }, [focusTaskId])
  useEffect(() => { if (!filter) { setComposerOpen(false); setExpanded(null) } }, [filter])
  const active = useMemo(() => tasks.filter((task) => !task.done), [tasks])
  const completedCount = tasks.length - active.length
  const model = useMemo(() => buildModel(active, circle && filter, composerOpen, expanded, completedCount), [active, circle, filter, composerOpen, expanded, completedCount])
  const wantedGlobal = focusTaskId ? Math.min(active.findIndex((task) => task.id === focusTaskId) + 1, active.length) : initialPosition ?? Math.min(circleMode ? 3 : 4, active.length)
  const initialSlot = Math.max(0, model.slots.findIndex((item) => item.globalIndex >= wantedGlobal))
  const queue = useFloatingQueue(Math.max(0, model.slots.length - 1), initialSlot < 0 ? model.slots.length - 1 : initialSlot, { positions: model.slots.map((item) => item.y), rowHeight: 72 })
  const currentSlot = model.slots[queue.index] || model.slots[0] || { y: 0, globalIndex: 0 }
  useEffect(() => { onPositionChange?.(currentSlot.globalIndex) }, [currentSlot.globalIndex, onPositionChange])
  useEffect(() => { const next = model.slots.findIndex((item) => item.globalIndex >= wantedGlobal); if (next >= 0) queue.setIndex(next) }, [filter, composerOpen, expanded, focusTaskId])
  const dragMove = (event) => { if (!draggingId) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-task-id]')?.dataset.taskId; if (target && target !== draggingId) onMoveTo(draggingId, target) }
  const card = (task, index, extra = {}) => <TaskCard key={extra.key || task.id} task={task} index={index} members={members} circle={circle} onComplete={onComplete} onEdit={onEdit} onAssignee={onAssignee} onMove={onMove} onMoveTo={onMoveTo} onDragStart={setDraggingId} onDragMove={dragMove} onDragEnd={() => setDraggingId(null)} dragging={draggingId === task.id} selecting={selecting} selected={selected.has(task.id)} onSelect={onSelect} onLongPress={onLongPress} searchHit={flashId === task.id} {...extra} />

  if (circleMode && !circle) return <div className="stage"><div className="scroller"><div className="list"><div className="empty"><div className="empty-c"><h3>{language === 'en' ? 'Create a shared task list' : '공유 할 일 목록을 만들어보세요'}</h3></div><button className="featins" data-act="circle-new" onClick={onCreateCircle}><span className="p">+</span>{language === 'en' ? 'Create Circle' : '새 끼리 만들기'}</button></div></div></div></div>
  if (query !== null) { const normalized = query.trim().toLowerCase(); const results = tasks.filter((task) => task.title.toLowerCase().includes(normalized)); const activeResults = results.filter((task) => !task.done); const doneResults = results.filter((task) => task.done); return <div className="stage"><div className="scroller"><div className="list"><input autoFocus className="field" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t(language, 'searchPlaceholder')} />{normalized ? results.length ? <>{activeResults.map((task) => <button className="srow" data-act="search-go" key={task.id} onClick={() => onSearchResult?.(task)}><span className="rankc">#{active.findIndex((item) => item.id === task.id) + 1}</span><span className="stt">{markText(task.title, query)}</span></button>)}{doneResults.length > 0 && <div className="ghead"><span>{language === 'en' ? `Completed · ${doneResults.length}` : `완료됨 · ${doneResults.length}`}</span></div>}{doneResults.map((task) => <button className="srow donem" data-act="search-go" key={task.id} onClick={() => onSearchResult?.(task)}><span className="rankc">#{(task.doneAt ?? 0) + 1}</span><span className="stt">{markText(task.title, query)}</span><span className="dtime">{task.completedAt ? new Date(task.completedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ko-KR') : ''}</span></button>)}</> : <div className="empty"><div className="empty-c"><h3>{t(language, 'noSearch')}</h3></div></div> : <div className="empty"><div className="empty-c"><h3>{t(language, 'searchPlaceholder')}</h3></div></div>}</div></div></div> }
  if (selecting) return <div className="selection-view"><div className="selhead"><button className="selx" aria-label={t(language, 'selectCancel')} data-act="sel-cancel" onClick={onCancelSelect}>×</button><b>{selected.size ? (language === 'en' ? `${selected.size} selected` : `${selected.size}개 선택`) : (language === 'en' ? 'Select tasks' : '할 일 선택')}</b><button className="seltxt" data-act="sel-all" onClick={onSelectAll}>{t(language, 'selectAll')}</button></div><div className="stage"><div className="scroller selscroll"><div className="list">{active.map((task) => card(task, 0, { showRank: false, reorderable: false }))}</div></div></div><div className="seldock"><button className="dbtn" data-act="sel-cancel" onClick={onCancelSelect}>{t(language, 'selectCancel')}</button>{circle && <button className="dbtn" onClick={() => setAssignOpen(!assignOpen)}>{t(language, 'assign')}</button>}<button className="dbtn del" data-act="sel-delete" disabled={!selected.size} onClick={onDeleteSelected}>{t(language, 'delete')}{selected.size ? ` · ${selected.size}` : ''}</button>{assignOpen && <div className="bulk-asg">{members.map((member) => <button key={member.id} onClick={() => onAssignSelected(member.id)}>{member.emoji} {member.name}</button>)}</div>}</div></div>

  return <>{circle && <CircleFilters members={members} value={filter} onChange={onFilter} unread={circle.memberUnread} language={language} />}<div className={`stage q${queue.dragging ? ' dragging' : ''}`} {...queue.gestureProps}><div className="qvp"><div className="qtrack" style={{ top: '50%', transform: `translate3d(0,calc(-${currentSlot.y}px + ${queue.dragY}px),0)` }}>{model.rows.map((row) => { const shift = row.y >= currentSlot.y ? 81 : 2; const style = { top: `${row.y + shift}px` }; if (row.kind === 'task') return <div key={row.key} style={style}>{card(row.task, row.globalIndex, { reorderable: !filter })}</div>; if (row.kind === 'ghost') { const who = members.find((member) => assignees(row.task).includes(member.id)); return <div className="ghostrow" key={row.key} style={style}><span className="grank">#{row.globalIndex + 1}</span><span className="gtitle">{row.task.title}</span>{who && <span className="who">{who.emoji}</span>}</div> } if (row.kind === 'bundle') return <button className="bundle" data-act="bundle" key={row.key} style={style} onClick={() => setExpanded(row.key)}><b>{row.count}개</b> 숨김 · #{row.from + 1}–#{row.to}</button>; if (row.kind === 'collapse') return <button className="colbar" data-act="collapse" key={row.key} style={style} onClick={() => setExpanded(null)}>#{row.from + 1}–#{row.to} 접기</button>; if (row.kind === 'ad') return <div className="adcard" key={row.key} style={style}><span className="adtag">AD</span><div className="adthumb" /><div className="admid"><p>{language === 'en' ? 'Your ad could be here' : '여기에 광고가 표시됩니다'}</p><p className="adsub">{language === 'en' ? 'In-feed native · excluded from ranks' : '인피드 네이티브 · 끼우 번호에서 제외'}</p></div></div>; return <button className="donebtn" data-act="sheet-open" key={row.key} style={style} onClick={onCompleted}>✓ {t(language, 'done', row.count)}</button> })}</div></div>{!active.length && <div className="queueempty"><div className="empty-c"><h3>{t(language, 'empty')}</h3></div></div>}<div className="qfade t" /><div className="qfade b" /><div style={{ position: 'absolute', top: 'calc(50% + 30px)', left: 0, right: 0 }}><Composer count={active.length} circle={circle} members={members} position={currentSlot.globalIndex} onAdd={onAdd} onOpenChange={setComposerOpen} language={language} /></div></div></>
}
