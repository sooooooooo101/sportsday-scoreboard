import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { useSave } from '../src/admin/useSave'

function Harness() {
  const { status, save } = useSave()
  return <button onClick={() => void save(async () => 3)}>{status}</button>
}

test('StrictMode でも保存が終われば saved になる', async () => {
  render(<StrictMode><Harness /></StrictMode>)
  await userEvent.click(screen.getByRole('button'))
  expect(await screen.findByRole('button', { name: 'saved' })).toBeInTheDocument()
})

test('古い保存の失敗は、後の保存の成功で隠れない', async () => {
  const { result } = renderHook(() => useSave())
  let failFirst!: (e: Error) => void
  await act(async () => {
    void result.current.save(() => new Promise<number>((_, rej) => { failFirst = rej }))
    await result.current.save(async () => 2)
  })
  await act(async () => { failFirst(new Error('rejected')) })
  expect(result.current.status).toBe('error')
  await act(async () => { await result.current.save(async () => 3) })
  expect(result.current.status).toBe('error')
  act(() => result.current.dismiss())
  expect(result.current.status).toBe('idle')
})

test('失敗のあとも次の保存は実行される', async () => {
  const { result } = renderHook(() => useSave())
  await act(async () => { await result.current.save(async () => { throw new Error('x') }) })
  expect(result.current.status).toBe('error')
  act(() => result.current.dismiss())
  const r = await act(async () => result.current.save(async () => 5))
  expect(r).toEqual({ ok: true, value: 5 })
  expect(result.current.status).toBe('saved')
})

test('saved は 5 秒後に idle に戻る', async () => {
  vi.useFakeTimers()
  try {
    const { result } = renderHook(() => useSave())
    await act(async () => { await result.current.save(async () => 1) })
    expect(result.current.status).toBe('saved')
    await act(async () => { vi.advanceTimersByTime(5100) })
    expect(result.current.status).toBe('idle')
  } finally { vi.useRealTimers() }
})
