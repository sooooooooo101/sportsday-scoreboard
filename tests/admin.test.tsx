import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import type { BoardState } from '../src/shared/subscribe'
import { board, comps } from './fixtures'

let signedIn: 'scorer' | 'signedOut' | 'notScorer' = 'scorer'
let current: BoardState = board()
let push: ((b: BoardState) => void) | null = null

vi.mock('../src/admin/adminApi', () => ({
  signInWithPasscode: vi.fn(async () => {}),
  signOutScorer: vi.fn(async () => {}),
  onScorerChange: vi.fn((cb: (v: typeof signedIn) => void) => { cb(signedIn); return () => {} }),
  setScore: vi.fn(async () => 0),
  updateCompetition: vi.fn(async () => {}),
  updateSettings: vi.fn(async () => {}),
  seedIfEmpty: vi.fn(async () => true),
}))
// jsdom can't run motion's exit animations, so presence is a pass-through here;
// these tests check when the popup is shown/hidden, not the animation itself.
vi.mock('motion/react', async orig => ({
  ...(await orig<typeof import('motion/react')>()),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('../src/shared/subscribe', () => ({
  subscribeBoard: vi.fn((cb: (b: BoardState) => void) => { push = cb; cb(current); return () => {} }),
}))

const api = await import('../src/admin/adminApi')
const { AdminApp } = await import('../src/admin/AdminApp')
const m = vi.mocked(api)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  signedIn = 'scorer'
  current = board()
})

const setup = () => ({ user: userEvent.setup(), ...render(<AdminApp />) })
const teamArea = (name: '青組' | '白組') => within(screen.getByRole('group', { name }))

describe('ログイン', () => {
  beforeEach(() => { signedIn = 'signedOut' })

  test('合言葉が違うと「合言葉が違います」を表示し、入力欄を空にしない', async () => {
    m.signInWithPasscode.mockRejectedValueOnce(new Error('auth/invalid-credential'))
    const { user } = setup()
    await user.type(screen.getByLabelText('合言葉'), 'wrong-pass')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('合言葉が違います')
    expect(screen.getByLabelText('合言葉')).toHaveValue('wrong-pass')
  })

  test('得点係以外のアカウントなら、その旨を表示してログイン画面のまま', () => {
    signedIn = 'notScorer'
    setup()
    expect(screen.getByRole('alert')).toHaveTextContent('このアカウントは得点係ではありません')
    expect(screen.getByLabelText('合言葉')).toBeInTheDocument()
  })

  test('合言葉が正しいと signInWithPasscode が呼ばれる', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('合言葉'), 'right-pass{Enter}')
    expect(m.signInWithPasscode).toHaveBeenCalledWith('right-pass')
  })
})

