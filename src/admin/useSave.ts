import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsent' | 'error'
export type SaveResult<T> = { ok: true; value: T } | { ok: false }
/** rejected = the rules refused the write (cap exceeded / raced another device). */
export type SaveErrorKind = 'rejected' | 'failed'

export const errorKindOf = (e: unknown): SaveErrorKind =>
  (e as { code?: string })?.code === 'permission-denied' ? 'rejected' : 'failed'

export const UNSENT_AFTER_MS = 8000
export const SAVED_VISIBLE_MS = 5000

/**
 * Tracks write status for the toast. Firestore already orders writes from one
 * client, so saves run immediately. A failure stays visible until dismissed,
 * even if a later save succeeds, so a lost score is never masked.
 */
export function useSave() {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorKind, setErrorKind] = useState<SaveErrorKind>('failed')
  const latest = useRef(0)
  const alive = useRef(true)
  // Re-arm on every mount: StrictMode runs mount → cleanup → mount in development.
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const keepError = (next: SaveStatus) => (s: SaveStatus) => (s === 'error' ? s : next)

  const save = useCallback(<T,>(fn: () => Promise<T>): Promise<SaveResult<T>> => {
    const id = ++latest.current
    const mine = () => alive.current && id === latest.current
    setStatus(keepError('saving'))
    const timer = setTimeout(() => { if (mine()) setStatus(keepError('unsent')) }, UNSENT_AFTER_MS)
    return fn().then(
      value => {
        clearTimeout(timer)
        if (mine()) {
          setStatus(keepError('saved'))
          setTimeout(() => { if (mine()) setStatus(s => (s === 'saved' ? 'idle' : s)) }, SAVED_VISIBLE_MS)
        }
        return { ok: true, value } as const
      },
      (e: unknown) => {
        clearTimeout(timer)
        if (alive.current) { setErrorKind(errorKindOf(e)); setStatus('error') }
        return { ok: false } as const
      },
    )
  }, [])

  const dismiss = useCallback(() => setStatus('idle'), [])

  return { status, errorKind, save, dismiss }
}
