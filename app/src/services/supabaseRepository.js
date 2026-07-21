import { requireSupabase } from './supabaseClient.js'

const taskFromRow = (row) => ({
  id: row.id,
  title: row.title,
  done: Boolean(row.completed_at),
  completedAt: row.completed_at,
  createdAt: new Date(row.created_at).getTime(),
  assignee: row.assignee_id,
  doneAt: row.completed_position == null ? null : Number(row.completed_position),
  position: Number(row.position || 0),
  sourceUnread: Boolean(row.sourceUnread),
})

const memberFromRow = (row) => ({
  id: row.user_id,
  name: row.nickname || '멤버',
  emoji: row.emoji || '🙂',
  role: row.role,
})

export async function loadPersonalTasks(userId) {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .select('id,title,position,completed_position,completed_at,created_at')
    .eq('owner_id', userId)
    .is('circle_id', null)
    .order('position', { ascending: true })

  if (error) throw error
  return data.map(taskFromRow)
}

export async function loadCircles(userId) {
  const client = requireSupabase()
  const { data: circles, error: circleError } = await client
    .from('circles')
    .select('id,name,emoji,invite_code,created_by,created_at')
    .order('created_at', { ascending: true })
  if (circleError) throw circleError
  if (!circles.length) return []

  const ids = circles.map((circle) => circle.id)
  const [{ data: memberRows, error: memberError }, { data: taskRows, error: taskError }] = await Promise.all([
    client.from('circle_members').select('circle_id,user_id,role,nickname,emoji,position,joined_at').in('circle_id', ids).order('position', { ascending: true }),
    client.from('tasks').select('id,owner_id,circle_id,assignee_id,title,position,completed_position,completed_at,created_at,updated_at').in('circle_id', ids).order('position', { ascending: true }),
  ])
  if (memberError) throw memberError
  if (taskError) throw taskError
  let readIds = new Set()
  if (userId && taskRows.length) {
    const { data: receipts, error: receiptError } = await client.from('task_read_receipts').select('task_id').eq('user_id', userId).in('task_id', taskRows.map((row) => row.id))
    if (!receiptError) readIds = new Set((receipts || []).map((row) => row.task_id))
  }
  return circles.map((circle) => {
    const rows = taskRows.filter((row) => row.circle_id === circle.id)
    const tasks = rows.map((row) => taskFromRow({ ...row, sourceUnread: Boolean(userId && row.owner_id !== userId && !readIds.has(row.id)) }))
    const activeUnread = tasks.filter((task) => !task.done && task.sourceUnread)
    const memberUnread = {}
    activeUnread.forEach((task) => (task.assignees || [task.assignee]).filter(Boolean).forEach((id) => { memberUnread[id] = (memberUnread[id] || 0) + 1 }))
    return { id: circle.id, name: circle.name, emoji: circle.emoji, code: circle.invite_code, createdBy: circle.created_by, unread: activeUnread.length, unreadDone: tasks.filter((task) => task.done && task.sourceUnread).length, memberUnread, members: memberRows.filter((row) => row.circle_id === circle.id).map(memberFromRow), tasks }
  })
}