describe('得点入力', () => {
  test('ログイン後、競技タブが A,B,D,C,E の順で、選んだ競技の試合数だけ試合タブが出る', async () => {
    const { user } = setup()
    const tabs = within(screen.getByRole('tablist', { name: '競技' })).getAllByRole('tab')
    expect(tabs.map(t => t.textContent?.slice(0, 1))).toEqual(['A', 'B', 'D', 'C', 'E'])
    expect(within(screen.getByRole('tablist', { name: '試合' })).getAllByRole('tab')).toHaveLength(4)
    await user.click(screen.getByRole('tab', { name: /ドッジボール/ }))
    expect(within(screen.getByRole('tablist', { name: '試合' })).getAllByRole('tab')).toHaveLength(2)
  })

  test('＋を押すと setScore(id, match, team, 現在値+1) が呼ばれる', async () => {
    current = board({ competitions: comps({ A: { '1': { blue: 7, white: 5 } } }) })
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    expect(m.setScore).toHaveBeenCalledWith('A', 1, 'blue', 8, 7)
  })

  test('0 点のときの「−」は押せない', () => {
    setup()
    expect(teamArea('白組').getByRole('button', { name: '1点減らす' })).toBeDisabled()
  })

  test('プリセット「40」を押すと setScore(..., 40) が呼ばれる', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: /ドッジボール/ }))
    await user.click(teamArea('青組').getByRole('button', { name: '40点足す' }))
    expect(m.setScore).toHaveBeenCalledWith('C', 1, 'blue', 40, 0)
  })

  test('よく使う点数は今の点数に足す（5 点のとき +10 で 15 点）', async () => {
    current = board({ competitions: comps({ C: { '1': { blue: 5, white: 0 } } }) })
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: /ドッジボール/ }))
    const plus10 = teamArea('青組').getByRole('button', { name: '10点足す' })
    expect(plus10).toHaveTextContent('+10')
    await user.click(plus10)
    expect(m.setScore).toHaveBeenCalledWith('C', 1, 'blue', 15, 5)
  })

  test('足した結果が満点を超えるなら保存しない', async () => {
    current = board({ competitions: comps({ C: { '1': { blue: 70, white: 0 } } }) })
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: /ドッジボール/ }))
    await user.click(teamArea('青組').getByRole('button', { name: '40点足す' }))
    expect(m.setScore).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('100 点まで')
  })

  test('数字をタップして「４０」と入力すると 40 で保存される', async () => {
    const { user } = setup()
    await user.click(teamArea('白組').getByRole('button', { name: /白組の点数.*タップして入力/ }))
    const input = teamArea('白組').getByRole('textbox', { name: '白組の点数' })
    await user.clear(input)
    await user.type(input, '４０{Enter}')
    expect(m.setScore).toHaveBeenCalledWith('A', 1, 'white', 40, 0)
  })

  test('max を超える値は保存せず、理由を表示する', async () => {
    current = board({ competitions: comps({ C: { '1': { blue: 40, white: 10 } } }) })
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: /ドッジボール/ }))
    await user.click(screen.getByRole('tab', { name: '第2試合' }))
    await user.click(teamArea('青組').getByRole('button', { name: /青組の点数.*タップして入力/ }))
    const input = teamArea('青組').getByRole('textbox', { name: '青組の点数' })
    await user.clear(input)
    await user.type(input, '51{Enter}')
    expect(m.setScore).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('100 点まで')
  })

  test('保存後「保存しました」と「取り消す」が出て、取り消すと変更前の値で setScore が呼ばれる', async () => {
    m.setScore.mockResolvedValueOnce(7)
    current = board({ competitions: comps({ A: { '1': { blue: 7, white: 0 } } }) })
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('保存しました')
    await user.click(screen.getByRole('button', { name: '取り消す' }))
    expect(m.setScore).toHaveBeenLastCalledWith('A', 1, 'blue', 7, expect.any(Number))
  })

  test('setScore が 8 秒間返らないと「未送信」を表示する', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      m.setScore.mockImplementationOnce(() => new Promise(() => {}))
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<AdminApp />)
      await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
      await act(async () => { vi.advanceTimersByTime(8100) })
      expect(screen.getByRole('alert')).toHaveTextContent('未送信：通信を確認してください')
    } finally { vi.useRealTimers() }
  })

  test('setScore が reject すると「保存できませんでした」を表示する', async () => {
    m.setScore.mockRejectedValueOnce(new Error('unavailable'))
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存できませんでした。通信を確認してもう一度押してください')
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('画面の点数は購読データだけで決まり、失敗後も実際の値を表示する', async () => {
    m.setScore.mockRejectedValueOnce(new Error('permission-denied'))
    current = board({ competitions: comps({ A: { '1': { blue: 7, white: 0 } } }) })
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    await screen.findByRole('alert')
    expect(teamArea('青組').getByRole('button', { name: /青組の点数/ })).toHaveTextContent('7')
  })

  test('ログアウトボタンで signOutScorer が呼ばれる', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(m.signOutScorer).toHaveBeenCalled()
  })

  test('competitions が空のとき「初期データを作成」ボタンが出て、押すと seedIfEmpty が呼ばれる', async () => {
    current = board({ settings: null, competitions: [] })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '初期データを作成' }))
    expect(m.seedIfEmpty).toHaveBeenCalled()
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('初期データを作成しました')
  })

  test('サーバーに拒否されたら、満点や同時入力を疑う文言を出す', async () => {
    m.setScore.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('満点を超えたか、ほかの端末の入力と重なりました')
  })

  test('Enter のあとに入力欄からフォーカスが外れても、保存は 1 回だけ', async () => {
    const { user } = setup()
    await user.click(teamArea('白組').getByRole('button', { name: /白組の点数.*タップして入力/ }))
    const input = teamArea('白組').getByRole('textbox', { name: '白組の点数' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '30' } })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(m.setScore).toHaveBeenCalledTimes(1)
  })

  test('ready=false の間は「初期データを作成」を出さない', () => {
    current = board({ settings: null, competitions: [], ready: false })
    setup()
    expect(screen.queryByRole('button', { name: '初期データを作成' })).not.toBeInTheDocument()
    expect(screen.getByText('読み込み中')).toBeInTheDocument()
  })

  test('初期データの作成に失敗したら理由を表示する', async () => {
    m.seedIfEmpty.mockRejectedValueOnce(new Error('unavailable'))
    current = board({ settings: null, competitions: [] })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '初期データを作成' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('作成できませんでした')
  })

  test('競技タブは矢印キーで移動でき、選んだタブにフォーカスが移る', async () => {
    const { user } = setup()
    const tabA = screen.getByRole('tab', { name: /借り人競走/ })
    tabA.focus()
    await user.keyboard('{ArrowRight}')
    const tabB = screen.getByRole('tab', { name: /玉入れ改/ })
    expect(tabB).toHaveAttribute('aria-selected', 'true')
    expect(tabB).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /メンターリレー/ })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /借り人競走/ })).toHaveFocus()
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(2)
  })

  test('選ばれていないタブは Tab キーの移動先にならず、タブパネルと結びついている', () => {
    setup()
    const tabs = within(screen.getByRole('tablist', { name: '試合' })).getAllByRole('tab')
    expect(tabs.map(t => t.tabIndex)).toEqual([0, -1, -1, -1])
    const panel = screen.getByRole('tabpanel')
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id)
  })

  test('保存に成功すると、中央に「青組 8点 保存しました」のポップアップが出て 1.5 秒で消える', async () => {
    current = board({ competitions: comps({ A: { '1': { blue: 7, white: 0 } } }) })
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    const popup = await screen.findByTestId('saved-popup')
    expect(popup).toHaveTextContent('青組 8点')
    expect(popup).toHaveTextContent('保存しました')
    await new Promise(r => setTimeout(r, 1000))
    expect(screen.getByTestId('saved-popup')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('saved-popup')).not.toBeInTheDocument(), { timeout: 3000 })
  })

  test('続けて保存してもポップアップは 1 つで、中身が新しい点数になる', async () => {
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    await screen.findByTestId('saved-popup')
    await user.click(teamArea('白組').getByRole('button', { name: '1点増やす' }))
    await waitFor(() => expect(screen.getAllByTestId('saved-popup')).toHaveLength(1))
    expect(screen.getByTestId('saved-popup')).toHaveTextContent('白組 1点')
  })

  test('保存に失敗したらポップアップは出ない', async () => {
    m.setScore.mockRejectedValueOnce(new Error('unavailable'))
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    await screen.findByRole('alert')
    expect(screen.queryByTestId('saved-popup')).not.toBeInTheDocument()
  })

  test('取り消すと「青組 7点に戻しました」と出る', async () => {
    m.setScore.mockResolvedValueOnce(7)
    current = board({ competitions: comps({ A: { '1': { blue: 7, white: 0 } } }) })
    const { user } = setup()
    await user.click(teamArea('青組').getByRole('button', { name: '1点増やす' }))
    await user.click(await screen.findByRole('button', { name: '取り消す' }))
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('青組 7点に戻しました')
  })

  test('別の端末の入力が届くと表示が更新される', async () => {
    setup()
    act(() => push!(board({ competitions: comps({ A: { '1': { blue: 12, white: 0 } } }) })))
    expect(teamArea('青組').getByRole('button', { name: /青組の点数/ })).toHaveTextContent('12')
  })
})

