// @vitest-environment node
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { SEED_COMPETITIONS, SEED_SETTINGS } from '../src/shared/seed'
import { clearFirestore, makeEnv, TEST_SCORER_UID } from './rules-helpers'

let env: RulesTestEnvironment
const anon = () => env.unauthenticatedContext().firestore()
const scorer = () => env.authenticatedContext(TEST_SCORER_UID).firestore()
const stranger = () => env.authenticatedContext('someone-else').firestore()

async function seed(settings = SEED_SETTINGS) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    for (const c of SEED_COMPETITIONS) await setDoc(doc(db, 'competitions', c.id), c)
    await setDoc(doc(db, 'settings', 'app'), settings)
    await setDoc(doc(db, 'log', 'existing'), { kind: 'score', id: 'A', match: 1, team: 'blue', from: 0, to: 7, at: new Date() })
  })
}

beforeAll(async () => { env = await makeEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await clearFirestore(env); await seed() })

describe('読み取り', () => {
  test('未ログインで competitions/A と settings/app を読める', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'competitions', 'A')))
    await assertSucceeds(getDoc(doc(anon(), 'settings', 'app')))
  })

  // RED-006: hiding is a flag on each competition doc, so reads need no extra get().
  const hideE = () => env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'competitions', 'E'), { hidden: true }))

  test('hidden=true の競技は、未ログインでは読めないが、得点係は読める', async () => {
    await hideE()
    await assertFails(getDoc(doc(anon(), 'competitions', 'E')))
    await assertSucceeds(getDoc(doc(anon(), 'competitions', 'C')))
    await assertSucceeds(getDoc(doc(scorer(), 'competitions', 'E')))
  })

  test('hidden を持たない（以前からある）競技ドキュメントも未ログインで読める', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'competitions', 'E')))
  })

  test('A〜E 以外の競技 ID は、未ログインでは読めない', async () => {
    await assertFails(getDoc(doc(anon(), 'competitions', 'Z')))
  })

  test('未ログインでは competitions を一覧取得できない（隠していなくても）。得点係はできる', async () => {
    await assertFails(getDocs(collection(anon(), 'competitions')))
    await assertSucceeds(getDocs(collection(scorer(), 'competitions')))
  })
})

describe('書き込み', () => {
  test('未ログインでは competitions/A に書けない', async () => {
    await assertFails(updateDoc(doc(anon(), 'competitions', 'A'), { 'scores.1.blue': 7 }))
    await assertFails(updateDoc(doc(anon(), 'settings', 'app'), { hidden: true }))
  })

  test('得点係以外のログインユーザーも書けない', async () => {
    await assertFails(updateDoc(doc(stranger(), 'competitions', 'A'), { 'scores.1.blue': 7 }))
  })

  test('得点係は scores.1.blue を 40 に更新できる', async () => {
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.1.blue': 40 }))
  })

  test('得点係は試合の両チームを含む map を書ける', async () => {
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.2': { blue: 25, white: 25 } }))
  })

  test.each([-1, 12.5, 101, '40'])('得点係でも scores.1.blue = %s は拒否される', async v => {
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.1.blue': v }))
  })

  test('満点で止めない競技（B）は max を超える値も書けるが、1000 を超える値は拒否される', async () => {
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'B'), { 'scores.1.blue': 150 }))
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'B'), { 'scores.1.blue': 1001 }))
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.1.blue': 150 }))
  })

  test('capped は true/false 以外を拒否する', async () => {
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { capped: 'no' }))
  })

  test.each(['11', 'x', '0'])('scores のキーが "%s" なら拒否される', async k => {
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { [`scores.${k}`]: { blue: 1, white: 1 } }))
  })

  test('試合の map に余計なキーがあると拒否される', async () => {
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.1': { blue: 1, white: 1, red: 1 } }))
  })

  test('競技の設定値の範囲外は拒否される', async () => {
    const ref = doc(scorer(), 'competitions', 'C')
    await assertFails(updateDoc(ref, { matchCount: 0 }))
    await assertFails(updateDoc(ref, { matchCount: 11 }))
    await assertFails(updateDoc(ref, { name: '' }))
    await assertFails(updateDoc(ref, { max: 0 }))
    await assertFails(updateDoc(ref, { presets: [1, 2, 3, 4, 5, 6, 7] }))
    await assertFails(updateDoc(ref, { extra: true }))
    await assertSucceeds(updateDoc(ref, { name: 'ドッジ', matchCount: 3, presets: [40, 25, 10] }))
  })

  test('得点係は競技の hidden を true/false にでき、それ以外の値は拒否される', async () => {
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'E'), { hidden: true }))
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'E'), { hidden: 'yes' }))
  })

  test('A〜E 以外の競技ドキュメントは作れない', async () => {
    await assertFails(setDoc(doc(scorer(), 'competitions', 'F'), { ...SEED_COMPETITIONS[0], id: 'F' }))
  })

  test('得点係は settings を正しい値で更新でき、不正な値は拒否される', async () => {
    const ref = doc(scorer(), 'settings', 'app')
    await assertSucceeds(updateDoc(ref, { hidden: true }))
    await assertSucceeds(updateDoc(ref, { capMode: 'perTeam', hideFromOrder: 4 }))
    await assertFails(updateDoc(ref, { capMode: 'other' }))
    await assertFails(updateDoc(ref, { hidden: 'yes' }))
  })
})