export async function createCircle(userId, { name, emoji, profileName, profileEmoji }) {
  const client = requireSupabase()
  const inviteCode = `KKIU-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
  const { data: circle, error: circleError } = await client
    .from('circles')
    .insert({ name, emoji, invite_code: inviteCode, created_by: userId })
    .select('id,name,emoji,invite_code,created_by')
    .single()
  if (circleError) throw circleError

  const { error: memberError } = await client.from('circle_members').insert({
    circle_id: circle.id,
    user_id: userId,
    role: 'owner',
    nickname: profileName,
    emoji: profileEmoji,
  })
  if (memberError) {
    await client.from('circles').delete().eq('id', circle.id)
    throw memberError
  }

  return {
    id: circle.id,
    name: circle.name,
    emoji: circle.emoji,
    code: circle.invite_code,
    createdBy: circle.created_by,
    unread: 0,
    memberUnread: {},
    members: [{ id: userId, name: profileName, emoji: profileEmoji, role: 'owner' }],
    tasks: [],
  }
}

export async function updateCircle(circleId, userId, { name, emoji, profileName, profileEmoji }) {
  const client = requireSupabase()
  const [{ error: circleError }, { error: memberError }] = await Promise.all([
    client.from('circles').update({ name, emoji }).eq('id', circleId),
    client.from('circle_members').update({ nickname: profileName, emoji: profileEmoji }).eq('circle_id', circleId).eq('user_id', userId),
  ])
  if (circleError) throw circleError
  if (memberError) throw memberError
}

export async function deleteCircle(circleId) {
  const { error } = await requireSupabase().from('circles').delete().eq('id', circleId)
  if (error) throw error
}

export async function joinCircleByCode(code, profileName, profileEmoji) {
  const { data, error } = await requireSupabase().rpc('join_circle_by_code', {
    join_code: code,
    member_name: profileName,
    member_emoji: profileEmoji,
  })
  if (error) throw error
  return data
}

export async function leaveCircle(circleId, userId) {
  const { error } = await requireSupabase().from('circle_members').delete().eq('circle_id', circleId).eq('user_id', userId)
  if (error) throw error
}

export async function updateMemberPositions(circleId, members) {
  const client = requireSupabase()
  const results = await Promise.all(members.map((member, position) => client.from('circle_members').update({ position }).eq('circle_id', circleId).eq('user_id', member.id)))
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

export async function createCircleTask(userId, circleId, task, position) {
  const { error } = await requireSupabase().from('tasks').insert({
    id: task.id,
    owner_id: userId,
    circle_id: circleId,
    assignee_id: task.assignee || null,
    title: task.title,
    position,
  })
  if (error) throw error
}

export async function createPersonalTask(userId, task, position) {
  const { error } = await requireSupabase().from('tasks').insert({
    id: task.id,
    owner_id: userId,
    title: task.title,
    position,
  })
  if (error) throw error
}

export async function updatePersonalTask(taskId, changes) {
  const payload = {}
  if (changes.title !== undefined) payload.title = changes.title
  if (changes.done !== undefined) { payload.completed_at = changes.done ? new Date().toISOString() : null; payload.completed_position = changes.done ? (changes.doneAt ?? null) : null }
  if (changes.assignee !== undefined) payload.assignee_id = changes.assignee || null
  const { error } = await requireSupabase().from('tasks').update(payload).eq('id', taskId)
  if (error) throw error
}

export const updateTask = updatePersonalTask

export async function updatePersonalPositions(tasks) {
  const client = requireSupabase()
  const results = await Promise.all(tasks.map((task, position) => client.from('tasks').update({ position }).eq('id', task.id)))
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

export const updateTaskPositions = updatePersonalPositions

export async function deletePersonalTasks(taskIds) {
  if (!taskIds.length) return
  const { error } = await requireSupabase().from('tasks').delete().in('id', taskIds)
  if (error) throw error
}

export const deleteTasks = deletePersonalTasks

export async function loadPreferences(userId) {
  const { data, error } = await requireSupabase().from('profiles').select('preferences').eq('user_id', userId).single()
  if (error) throw error
  return data?.preferences || {}
}

export async function savePreferences(userId, preferences) {
  const { error } = await requireSupabase().from('profiles').update({ preferences }).eq('user_id', userId)
  if (error) throw error
}

export async function markTasksRead(userId, taskIds) {
  if (!taskIds.length) return
  const rows = taskIds.map((taskId) => ({ task_id: taskId, user_id: userId, seen_at: new Date().toISOString() }))
  const { error } = await requireSupabase().from('task_read_receipts').upsert(rows, { onConflict: 'task_id,user_id' })
  if (error) throw error
}

export async function loadReadTaskIds(userId, taskIds) {
  if (!taskIds.length) return []
  const { data, error } = await requireSupabase().from('task_read_receipts').select('task_id').eq('user_id', userId).in('task_id', taskIds)
  if (error) throw error
  return data.map((row) => row.task_id)
}

export async function logCompletionEvent(userId, task, circleId = null) {
  const created = typeof task.createdAt === 'number' ? task.createdAt : new Date(task.createdAt || Date.now()).getTime()
  const { error } = await requireSupabase().from('completion_events').insert({ task_id: task.id, user_id: userId, circle_id: circleId, title: task.title, lead_ms: Math.max(0, Date.now() - created) })
  if (error) throw error
}

export async function loadCompletionEvents(userId, limit = 100) {
  const { data, error } = await requireSupabase().from('completion_events').select('id,task_id,circle_id,title,lead_ms,completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data
}
