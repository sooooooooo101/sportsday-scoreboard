import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { moveAdmin, validateAdminPath } from '../scripts/move-admin'

test.each(['', 'admin', 'short', 'has/slash', '../escape-123456789', 'UPPER-not-allowed-123'])('推測しやすい・不正な管理パス %s は拒否する', p =>
  expect(() => validateAdminPath(p)).toThrow())

test('24 文字以上の小文字英数字なら受け付ける', () =>
  expect(validateAdminPath('k7f3m9q2x8w4z1b6n5v0c3d7')).toBe('k7f3m9q2x8w4z1b6n5v0c3d7'))

test('dist/admin を秘密のパスへ移し、/admin は残さない', () => {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'))
  mkdirSync(join(dist, 'admin'))
  writeFileSync(join(dist, 'admin', 'index.html'), '<html>admin</html>')
  moveAdmin(dist, 'k7f3m9q2x8w4z1b6n5v0c3d7')
  expect(existsSync(join(dist, 'admin'))).toBe(false)
  expect(readFileSync(join(dist, 'k7f3m9q2x8w4z1b6n5v0c3d7', 'index.html'), 'utf8')).toContain('admin')
})

test('dist/admin がなければ止める（ビルド前に実行した場合）', () => {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'))
  expect(() => moveAdmin(dist, 'k7f3m9q2x8w4z1b6n5v0c3d7')).toThrow()
})

test('管理画面の HTML は検索エンジンに載せない', () =>
  expect(readFileSync('admin/index.html', 'utf8')).toContain('<meta name="robots" content="noindex, nofollow" />'))