describe('log', () => {
  const score = () => ({ kind: 'score', id: 'A', match: 1, team: 'blue', from: 0, to: 7, at: serverTimestamp() })

  test('log は得点係だけが作成・閲覧できる', async () => {
    await assertSucceeds(addDoc(collection(scorer(), 'log'), score()))
    await assertSucceeds(getDoc(doc(scorer(), 'log', 'existing')))
    await assertFails(addDoc(collection(anon(), 'log'), score()))
    await assertFails(getDoc(doc(anon(), 'log', 'existing')))
  })

  test('log の時刻はサーバー時刻でなければ拒否される', async () => {
    await assertFails(addDoc(collection(scorer(), 'log'), { ...score(), at: 12345 }))
  })

  test('log の型が違うと拒否される', async () => {
    await assertFails(addDoc(collection(scorer(), 'log'), { ...score(), match: '1' }))
    await assertFails(addDoc(collection(scorer(), 'log'), { ...score(), to: -1 }))
    await assertFails(addDoc(collection(scorer(), 'log'), { kind: 'score', id: 'A', at: serverTimestamp() }))
  })

  test('設定と競技設定の変更も log に残せる', async () => {
    await assertSucceeds(addDoc(collection(scorer(), 'log'), { kind: 'settings', patch: { hidden: true }, at: serverTimestamp() }))
    await assertSucceeds(addDoc(collection(scorer(), 'log'), { kind: 'competition', id: 'D', patch: { matchCount: 3 }, at: serverTimestamp() }))
    await assertFails(addDoc(collection(scorer(), 'log'), { kind: 'other', at: serverTimestamp() }))
  })

  test('log の更新・削除は得点係でも拒否される', async () => {
    await assertFails(updateDoc(doc(scorer(), 'log', 'existing'), { to: 0 }))
    await assertFails(deleteDoc(doc(scorer(), 'log', 'existing')))
  })
})

describe('合計の上限をサーバーで確かめる', () => {
  const setScores = (id: string, scores: object) =>
    env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'competitions', id), { scores }))

  test('shared：別の試合と合わせて青と白の合計が max を超える書き込みは拒否される', async () => {
    await setScores('C', { '1': { blue: 40, white: 10 } })
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.2.blue': 51 }))
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.2.blue': 50 }))
  })

  test('2 人が別の試合に同時に入れても、後から届いた方が上限を超えるなら拒否される', async () => {
    const other = env.authenticatedContext(TEST_SCORER_UID).firestore()
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.1.blue': 60 }))
    await assertFails(updateDoc(doc(other, 'competitions', 'C'), { 'scores.2.white': 50 }))
  })

  test('perTeam：チームごとに max まで', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'settings', 'app'), { capMode: 'perTeam' }))
    await setScores('C', { '1': { blue: 60, white: 60 } })
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.2.blue': 40 }))
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.2.blue': 41 }))
  })

  test('max を今の合計より低くはできない', async () => {
    await setScores('C', { '1': { blue: 40, white: 10 } })
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { max: 49 }))
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { max: 50 }))
  })

  test('点数が入った試合を消すように試合数を減らすことはできない', async () => {
    await setScores('C', { '2': { blue: 40, white: 0 } })
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { matchCount: 1 }))
  })

  test('0 点だけの試合なら試合数を減らせる', async () => {
    await setScores('C', { '2': { blue: 0, white: 0 } })
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { matchCount: 1 }))
  })

  test('試合数より後ろの試合に 0 より大きい点数は書けない', async () => {
    await assertFails(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.3.blue': 10 }))
    await assertSucceeds(updateDoc(doc(scorer(), 'competitions', 'C'), { 'scores.3.blue': 0 }))
  })

  test('競技と settings を同じバッチで初めて作れる（初期データ作成）', async () => {
    await env.clearFirestore()
    const db = scorer()
    const batch = writeBatch(db)
    for (const c of SEED_COMPETITIONS) batch.set(doc(db, 'competitions', c.id), c)
    batch.set(doc(db, 'settings', 'app'), SEED_SETTINGS)
    await assertSucceeds(batch.commit())
  })
})

test('ほかのコレクションは読み書きできない', async () => {
  await assertFails(getDoc(doc(scorer(), 'other', 'x')))
  await assertFails(setDoc(doc(scorer(), 'other', 'x'), { a: 1 }))
})