describe('玉入れの途中計算', () => {
  const openB = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('tab', { name: /玉入れ改/ }))
  const tally = () => within(screen.getByRole('group', { name: '青組の途中計算' }))

  test('＋と−で数えても保存せず、点数決定で「＋の数 − −の数」を保存してリセットする', async () => {
    const { user } = setup()
    await openB(user)
    for (let i = 0; i < 3; i++) await user.click(tally().getByRole('button', { name: '入った玉を1つ増やす' }))
    await user.click(tally().getByRole('button', { name: 'マイナス玉を1つ増やす' }))
    expect(tally().getByTestId('tally-result')).toHaveTextContent('3 − 1 = 2点')
    expect(m.setScore).not.toHaveBeenCalled()
    await user.click(tally().getByRole('button', { name: '点数決定' }))
    expect(m.setScore).toHaveBeenCalledWith('B', 1, 'blue', 2, 0)
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('青組 2点')
    expect(tally().getByTestId('tally-result')).toHaveTextContent('0 − 0 = 0点')
  })

  test('押し間違えは各フェーズの「戻す」で 1 つ減らせる', async () => {
    const { user } = setup()
    await openB(user)
    await user.click(tally().getByRole('button', { name: '入った玉を1つ増やす' }))
    await user.click(tally().getByRole('button', { name: '入った玉を1つ戻す' }))
    expect(tally().getByTestId('tally-result')).toHaveTextContent('0 − 0 = 0点')
    expect(tally().getByRole('button', { name: '入った玉を1つ戻す' })).toBeDisabled()
  })

  test('計算結果がマイナスなら 0 点として保存する', async () => {
    const { user } = setup()
    await openB(user)
    await user.click(tally().getByRole('button', { name: 'マイナス玉を1つ増やす' }))
    expect(tally().getByTestId('tally-result')).toHaveTextContent('0 − 1 = 0点')
    await user.click(tally().getByRole('button', { name: '点数決定' }))
    expect(m.setScore).toHaveBeenCalledWith('B', 1, 'blue', 0, 0)
  })

  test('途中の数は画面を開き直しても残る', async () => {
    const { user, unmount } = setup()
    await openB(user)
    await user.click(tally().getByRole('button', { name: '入った玉を1つ増やす' }))
    await user.click(tally().getByRole('button', { name: '入った玉を1つ増やす' }))
    unmount()
    const again = setup()
    await openB(again.user)
    expect(tally().getByTestId('tally-result')).toHaveTextContent('2 − 0 = 2点')
  })

  test('保存に失敗したら途中の数は消さない', async () => {
    m.setScore.mockRejectedValueOnce(new Error('unavailable'))
    const { user } = setup()
    await openB(user)
    await user.click(tally().getByRole('button', { name: '入った玉を1つ増やす' }))
    await user.click(tally().getByRole('button', { name: '点数決定' }))
    await screen.findByRole('alert')
    expect(tally().getByTestId('tally-result')).toHaveTextContent('1 − 0 = 1点')
  })

  test('玉入れのタブ名はラウンド1 / ラウンド2 / ボーナス', async () => {
    const { user } = setup()
    await openB(user)
    expect(within(screen.getByRole('tablist', { name: '試合' })).getAllByRole('tab').map(t => t.textContent)).toEqual(['ラウンド1', 'ラウンド2', 'ボーナス'])
  })

  test('ボーナスは入った数を 0〜3 で数え、3 個なら 18 点を保存する', async () => {
    const { user } = setup()
    await openB(user)
    await user.click(screen.getByRole('tab', { name: 'ボーナス' }))
    const add = tally().getByRole('button', { name: '入ったボーナス玉を1つ増やす' })
    for (let i = 0; i < 4; i++) await user.click(add)
    expect(add).toBeDisabled()
    expect(tally().getByTestId('tally-result')).toHaveTextContent('3個 = 18点')
    await user.click(tally().getByRole('button', { name: '点数決定' }))
    expect(m.setScore).toHaveBeenCalledWith('B', 3, 'blue', 18, 0)
  })

  test('ラウンドのプラス玉は 80 球、マイナス玉は 20 球で止まる', async () => {
    localStorage.setItem('tally:B:1:blue', JSON.stringify({ plus: 80, minus: 20, at: Date.now() }))
    const { user } = setup()
    await openB(user)
    expect(tally().getByRole('button', { name: '入った玉を1つ増やす' })).toBeDisabled()
    expect(tally().getByRole('button', { name: 'マイナス玉を1つ増やす' })).toBeDisabled()
  })

  test('リセットで途中の数を 0 に戻せる', async () => {
    const { user } = setup()
    await openB(user)
    await user.click(tally().getByRole('button', { name: '入った玉を1つ増やす' }))
    await user.click(tally().getByRole('button', { name: 'リセット' }))
    expect(tally().getByTestId('tally-result')).toHaveTextContent('0 − 0 = 0点')
  })

  test('3 時間以上前の途中の数は捨てる', async () => {
    localStorage.setItem('tally:B:1:blue', JSON.stringify({ plus: 9, minus: 0, at: Date.now() - 3 * 60 * 60 * 1000 - 1000 }))
    const { user } = setup()
    await openB(user)
    expect(tally().getByTestId('tally-result')).toHaveTextContent('0 − 0 = 0点')
  })

  test('玉入れ以外の競技には途中計算を出さない', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: /ドッジボール/ }))
    expect(screen.queryByRole('group', { name: '青組の途中計算' })).not.toBeInTheDocument()
  })
})

