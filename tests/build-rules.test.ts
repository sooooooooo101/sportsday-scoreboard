import { readFileSync } from 'node:fs'
import { injectUid, readEnvFile } from '../scripts/build-rules'

const template = readFileSync('firestore.rules', 'utf8')

test('マーカーを UID に置き換える', () => {
  const out = injectUid(template, 'AbCdEf0123456789xyzUVW')
  expect(out).toContain("request.auth.uid == 'AbCdEf0123456789xyzUVW'")
  expect(out).not.toContain("'SCORER_UID'")
})

test.each(['', 'SCORER_UID', "abc' || true || '", 'short'])('不正な UID %s は拒否する', uid =>
  expect(() => injectUid(template, uid)).toThrow())

test('テンプレートにマーカーがなければ拒否する', () =>
  expect(() => injectUid('rules_version = "2";', 'AbCdEf0123456789xyzUVW')).toThrow())

test('.env 形式から値を読む（コメント・空行・引用符に対応）', () => {
  expect(readEnvFile('# c\n\nSCORER_UID="AbCdEf0123456789xyzUVW"\nX=1\n')).toEqual({ SCORER_UID: 'AbCdEf0123456789xyzUVW', X: '1' })
})
