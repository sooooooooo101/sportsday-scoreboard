import { useState, type FormEvent } from 'react'
import { signInWithPasscode } from './adminApi'

function messageFor(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  if (code === 'auth/network-request-failed') return '通信できません。電波を確認してもう一度試してください'
  if (code === 'auth/too-many-requests') return '試行回数が多すぎます。しばらく待ってから試してください'
  return '合言葉が違います'
}

export function Login({ notScorer = false }: { notScorer?: boolean }) {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!passcode || busy) return
    setBusy(true)
    setError(null)
    try { await signInWithPasscode(passcode) }
    catch (err) { setError(messageFor(err)) }
    finally { setBusy(false) }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit}>
        <h1 className="login__title">得点入力</h1>
        <p className="login__lead">得点係の合言葉を入力してください</p>
        <label className="field">
          <span className="field__label">合言葉</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || notScorer ? 'login-error' : undefined}
          />
        </label>
        {(error || notScorer) && (
          <p id="login-error" className="msg msg--error" role="alert">
            {error ?? 'このアカウントは得点係ではありません。得点係の合言葉でログインしてください'}
          </p>
        )}
        <button className="btn btn--primary" type="submit" disabled={!passcode || busy}>
          {busy ? '確認中…' : 'ログイン'}
        </button>
      </form>
    </main>
  )
}
