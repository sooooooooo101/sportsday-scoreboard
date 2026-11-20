import { fireEvent, render, screen, within } from '@testing-library/react'
import { Display } from '../src/display/Display'
import { SEED_SETTINGS } from '../src/shared/seed'
import { board, comps } from './fixtures'

const openBreakdown = () => fireEvent.click(screen.getByRole('button', { name: '内訳を見る' }))

const scored = comps({
  A: { '1': { blue: 7, white: 5 } },
  C: { '1': { blue: 40, white: 10 } },
  E: { '1': { blue: 50, white: 30 } },
})

test('合計点を青と白それぞれに表示する', () => {
  render(<Display board={board({ competitions: scored })} />)
  expect(screen.getByTestId('total-blue')).toHaveTextContent('97')
  expect(screen.getByTestId('total-white')).toHaveTextContent('45')
  expect(screen.getByRole('region', { name: '青組 97点' })).toBeInTheDocument()
})

test('内訳を A,B,D,C,E の順に、競技名と青・白の小計つきで並べる', () => {
  render(<Display board={board({ competitions: scored })} />)
  openBreakdown()
  const rows = screen.getAllByRole('listitem')
  expect(rows.map(r => r.getAttribute('data-id'))).toEqual(['A', 'B', 'D', 'C', 'E'])
  const c = within(rows[3])
  expect(c.getByText('ドッジボール')).toBeInTheDocument()
  expect(c.getByTestId('sub-blue')).toHaveTextContent('40')
  expect(c.getByTestId('sub-white')).toHaveTextContent('10')
})

test('hiddenIds に E があるとき、合計と E の小計が「?」で、「結果は閉会式で発表」が表示される', () => {
  const visible = scored.filter(c => c.id !== 'E')
  render(<Display board={board({ competitions: visible, hiddenIds: ['E'], settings: { ...SEED_SETTINGS, hidden: true } })} />)
  expect(screen.getByTestId('total-blue')).toHaveTextContent('?')
  expect(screen.getByTestId('total-white')).toHaveTextContent('?')
  expect(screen.getByTestId('total-blue')).not.toHaveTextContent('47')
  openBreakdown()
  const e = within(screen.getAllByRole('listitem').find(r => r.getAttribute('data-id') === 'E')!)
  expect(e.getByTestId('sub-blue')).toHaveTextContent('?')
  expect(e.getByTestId('sub-white')).toHaveTextContent('?')
  expect(screen.getByText('結果は閉会式で発表')).toBeInTheDocument()
})

test('hiddenIds が空に戻ると、合計が数字で表示される', () => {
  const visible = scored.filter(c => c.id !== 'E')
  const { rerender } = render(<Display board={board({ competitions: visible, hiddenIds: ['E'] })} />)
  rerender(<Display board={board({ competitions: scored })} />)
  expect(screen.getByTestId('total-blue')).not.toHaveTextContent('?')
  expect(screen.queryByText('結果は閉会式で発表')).not.toBeInTheDocument()
})

test('connected=false のとき「再接続中」を表示する', () => {
  render(<Display board={board({ connected: false })} />)
  expect(screen.getAllByRole('status').some(el => el.textContent?.includes('再接続中'))).toBe(true)
})

test('settings が null（読み込み中）の間は「読み込み中」を表示し、0 点を表示しない', () => {
  render(<Display board={board({ settings: null, competitions: [] })} />)
  expect(screen.getByText('読み込み中')).toBeInTheDocument()
  expect(screen.queryByTestId('total-blue')).not.toBeInTheDocument()
})

test('ready=false の間は「読み込み中」を表示し、途中の合計を見せない', () => {
  render(<Display board={board({ competitions: scored.slice(0, 2), ready: false })} />)
  expect(screen.getByText('読み込み中')).toBeInTheDocument()
  expect(screen.queryByTestId('total-blue')).not.toBeInTheDocument()
})

test('settings.hidden=true なら、hiddenIds が空でも合計は「?」', () => {
  render(<Display board={board({ competitions: scored.slice(0, 3), hiddenIds: [], settings: { ...SEED_SETTINGS, hidden: true } })} />)
  expect(screen.getByTestId('total-blue')).toHaveTextContent('?')
  expect(screen.getByText('結果は閉会式で発表')).toBeInTheDocument()
})

test('数字のアニメーションは読み上げず、確定した点数だけを読み上げ用に出す', () => {
  render(<Display board={board({ competitions: scored })} />)
  const blue = screen.getByRole('region', { name: '青組 97点' })
  expect(within(blue).getByTestId('total-blue')).toHaveAttribute('aria-hidden', 'true')
  expect(within(blue).getByRole('status')).toHaveTextContent('青組 97点')
})

test('内訳は最初は閉じていて、ボタンで開け閉めできる', () => {
  render(<Display board={board({ competitions: scored })} />)
  const toggle = screen.getByRole('button', { name: '内訳を見る' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('list', { name: '競技ごとの得点' })).not.toBeInTheDocument()
  fireEvent.click(toggle)
  const hide = screen.getByRole('button', { name: '内訳を隠す' })
  expect(hide).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('list', { name: '競技ごとの得点' })).toBeInTheDocument()
  expect(document.getElementById(hide.getAttribute('aria-controls')!)).not.toBeNull()
  fireEvent.click(hide)
  expect(screen.getByRole('button', { name: '内訳を見る' })).toHaveAttribute('aria-expanded', 'false')
})

test('内訳を閉じていても「結果は閉会式で発表」は表示する', () => {
  render(<Display board={board({ competitions: scored.slice(0, 4), hiddenIds: ['E'], settings: { ...SEED_SETTINGS, hidden: true } })} />)
  expect(screen.getByText('結果は閉会式で発表')).toBeInTheDocument()
})
