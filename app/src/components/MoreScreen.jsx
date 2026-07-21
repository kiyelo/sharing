import { useEffect, useMemo, useRef, useState } from 'react'
import useFloatingQueue from '../hooks/useFloatingQueue.js'
import {t} from '../i18n.js'

const icons={account:'👤',bell:'🔔',shield:'🛡️',mail:'✉️',reset:'⟲',starter:'↺',remove:'⌫',unread:'!'}
const SLOT_KEY='kkiu-more-slot-v1'
const loadSlot=()=>{try{return JSON.parse(localStorage.getItem(SLOT_KEY))||{locked:false,symbols:['🌙','🍊','🌿']}}catch{return{locked:false,symbols:['🌙','🍊','🌿']}}}

function Row({icon,label,tail='›',onClick,danger=false,sub,action}){
 return <button className={`rbtn more-row${danger?' danger':''}`} data-act={action} onClick={onClick}><span className="mlead"><span className="mrank">{icon}</span><span>{label}{sub&&<em>{sub}</em>}</span></span><span>{tail}</span></button>
}

export default function MoreScreen({values,onToggle,user,onSignOut,language='ko',onLanguage,onBackup,onRestore,onReset,onSeed,onEmpty,onUnread,onStub}){
 const fileRef=useRef(null),lastQueueIndex=useRef(null),initial=useMemo(loadSlot,[]),[locked,setLocked]=useState(initial.locked),[symbols,setSymbols]=useState(initial.symbols),[history,setHistory]=useState(false)
 useEffect(()=>{localStorage.setItem(SLOT_KEY,JSON.stringify({locked,symbols}))},[locked,symbols])
 const restore=e=>{const file=e.target.files?.[0];if(file)onRestore?.(file);e.target.value=''}
 const stub=label=>()=>onStub?.(`${label} 기능을 준비하고 있어요`)
 const items=useMemo(()=>[
  {h:82,node:<div className="more-qsection"><p className="more-section-label">{t(language,'account')}</p><Row action="stub" icon={icons.account} label={t(language,'accountManage')} sub={user?.email||t(language,'soon')} onClick={stub(t(language,'accountManage'))}/></div>},
  {h:64,node:<Row action="notifications" icon={icons.bell} label={t(language,'notification')} sub={values.notifications?(language==='en'?'On':'사용'):(language==='en'?'Off':'끔')} onClick={()=>onToggle('notifications')}/>},
  {h:116,node:<div className="more-qsection"><p className="more-section-label">{t(language,'preferences')}</p><div className="pcard more-language"><div className="mlead"><span className="mrank">🌐</span><h3>{t(language,'language')}</h3></div><div className="more-langbar"><button data-act="lang" className={`more-lang${language==='ko'?' on':''}`} onClick={()=>onLanguage?.('ko')}>한국어</button><button data-act="lang" className={`more-lang${language==='en'?' on':''}`} onClick={()=>onLanguage?.('en')}>English</button></div></div></div>},
  {h:64,node:<Row action="stub" icon={icons.shield} label={t(language,'terms')} onClick={stub(t(language,'terms'))}/>},
  {h:64,node:<Row action="stub" icon={icons.mail} label={t(language,'contact')} onClick={stub(t(language,'contact'))}/>},
  {h:24,node:<div className="more-divider"/>},
  {h:82,node:<div className="more-qsection"><p className="more-section-label">{t(language,'data')}</p><Row action="reset" icon={icons.reset} label={t(language,'reset')} tail="⟲" onClick={onReset} danger/></div>},
  {h:64,node:<Row action="backup" icon="⬇️" label={language==='en'?'Back up data':'데이터 백업'} onClick={onBackup}/>},
  {h:64,node:<Row action="restore-data" icon="⬆️" label={language==='en'?'Restore data':'데이터 복원'} onClick={()=>fileRef.current?.click()}/>},
  {h:82,node:<div className="more-qsection"><p className="more-section-label">{t(language,'testTools')}</p><Row action="test-seed" icon={icons.starter} label={t(language,'seed')} tail="⟲" onClick={onSeed||onReset}/></div>},
  {h:64,node:<Row action="test-empty" icon={icons.remove} label={t(language,'emptyData')} onClick={onEmpty||onReset} danger/>},
  {h:64,node:<Row action="test-unread" icon={icons.unread} label={t(language,'unread')} tail="•" onClick={onUnread}/>},
  {h:54,node:<button className="more-version" data-act="history" onClick={()=>setHistory(true)}>{t(language,'version')} v18.4.8 <span>·</span><span>{t(language,'history')}</span><span>›</span></button>},
  ...(user?[{h:54,node:<button className="more-version signout" data-act="signout" onClick={onSignOut}>{language==='en'?'Sign out':'로그아웃'}</button>}]:[])
 ],[values.notifications,user,language,onToggle,onLanguage,onBackup,onReset,onSeed,onEmpty,onUnread,onSignOut,onStub])
 const positions=[];let cursor=0;items.forEach(item=>{positions.push(cursor);cursor+=item.h+8})
 const q=useFloatingQueue(items.length,0,{rowHeight:72});const offset=positions[Math.min(q.index,positions.length-1)]||0
 useEffect(()=>{if(lastQueueIndex.current===null){lastQueueIndex.current=q.index;return}if(lastQueueIndex.current!==q.index&&!locked){lastQueueIndex.current=q.index;const pool=['🌙','🍊','🌿','🔥','⭐'];setSymbols([0,1,2].map(()=>pool[Math.floor(Math.random()*pool.length)]))}},[q.index,locked])
 const roll=()=>{if(locked){setLocked(false);setSymbols(symbols.map(()=>['🌙','🍊','🌿','🔥','⭐'][Math.floor(Math.random()*5)]))}else setLocked(true)}
 return <div className="stage q more-qstage" {...q.gestureProps}><div className="qvp"><div className="qtrack more-qtrack" style={{top:'50%',transform:`translate3d(0,calc(-${offset}px + ${q.dragY}px),0)`}}>{items.map((item,i)=><div className="more-qitem" key={i} style={{top:`${positions[i]+69}px`}}>{item.node}</div>)}</div></div><div className="qfade t"/><div className="qfade b"/><div className="slotwrap" style={{top:'calc(50% + 30px)'}}><button className={`ins quip emoji-slot-btn${locked?' locked':''}`} data-act="quip-next" onClick={roll}><span className="emoji-reels">{symbols.map((s,i)=><i className="emoji-reel" key={i}>{s}</i>)}</span><span className="slot-mode">{locked?'🔒':'↻'}</span></button></div><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={restore}/>{history&&<div className="modalwrap on"><button className="scrim" data-act="modal-cancel" onClick={()=>setHistory(false)}/><div className="modal history-modal"><h3>{t(language,'history')}</h3><ul><li><b>v18.4.8</b> React 네이티브 전체 플로우 이식</li><li><b>v18.4.7</b> 끼리·완료·검색 동작 개선</li><li><b>v18.4.6</b> 모바일 큐와 접근성 보강</li></ul><div className="mrow"><button className="mbtn primary" onClick={()=>setHistory(false)}>{language==='en'?'Close':'닫기'}</button></div></div></div>}</div>
}
