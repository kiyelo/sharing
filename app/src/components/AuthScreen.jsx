import { useMemo, useState } from 'react'
import { getAuthRedirectUrl, requireSupabase } from '../services/supabaseClient.js'

export default function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const initialMessage = useMemo(() => {
    const values = new URLSearchParams(`${window.location.search.slice(1)}&${window.location.hash.slice(1)}`)
    const errorCode = values.get('error_code')
    if (errorCode === 'otp_expired') return '인증 링크가 이미 사용되었거나 만료됐어요. 새 확인 메일을 받아주세요.'
    return values.get('error_description')?.replaceAll('+', ' ') || ''
  }, [])
  const [message, setMessage] = useState(initialMessage)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const client = requireSupabase()
      const result = mode === 'signup'
        ? await client.auth.signUp({ email, password, options: { data: { name: name.trim() || '나' }, emailRedirectTo: getAuthRedirectUrl() } })
        : await client.auth.signInWithPassword({ email, password })

      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) {
        setAwaitingConfirmation(true)
        setMessage('확인 메일을 보냈어요. 메일에서 가입을 완료해주세요.')
      }
    } catch (error) {
      setMessage(error.message || '로그인 중 문제가 생겼어요.')
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async () => {
    if (!email) { setMessage('비밀번호를 재설정할 이메일을 먼저 적어주세요.'); return }
    setBusy(true)
    try {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirectUrl() })
      if (error) throw error
      setMessage('비밀번호 재설정 메일을 보냈어요.')
    } catch (error) { setMessage(error.message || '재설정 메일을 보내지 못했어요.') }
    finally { setBusy(false) }
  }

  const resendConfirmation = async () => {
    if (!email) {
      setMessage('가입할 때 입력한 이메일을 먼저 적어주세요.')
      return
    }
    setBusy(true)
    try {
      const { error } = await requireSupabase().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: getAuthRedirectUrl() },
      })
      if (error) throw error
      setAwaitingConfirmation(true)
      setMessage('새 확인 메일을 보냈어요. 가장 최근 메일의 링크를 눌러주세요.')
    } catch (error) {
      setMessage(error.message || '확인 메일을 다시 보내지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const changeMode = (next) => {
    setMode(next)
    setMessage('')
    setAwaitingConfirmation(false)
  }

  return <div className="app-shell auth-shell"><section className="phone auth-phone">
    <main className="auth-screen">
      <div className="auth-brand"><span>✓</span><h1>끼우</h1><p>할 일을 가볍게 끼워 넣어요</p></div>
      <div className="auth-tabs" role="tablist">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>로그인</button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>처음이에요</button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && <label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength="40" autoComplete="name" placeholder="끼우에서 사용할 이름" /></label>}
        <label><span>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="name@example.com" /></label>
        <label><span>비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="8" required placeholder="8자 이상" /></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? '잠시만요…' : mode === 'login' ? '로그인' : '계정 만들기'}</button>
        {mode === 'login' && <button className="auth-resend" type="button" disabled={busy} onClick={resetPassword}>비밀번호 재설정</button>}
        {((mode === 'signup' && awaitingConfirmation) || initialMessage) && <button className="auth-resend" type="button" disabled={busy} onClick={resendConfirmation}>확인 메일 다시 받기</button>}
      </form>
    </main>
  </section></div>
}