describe('設定', () => {
  test('試合数を減らすと、点数がある試合が消える場合は理由を表示し、updateCompetition を呼ばない', async () => {
    current = board({ competitions: comps({ A: { '4': { blue: 7, white: 5 } } }) })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '設定' }))
    await user.click(screen.getByRole('button', { name: '試合数を減らす' }))
    expect(m.updateCompetition).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('第4試合に点数が入っている')
  })

  test('競技名を変えて保存すると updateCompetition が呼ばれる', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: /メンターリレー/ }))
    await user.click(screen.getByRole('button', { name: '設定' }))
    const name = screen.getByLabelText('競技名')
    await user.clear(name)
    await user.type(name, '新リレー')
    await user.click(screen.getByRole('button', { name: '競技の設定を保存' }))
    expect(m.updateCompetition).toHaveBeenCalledWith('E', expect.objectContaining({ name: '新リレー' }))
  })

  test('「この競技から隠す」で updateSettings({ hidden: true })、「発表する」は2回押すと updateSettings({ hidden: false })', async () => {
    const { user, rerender } = setup()
    await user.click(screen.getByRole('button', { name: '設定' }))
    await user.click(screen.getByRole('button', { name: /メンターリレー.*から隠す/ }))
    expect(m.updateSettings).toHaveBeenCalledWith({ hidden: true })
    current = board({ settings: { capMode: 'shared', hideFromOrder: 5, hidden: true } })
    act(() => push!(current))
    rerender(<AdminApp />)
    await user.click(screen.getByRole('button', { name: '発表する' }))
    expect(m.updateSettings).not.toHaveBeenCalledWith({ hidden: false })
    await user.click(screen.getByRole('button', { name: '本当に発表する' }))
    expect(m.updateSettings).toHaveBeenCalledWith({ hidden: false })
  })

  test('満点を、今入っている合計より低くはできない', async () => {
    current = board({ competitions: comps({ C: { '1': { blue: 40, white: 10 } } }) })
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: /ドッジボール/ }))
    await user.click(screen.getByRole('button', { name: '設定' }))
    const max = screen.getByLabelText('満点')
    await user.clear(max)
    await user.type(max, '49')
    await user.click(screen.getByRole('button', { name: '競技の設定を保存' }))
    expect(m.updateCompetition).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('今の合計（50 点）より低くできません')
  })

  test('競技の設定を保存するとポップアップが出る', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '設定' }))
    await user.click(screen.getByRole('button', { name: '競技の設定を保存' }))
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('競技の設定')
  })

  test('試合数を変えるとポップアップが出る', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '設定' }))
    await user.click(screen.getByRole('button', { name: '試合数を増やす' }))
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('試合数 5')
  })

  test('隠す・発表・満点の数え方でもポップアップが出る', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '設定' }))
    await user.click(screen.getByRole('radio', { name: /チームごと/ }))
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('満点の数え方')
    await user.click(screen.getByRole('button', { name: /から隠す/ }))
    expect(await screen.findByTestId('saved-popup')).toHaveTextContent('結果を隠しました')
  })

  test('満点の数え方を切り替えると updateSettings({ capMode }) が呼ばれる', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '設定' }))
    await user.click(screen.getByRole('radio', { name: /チームごと/ }))
    expect(m.updateSettings).toHaveBeenCalledWith({ capMode: 'perTeam' })
  })
})
