import { useEffect, useMemo, useRef, useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import Header from './components/Header.jsx'
import MoreScreen from './components/MoreScreen.jsx'
import QueueScreen from './components/QueueScreen.jsx'
import { CircleEditor, CirclePicker, CompletedSheet } from './components/Sheets.jsx'
import { starterData } from './data.js'
import { localRepository } from './services/localRepository.js'
import { hasSupabaseConfig, supabase } from './services/supabaseClient.js'
import { createCircle, createCircleTask, createPersonalTask, deleteCircle, deleteTasks, loadCircles, loadPersonalTasks, updateCircle as updateRemoteCircle, updateTask, updateTaskPositions } from './services/supabaseRepository.js'

const tabs = ['home', 'circle', 'more']
const freshStarterData = () => JSON.parse(JSON.stringify(starterData))

export default function App() {
  const [session, setSession] = useState(undefined)
  const [remoteLoading, setRemoteLoading] = useState(hasSupabaseConfig)
  const [syncError, setSyncError] = useState('')
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState('home')
  const [data, setData] = useState(() => hasSupabaseConfig ? { ...freshStarterData(), personal: [], circles: [] } : localRepository.load(freshStarterData()))
  const [circleId, setCircleId] = useState(data.circles[0]?.id)
  const [query, setQuery] = useState(null)
  const [filter, setFilter] = useState(null)
  const [circlePickerOpen, setCirclePickerOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [circleEditorOpen, setCircleEditorOpen] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
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
    Promise.all([loadPersonalTasks(session.user.id), loadCircles()])
      .then(([personal, circles]) => {
        setData((current) => ({ ...current, personal, circles }))
        setCircleId((current) => circles.some((item) => item.id === current) ? current : circles[0]?.id)
      })
      .catch((error) => setSyncError(error.message))
      .finally(() => setRemoteLoading(false))
  }, [session?.user?.id])

  useEffect(() => { if (!hasSupabaseConfig) localRepository.save(data) }, [data])
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(''), 1700); return () => window.clearTimeout(timer) }, [toast])

  const reportSyncError = (error) => setSyncError(error?.message || '데이터를 저장하지 못했어요.')
  const circle = data.circles.find((item) => item.id === circleId) || data.circles[0]
  const activeMembers = circle?.members || []
  const tasks = tab === 'circle' ? circle?.tasks || [] : data.personal
  const unread = useMemo(() => data.circles.reduce((sum, item) => sum + (item.unread || 0), 0), [data.circles])

  const updateTasks = (updater) => setData((current) => {
    if (tab === 'home') return { ...current, personal: updater(current.personal) }
    return { ...current, circles: current.circles.map((item) => item.id === circle?.id ? { ...item, tasks: updater(item.tasks), unread: 0 } : item) }
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
    updateTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done, completedAt: task.done ? null : new Date().toISOString(), doneAt: task.done ? null : current.filter((item) => !item.done).findIndex((item) => item.id === id) } : task))
    if (currentTask && session?.user) updateTask(id, { done: !currentTask.done }).catch(reportSyncError)
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

  const switchTab = (next) => { setTab(next); setQuery(null); setFilter(null); setCompletedOpen(false); cancelSelect() }
  const selectCircle = (id) => { setCircleId(id); setData((current) => ({ ...current, circles: current.circles.map((item) => item.id === id ? { ...item, unread: 0 } : item) })); setCirclePickerOpen(false); setFilter(null); setQuery(null) }
  const completed = tasks.filter((task) => task.done)
  const clearCompleted = (ids = completed.map((task) => task.id)) => { const idSet = new Set(ids); updateTasks((current) => current.filter((task) => !idSet.has(task.id))); if (session?.user) deleteTasks(ids).catch(reportSyncError); if (ids.length === completed.length) setCompletedOpen(false) }

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
    setCircleEditorOpen(null); setCirclePickerOpen(false); setToast('저장했어요')
  }

  const removeCircle = async () => {
    if (!circle) return
    if (session?.user) { try { await deleteCircle(circle.id) } catch (error) { reportSyncError(error); return } }
    const remaining = data.circles.filter((item) => item.id !== circle.id)
    setData((current) => ({ ...current, circles: remaining })); setCircleId(remaining[0]?.id); setCircleEditorOpen(null); setToast('끼리를 삭제했어요')
  }

  const settingValues = { compact: false, motion: true, notifications: true, language: 'ko', slotLocked: false, slotSymbols: ['🌙', '🍊', '🌿'], ...(data.settings || {}) }
  const toggleSetting = (id) => setData((current) => ({ ...current, settings: { ...settingValues, [id]: !settingValues[id] } }))
  const setLanguage = (language) => setData((current) => ({ ...current, settings: { ...settingValues, language } }))
  const backupData = () => { const blob = new Blob([JSON.stringify({ version: '0.7.0', exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kkiu-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setToast('백업 파일을 만들었어요') }
  const restoreData = async (file) => { const parsed = JSON.parse(await file.text()); const next = parsed.data || parsed; if (!Array.isArray(next.personal) || !Array.isArray(next.circles)) throw new Error('끼우 백업 파일이 아니에요.'); setData(next); setCircleId(next.circles[0]?.id); switchTab('home'); setToast('백업을 복원했어요') }
  const resetData = () => { if (!window.confirm('현재 로컬 데이터를 지우고 초기 데이터로 되돌릴까요?')) return; const next = freshStarterData(); setData(next); setCircleId(next.circles[0]?.id); switchTab('home'); setToast('초기 데이터로 되돌렸어요') }

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

  return <div className={`app-shell${settingValues.compact ? ' compact-mode' : ''}${settingValues.motion ? '' : ' reduce-motion'}`}>
    <section className="phone" onPointerDownCapture={startSwipe} onPointerUpCapture={endSwipe} onPointerCancelCapture={() => { swipeRef.current = null }}>
      <Header tab={tab} circle={circle} searchOpen={query !== null} onSearch={() => setQuery((current) => current === null ? '' : null)} onCircleSelect={() => setCirclePickerOpen(true)} onCompleted={() => setCompletedOpen(true)} onManage={() => setCircleEditorOpen('edit')} />
      {syncError && <button className="sync-error" onClick={() => setSyncError('')}>{syncError}</button>}
      {remoteLoading ? <main className="screen-scroll loading-screen">할 일을 불러오고 있어요…</main> : tab === 'more' ? <MoreScreen values={settingValues} onToggle={toggleSetting} user={session?.user} onSignOut={() => supabase?.auth.signOut()} language={settingValues.language} onLanguage={setLanguage} onBackup={backupData} onRestore={restoreData} onReset={resetData} /> : <QueueScreen key={`${tab}-${circle?.id || 'none'}`} tasks={tasks} members={activeMembers} circle={tab === 'circle' ? circle : null} circleMode={tab === 'circle'} onCreateCircle={() => setCircleEditorOpen('create')} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onAdd={addTask} onComplete={completeTask} onEdit={editTask} onAssignee={setAssignee} onMove={moveTask} onMoveTo={moveTaskTo} selecting={selected.size > 0} selected={selected} onSelect={toggleSelect} onLongPress={(id) => setSelected(new Set([id]))} onSelectAll={selectAll} onDeleteSelected={deleteSelected} onAssignSelected={assignSelected} onCancelSelect={cancelSelect} />}
      <BottomNav tab={tab} unread={unread} onChange={switchTab} />
      {toast && <div className="app-toast" role="status">{toast}</div>}
      {circlePickerOpen && <CirclePicker circles={data.circles} selected={circle?.id} onSelect={selectCircle} onCreate={() => setCircleEditorOpen('create')} onClose={() => setCirclePickerOpen(false)} />}
      {completedOpen && <CompletedSheet tasks={completed} members={activeMembers} circle={tab === 'circle' ? circle : null} onRestore={completeTask} onDelete={(id) => clearCompleted([id])} onClear={() => clearCompleted()} onClose={() => setCompletedOpen(false)} />}
      {circleEditorOpen && <CircleEditor circle={circleEditorOpen === 'edit' ? circle : null} profile={circleEditorOpen === 'edit' ? circle?.members.find((member) => member.id === (session?.user?.id || 'me')) : null} onSave={saveCircle} onDelete={circleEditorOpen === 'edit' ? removeCircle : null} onClose={() => setCircleEditorOpen(null)} />}
    </section>
  </div>
}
