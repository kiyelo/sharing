import { useEffect, useRef, useState } from 'react'
import { ArrowIcon } from './Icons.jsx'
import { t } from '../i18n.js'

export default function Composer({ count, circle, members, onAdd, position = count, onOpenChange, language = 'ko' }) {
  const [open, setOpen] = useState(false); const [value, setValue] = useState(''); const [assignee, setAssignee] = useState(members[0]?.id || 'me'); const ref = useRef(null)
  useEffect(() => { if (open) ref.current?.focus(); onOpenChange?.(open) }, [open, onOpenChange])
  useEffect(() => { if (!members.some((member) => member.id === assignee)) setAssignee(members[0]?.id || 'me') }, [members, assignee])
  const close = () => { setValue(''); setOpen(false) }
  const submit = () => { const next = value.trim(); if (!next) return; onAdd(next, assignee, position); close() }
  return <div className={`slotwrap${open ? ' open' : ''}`}><button className="ins" data-act="slot-open" onClick={() => setOpen(true)}><span className="p">+</span><span>{t(language, 'insert', position + 1)}</span></button><div className="ibar">{circle && <div className="asgrow" aria-label={language === 'en' ? 'Choose assignee' : '담당자 선택'}>{members.map((member) => <button key={member.id} className={`asgc${assignee === member.id ? ' on' : ''}`} data-act="asg-pick" data-m={member.id} onClick={() => setAssignee(member.id)}><span className="av">{member.emoji}</span>{member.name}</button>)}</div>}<span className="ipos">{position + 1}</span><textarea ref={ref} className="si" rows="1" value={value} onChange={(event) => setValue(event.target.value)} placeholder={t(language, 'placeholder')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } if (event.key === 'Escape') close() }} /><button className="save" aria-label={language === 'en' ? 'Add task' : '할 일 추가'} data-act="add-submit" onClick={submit}><ArrowIcon /></button></div></div>
}
