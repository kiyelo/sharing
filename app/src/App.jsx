import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import Header from './components/Header.jsx'
import MoreScreen from './components/MoreScreen.jsx'
import QueueScreen from './components/QueueScreen.jsx'
import { CircleEditor, CirclePicker, CompletedSheet, ConfirmDialog } from './components/Sheets.jsx'
import { starterData } from './data.js'
import { localRepository } from './services/localRepository.js'
import { hasSupabaseConfig, supabase } from './services/supabaseClient.js'
import { createCircle, createCircleTask, createPersonalTask, deleteCircle, deleteTasks, joinCircleByCode, leaveCircle as leaveRemoteCircle, loadCircles, loadPersonalTasks, updateCircle as updateRemoteCircle, updateMemberPositions, updateTask, updateTaskPositions, loadPreferences, savePreferences, logCompletionEvent, markTasksRead } from './services/supabaseRepository.js'

const tabs = ['home', 'circle', 'more']
const freshStarterData = () => JSON.parse(JSON.stringify(starterData))

export default function App() {
  const [session, setSession] = useState(undefined)
  const [remoteLoading, setRemoteLoading] = useState(hasSupabaseConfig)
  const [syncError, setSyncError] = useState('')
  const [toast, setToast] = useState('')
  const initialUi = useRef((() => { try { return JSON.parse(localStorage.getItem('kkiu-ui-v1')) || {} } catch { return {} } })()).current
  const [tab, setTab] = useState(initialUi.tab || 'home')
  const [data, setData] = useState(() => hasSupabaseConfig ? { ...freshStarterData(), personal: [], circles: [] } : localRepository.load(freshStarterData()))
  const [circleId, setCircleId] = useState(initialUi.circleId || data.circles[0]?.id)
  const [query, setQuery] = useState(null)
  const [filter, setFilter] = useState(initialUi.filter || null)
  const [queuePositions, setQueuePositions] = useState(initialUi.queuePositions || { home: 4, circle: 3 })
  const [circlePickerOpen, setCirclePickerOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [circleEditorOpen, setCircleEditorOpen] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)
  const [focusTaskId, setFocusTaskId] = useState(null)
  const swipeRef = useRef(null)

  useEffect(() => {
    if (!hasSupabaseConfig) { setSession(null); setRemoteLoading(false); return undefined }
    supabase.auth.getSession().then(({ data: authData }) => setSession(authData.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!hasSupabaseConfig || !session?.user) return
    setRemoteLoading(true)
    Promise.all([loadPersonalTasks(session.user.id), loadCircles(session.user.id), loadPreferences(session.user.id)])
      .then(([personal, circles, preferences]) => {
        setData((current) => ({ ...current, personal, circles, settings: { ...current.settings, ...preferences } }))
        setCircleId((current) => circles.some((item) => item.id === current) ? current : circles[0]?.id)
      })
      .catch((error) => setSyncError(error.message))
      .finally(() => setRemoteLoading(false))
  }, [session?.user?.id])

  useEffect(() => { if (!hasSupabaseConfig) localRepository.save(data) }, [data])
  useEffect(() => { localStorage.setItem('kkiu-ui-v1', JSON.stringify({ tab, circleId, filter, queuePositions })) }, [tab, circleId, filter, queuePositions])
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(''), 1700); return () => window.clearTimeout(timer) }, [toast])

  const reportSyncError = (error) => setSyncError(error?.message || '데이터를 저장하지 못했어요.')
  const circle = data.circles.find((item) => item.id === circleId) || data.circles[0]
  const activeMembers = circle?.members || []
  const tasks = tab === 'circle' ? circle?.tasks || [] : data.personal
  const unread = useMemo(() => data.circles.reduce((sum, item) => sum + (item.unread || 0), 0), [data.circles])

  const updateTasks = (updater) => setData((current) => {
    if (tab === 'home') return { ...current, personal: updater(current.personal) }
    return { ...current, circles: current.circles.map((item) => item.id === circle?.id ? { ...item, tasks: updater(item.tasks) } : item) }
  })

  const addTask = (title, assignee = 'me', position) => {
    const task = { id: crypto.randomUUID(), title, assignee, done: false, createdAt: Date.now() }
    const active = tasks.filter((item) => !item.done)
    const completed = tasks.filter((item) => item.done)
    const next = [...active]
    next.splice(Math.max(0, Math.min(position, active.length)), 0, task)
    updateTasks(() => [...next, ...completed])
    setToast(`${Math.max(0, Math.min(position, active.length)) + 1}번째에 끼웠어요`)
    if (session?.user) {
      const create = tab === 'home' ? createPersonalTask(session.user.id, task, position) : createCircleTask(session.user.id, circle.id, task, position)
      create.then(() => updateTaskPositions(next)).catch(reportSyncError)
    }
  }

  const completeTask = (id) => {
    const currentTask = tasks.find((task) => task.id === id)
    if (!currentTask) return
    const activeItems = tasks.filter((item) => !item.done)
    const completedItems = tasks.filter((item) => item.done)
    let nextActive; let nextTasks; let doneAt = currentTask.doneAt
    if (!currentTask.done) {
      doneAt = activeItems.findIndex((item) => item.id === id)
      nextActive = activeItems.filter((item) => item.id !== id)
      nextTasks = [...nextActive, ...completedItems, { ...currentTask, done: true, completedAt: new Date().toISOString(), doneAt }]
    } else {
      const at = Math.max(0, Math.min(currentTask.doneAt ?? activeItems.length, activeItems.length))
      const restored = { ...currentTask, done: false, completedAt: null }
      nextActive = [...activeItems]; nextActive.splice(at, 0, restored)
      nextTasks = [...nextActive, ...completedItems.filter((item) => item.id !== id)]
    }
    updateTasks(() => nextTasks)
    if (session?.user) {
      updateTask(id, { done: !currentTask.done, doneAt }).then(() => updateTaskPositions(nextActive)).catch(reportSyncError)
      if (!currentTask.done) logCompletionEvent(session.user.id, currentTask, tab === 'circle' ? circle?.id : null).catch(reportSyncError)
    }
  }
  const editTask = (id, title) => { updateTasks((current) => current.map((task) => task.id === id ? { ...task, title } : task)); if (session?.user) updateTask(id, { title }).catch(reportSyncError) }
  const setAssignee = (id, assignee) => { updateTasks((current) => current.map((task) => task.id === id ? { ...task, assignee } : task)); if (session?.user) updateTask(id, { assignee }).catch(reportSyncError) }
  const moveTask = (id, direction) => {
    const active = tasks.filter((task) => !task.done), completedItems = tasks.filter((task) => task.done)
    const from = active.findIndex((task) => task.id === id), to = Math.max(0, Math.min(active.length - 1, from + direction))
    if (from < 0 || from === to) return
    const next = [...active], [moved] = next.splice(from, 1); next.splice(to, 0, moved)
    updateTasks(() => [...next, ...completedItems]); if (session?.user) updateTaskPositions(next).catch(reportSyncError)
  }
  const moveTaskTo = (sourceId, targetId) => {
    const active = tasks.filter((task) => !task.done), completedItems = tasks.filter((task) => task.done)
    const from = active.findIndex((task) => task.id === sourceId), to = active.findIndex((task) => task.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...active], [moved] = next.splice(from, 1); next.splice(to, 0, moved)
    updateTasks(() => [...next, ...completedItems]); if (session?.user) updateTaskPositions(next).catch(reportSyncError)
  }

  const toggleSelect = (id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const cancelSelect = () => setSelected(new Set())
  const selectAll = () => setSelected(new Set(tasks.filter((task) => !task.done).map((task) => task.id)))
  const deleteSelected = () => { const ids = [...selected]; updateTasks((current) => current.filter((task) => !selected.has(task.id))); if (session?.user) deleteTasks(ids).catch(reportSyncError); cancelSelect(); setToast(`${ids.length}개를 삭제했어요`) }
  const assignSelected = (assignee) => { const ids = [...selected]; updateTasks((current) => current.map((task) => selected.has(task.id) ? { ...task, assignee } : task)); if (session?.user) Promise.all(ids.map((id) => updateTask(id, { assignee }))).catch(reportSyncError); cancelSelect() }

  const switchTab = (next) => { setTab(next); setQuery(null); setFocusTaskId(null); setCompletedOpen(false); cancelSelect() }
  const selectCircle = (id) => { setCircleId(id); setCirclePickerOpen(false); setFilter(null); setQuery(null) }
  const joinCircle = async (code) => {
    const normalized = code.trim().toUpperCase().replace(/\s+/g, '')
    if (!normalized) return false
    if (session?.user) {
      try {
        const profile = circle?.members.find((m) => m.id === session.user.id) || { name: '나', emoji: '🙂' }
        const id = await joinCircleByCode(normalized, profile.name, profile.emoji)
        const circles = await loadCircles(); setData((current) => ({ ...current, circles })); setCircleId(id); setTab('circle'); setCirclePickerOpen(false); setToast('끼리에 참여했어요'); return true
      } catch (error) { reportSyncError(error); return false }
    }
    const found = data.circles.find((item) => item.code?.toUpperCase() === normalized)
    if (!found) { setToast('초대 코드를 찾을 수 없어요'); return false }
    selectCircle(found.id); setTab('circle'); setToast(`${found.name}에 참여했어요`); return true
  }
  const completed = tasks.filter((task) => task.done)
  const clearCompleted = (ids = completed.map((task) => task.id)) => { const idSet = new Set(ids); updateTasks((current) => current.filter((task) => !idSet.has(task.id))); if (session?.user) deleteTasks(ids).catch(reportSyncError) }
  const requestClearCompleted = (ids = completed.map((task) => task.id)) => setConfirm({ title:'완료 목록 비우기', message:`완료된 할 일 ${ids.length}개를 삭제할까요?`, danger:true, action:()=>clearCompleted(ids) })

  const saveCircle = async ({ name, emoji, profileName, profileEmoji }) => {
    const payload = { name, emoji, profileName, profileEmoji }
    if (circleEditorOpen === 'create') {
      if (session?.user) {
        try { const created = await createCircle(session.user.id, payload); setData((current) => ({ ...current, circles: [...current.circles, created] })); setCircleId(created.id) } catch (error) { reportSyncError(error); return }
      } else {
        const created = { id: crypto.randomUUID(), name, emoji, code: `KKIU-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, members: [{ id: 'me', name: profileName, emoji: profileEmoji, role: 'owner' }], tasks: [], unread: 0, memberUnread: {} }
        setData((current) => ({ ...current, circles: [...current.circles, created] })); setCircleId(created.id)
      }
    } else if (circle) {
      if (session?.user) { try { await updateRemoteCircle(circle.id, session.user.id, payload) } catch (error) { reportSyncError(error); return } }
      setData((current) => ({ ...current, circles: current.circles.map((item) => item.id === circle.id ? { ...item, name, emoji, members: item.members.map((member) => member.id === (session?.user?.id || 'me') ? { ...member, name: profileName, emoji: profileEmoji } : member) } : item) }))
    }
    if (circleEditorOpen === 'create') { setCircleEditorOpen(null); setCirclePickerOpen(false) } else setCircleEditorOpen('edit'); setToast('저장했어요')
  }

  const removeCircle = async () => {
    if (!circle) return
    if (session?.user) { try { await deleteCircle(circle.id) } catch (error) { reportSyncError(error); return } }
    const remaining = data.circles.filter((item) => item.id !== circle.id)
    setData((current) => ({ ...current, circles: remaining })); setCircleId(remaining[0]?.id); setCircleEditorOpen(null); setToast('끼리를 삭제했어요')
  }
  const requestRemoveCircle = () => setConfirm({ title: '이 끼리 삭제', message: `${circle?.name || '끼리'}와 모든 할 일을 삭제할까요?`, danger: true, action: removeCircle })
  const leaveCircle = async () => {
    if (!circle) return
    if (session?.user) { try { await leaveRemoteCircle(circle.id, session.user.id) } catch (error) { reportSyncError(error); return } }
    const remaining = data.circles.filter((item) => item.id !== circle.id)
    setData((current) => ({ ...current, circles: remaining })); setCircleId(remaining[0]?.id); setCircleEditorOpen(null); setToast(`${circle.name}에서 나왔어요`)
  }
  const requestLeaveCircle = () => setConfirm({ title: '끼리 나가기', message: `${circle?.name || '끼리'}에서 나갈까요?`, danger: true, action: leaveCircle })
  const reorderMembers = (members) => {
    if (!circle) return
    setData((current) => ({ ...current, circles: current.circles.map((item) => item.id === circle.id ? { ...item, members } : item) }))
    if (session?.user) updateMemberPositions(circle.id, members).catch(reportSyncError)
  }

  const settingValues = { compact: false, motion: true, notifications: true, language: 'ko', slotLocked: false, slotSymbols: ['🌙', '🍊', '🌿'], ...(data.settings || {}) }
  const markVisibleSourcesRead = useCallback((includeCompleted = false) => {
    if (!circle) return
    const visible = circle.tasks.filter((task) => task.sourceUnread && (includeCompleted ? task.done : !task.done) && (!filter || (task.assignees || [task.assignee]).includes(filter)))
    if (!visible.length) return
    const ids = visible.map((task) => task.id)
    setData((current) => ({ ...current, circles: current.circles.map((item) => {
      if (item.id !== circle.id) return item
      const nextTasks = item.tasks.map((task) => ids.includes(task.id) ? { ...task, sourceUnread: false } : task)
      const unreadTasks = nextTasks.filter((task) => !task.done && task.sourceUnread)
      const memberUnread = {}
      unreadTasks.forEach((task) => (task.assignees || [task.assignee]).filter(Boolean).forEach((id) => { memberUnread[id] = (memberUnread[id] || 0) + 1 }))
      return { ...item, tasks: nextTasks, unread: unreadTasks.length, unreadDone: nextTasks.filter((task) => task.done && task.sourceUnread).length, memberUnread }
    }) }))
    if (session?.user) markTasksRead(session.user.id, ids).catch(reportSyncError)
  }, [circle, filter, session?.user?.id])
  useEffect(() => {
    if (tab !== 'circle' || !circle) return undefined
    const hasUnread = circle.tasks.some((task) => task.sourceUnread && !task.done && (!filter || (task.assignees || [task.assignee]).includes(filter)))
    if (!hasUnread) return undefined
    const timer = window.setTimeout(() => markVisibleSourcesRead(false), 650)
    return () => window.clearTimeout(timer)
  }, [tab, circle?.id, filter, circle?.tasks, markVisibleSourcesRead])
  useEffect(() => {
    if (!completedOpen || tab !== 'circle' || !circle?.tasks.some((task) => task.done && task.sourceUnread)) return undefined
    const timer = window.setTimeout(() => markVisibleSourcesRead(true), 650)
    return () => window.clearTimeout(timer)
  }, [completedOpen, tab, circle?.id, circle?.tasks, markVisibleSourcesRead])
  const persistSettings = (settings) => { if (session?.user) savePreferences(session.user.id,settings).catch(reportSyncError) }
  const toggleSetting = (id) => { const next={ ...settingValues, [id]: !settingValues[id] }; setData((current) => ({ ...current, settings: next })); persistSettings(next) }
  const setLanguage = (language) => { const next={ ...settingValues, language }; setData((current) => ({ ...current, settings: next })); persistSettings(next) }
  const backupData = () => { const blob = new Blob([JSON.stringify({ version: '1.3.0', exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kkiu-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setToast('백업 파일을 만들었어요') }
  const restoreData = async (file) => { try { const parsed = JSON.parse(await file.text()); const next = parsed.data || parsed; if (!Array.isArray(next.personal) || !Array.isArray(next.circles)) throw new Error('끼우 백업 파일이 아니에요.'); setData(next); setCircleId(next.circles[0]?.id); switchTab('home'); setToast('백업을 복원했어요'); return true } catch(error) { setToast(error instanceof SyntaxError?'JSON 파일 형식이 올바르지 않아요.':(error.message||'백업 파일을 복원하지 못했어요.')); return false } }
  const doResetData = () => { const next = freshStarterData(); setData(next); setCircleId(next.circles[0]?.id); switchTab('home'); setToast('초기 데이터로 되돌렸어요') }
  const resetData = () => setConfirm({ title: '전체 초기화', message: '현재 데이터를 지우고 초기 데이터로 되돌릴까요?', danger: true, action: doResetData })
  const emptyData = () => setConfirm({ title: '모든 데이터 제거', message: '개인 할 일, 완료 목록, 끼리와 테스트 뱃지를 모두 비울까요?', danger: true, action: () => { setData((current) => ({ ...current, personal: [], circles: [] })); setCircleId(undefined); setToast('모든 데이터를 비웠어요') } })
  const createUnread = () => { setData((current) => ({ ...current, circles: current.circles.map((c,ci) => ({ ...c, unread: ci===0?Math.min(3,c.tasks.filter((t)=>!t.done).length):0, memberUnread: ci===0?Object.fromEntries(c.members.slice(0,3).map((m)=>[m.id,1])):{}, tasks:c.tasks.map((t,i)=>({...t,sourceUnread:ci===0&&i<3})) })) })); setToast('안읽음 뱃지를 만들었어요') }
  const goToSearchResult = (task) => { if (task.done) { setCompletedOpen(true); return } setFocusTaskId(task.id); setQuery(null) }

  const startSwipe = (event) => {
    if (event.target.closest('button,input,textarea,label,a,.filter-strip,.assignee-row,.sheet-layer,.overlay-dialog')) return
    swipeRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  const endSwipe = (event) => {
    const start = swipeRef.current; swipeRef.current = null
    if (!start || start.id !== event.pointerId || selected.size) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return
    const index = tabs.indexOf(tab), next = Math.max(0, Math.min(tabs.length - 1, index + (dx < 0 ? 1 : -1)))
    if (next !== index) switchTab(tabs[next])
  }

  if (hasSupabaseConfig && session === undefined) return <div className="app-shell"><section className="phone loading-screen">끼우를 준비하고 있어요…</section></div>
  if (hasSupabaseConfig && !session) return <AuthScreen />

  return <div className="wrap">
    <section className={`phone${settingValues.compact ? ' compact-mode' : ''}${settingValues.motion ? '' : ' reduce-motion'}${query!==null?' searching':''}`} onPointerDownCapture={startSwipe} onPointerUpCapture={endSwipe} onPointerCancelCapture={() => { swipeRef.current = null }}>
      <div id="app" className={selected.size ? 'sel-mode' : ''}>
      <Header lang={settingValues.language} tab={tab} circle={circle} searchOpen={query !== null} onSearch={() => setQuery((current) => current === null ? '' : null)} onCircleSelect={() => setCirclePickerOpen(true)} onCompleted={() => setCompletedOpen(true)} onManage={() => setCircleEditorOpen('edit')} />
      {syncError && <button className="sync-error" onClick={() => setSyncError('')}>{syncError}</button>}
      {remoteLoading ? <main className="screen-scroll loading-screen">할 일을 불러오고 있어요…</main> : tab === 'more' ? <MoreScreen values={settingValues} onToggle={toggleSetting} user={session?.user} onSignOut={() => supabase?.auth.signOut()} language={settingValues.language} onLanguage={setLanguage} onBackup={backupData} onRestore={restoreData} onReset={resetData} onSeed={resetData} onEmpty={emptyData} onUnread={createUnread} onStub={setToast} /> : <QueueScreen key={`${tab}-${circle?.id || 'none'}-${focusTaskId || ''}`} tasks={tasks} members={activeMembers} circle={tab === 'circle' ? circle : null} circleMode={tab === 'circle'} onCreateCircle={() => setCircleEditorOpen('create')} query={query} onQuery={setQuery} onSearchResult={goToSearchResult} focusTaskId={focusTaskId} filter={filter} onFilter={setFilter} onAdd={addTask} onComplete={completeTask} onEdit={editTask} onAssignee={setAssignee} onMove={moveTask} onMoveTo={moveTaskTo} selecting={selected.size > 0} selected={selected} onSelect={toggleSelect} onLongPress={(id) => setSelected(new Set([id]))} onSelectAll={selectAll} onDeleteSelected={deleteSelected} onAssignSelected={assignSelected} onCancelSelect={cancelSelect} onCompleted={() => setCompletedOpen(true)} initialPosition={queuePositions[tab]} onPositionChange={(position) => setQueuePositions((current) => current[tab] === position ? current : { ...current, [tab]: position })} language={settingValues.language} />}
      <BottomNav lang={settingValues.language} tab={tab} unread={unread} onChange={switchTab} />
      {toast && <div className="app-toast" role="status">{toast}</div>}
      {circlePickerOpen && <CirclePicker circles={data.circles} selected={circle?.id} onSelect={selectCircle} onJoin={joinCircle} onCreate={() => setCircleEditorOpen('create')} onClose={() => setCirclePickerOpen(false)} />}
      {completedOpen && <CompletedSheet language={settingValues.language} tasks={completed} members={activeMembers} circle={tab === 'circle' ? circle : null} onRestore={completeTask} onDelete={(id) => clearCompleted([id])} onClear={requestClearCompleted} onClose={() => setCompletedOpen(false)} />}
      {circleEditorOpen && <CircleEditor language={settingValues.language} circle={circleEditorOpen === 'edit' ? circle : null} profile={circleEditorOpen === 'edit' ? circle?.members.find((member) => member.id === (session?.user?.id || 'me')) : null} onSave={saveCircle} onInvite={(code) => { navigator.clipboard?.writeText(code).catch(()=>{}); setToast(`초대 코드 ${code}를 복사했어요`) }} onReorder={reorderMembers} onLeave={circleEditorOpen === 'edit' ? requestLeaveCircle : null} onDelete={circleEditorOpen === 'edit' && (circle?.createdBy === (session?.user?.id || 'me') || circle?.members.find((member) => member.id === (session?.user?.id || 'me'))?.role === 'owner') ? requestRemoveCircle : null} onClose={() => setCircleEditorOpen(null)} />}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm.action; setConfirm(null); action?.() }} />}
      </div>
    </section>
  </div>
}
