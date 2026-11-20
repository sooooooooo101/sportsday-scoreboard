import { readFileSync } from 'node:fs'

type Header = { key: string; value: string }
type Rule = { source: string; headers: Header[] }
const load = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const fb = load('firebase.json')
const headerFor = (source: string, key: string) =>
  (fb.hosting.headers as Rule[]).find(r => r.source === source)?.headers.find(h => h.key === key)?.value

test('HTML は毎回確認させ、当日の修正がすぐ届くようにする', () => {
  expect(headerFor('**/*.html', 'Cache-Control')).toBe('no-cache')
  expect(headerFor('/', 'Cache-Control')).toBe('no-cache')
  // The admin page lives at a secret one-level path (/<ADMIN_PATH>/)
  expect(headerFor('/*/', 'Cache-Control')).toBe('no-cache')
})

test('ハッシュ付きのアセットは長くキャッシュする', () =>
  expect(headerFor('/assets/**', 'Cache-Control')).toBe('public, max-age=31536000, immutable'))

test('デプロイ用設定の hosting は firebase.json と同じ', () =>
  expect(load('firebase.deploy.json').hosting).toEqual(fb.hosting))
