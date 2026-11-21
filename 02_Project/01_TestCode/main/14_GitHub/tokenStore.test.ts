// 토큰 저장 — safeStorage 가짜로 본다. 파일에는 평문이 없고, 암호화를 쓸 수 없으면 저장하지 않는다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GITHUB_AUTH_FILE, NO_SAFE_STORAGE, createTokenStore, storedToken, type SafeStorageLike } from '@main/14_GitHub/tokenStore'

const TOKEN = 'gho_plainTokenMustNotLeak42'

// 바이트를 뒤집고 xor한다 — 평문도, 평문의 base64도 파일에 남지 않는다
function fakeSafeStorage(available = true): SafeStorageLike & { encrypted: number } {
  const f = {
    encrypted: 0,
    isEncryptionAvailable: () => available,
    encryptString: (s: string): Buffer => { f.encrypted++; return Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ 0x5a).reverse()) },
    decryptString: (b: Buffer): string => Buffer.from(Buffer.from(b).reverse().map((x) => x ^ 0x5a)).toString('utf8'),
  }
  return f
}

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-ghstore-'))
  file = path.join(dir, GITHUB_AUTH_FILE)
  expect(GITHUB_AUTH_FILE).toBe('github-auth.bin')
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('토큰 저장', () => {
  it('safeStorage로 암호화해 파일 하나에 쓰고, 읽기는 토큰과 계정 이름을 돌려준다', async () => {
    const safe = fakeSafeStorage()
    const store = createTokenStore({ file, safeStorage: safe })
    expect(store.read()).toEqual({ kind: 'none' })
    expect(await store.write({ token: TOKEN, login: 'octocat' })).toEqual({ ok: true })
    expect(safe.encrypted).toBe(1)
    const raw = fs.readFileSync(file)
    expect(raw.toString('utf8')).not.toContain(TOKEN)
    expect(raw.toString('latin1')).not.toContain(TOKEN)
    expect(raw.toString('utf8')).not.toContain(Buffer.from(TOKEN).toString('base64').slice(0, 16))
    expect(raw.toString('utf8')).not.toContain('octocat')
    expect(store.read()).toEqual({ kind: 'ok', auth: { token: TOKEN, login: 'octocat' } })
    expect(storedToken(store)).toBe(TOKEN)
    expect(fs.readdirSync(dir)).toEqual(['github-auth.bin'])
  })

  it('safeStorage를 쓸 수 없으면 저장하지 않고 이유를 돌려준다', async () => {
    const store = createTokenStore({ file, safeStorage: fakeSafeStorage(false) })
    expect(store.available()).toBe(false)
    expect(await store.write({ token: TOKEN, login: 'octocat' })).toEqual({ ok: false, reason: NO_SAFE_STORAGE })
    expect(fs.existsSync(file)).toBe(false)
    expect(storedToken(store)).toBeNull()
  })

  it('지우기는 파일을 없애고, 없을 때 지워도 괜찮다', async () => {
    const store = createTokenStore({ file, safeStorage: fakeSafeStorage() })
    await store.write({ token: TOKEN, login: 'octocat' })
    await store.clear()
    expect(fs.existsSync(file)).toBe(false)
    await store.clear()
    expect(store.read()).toEqual({ kind: 'none' })
  })

  it('풀리지 않는 파일은 읽지 못함이고 토큰을 내지 않는다', async () => {
    fs.writeFileSync(file, 'not-base64-cipher!!')
    const broken: SafeStorageLike = { ...fakeSafeStorage(), decryptString: () => { throw new Error('decrypt failed') } }
    const store = createTokenStore({ file, safeStorage: broken })
    expect(store.read()).toEqual({ kind: 'unreadable' })
    expect(storedToken(store)).toBeNull()
    const off = createTokenStore({ file, safeStorage: fakeSafeStorage(false) })
    expect(off.read()).toEqual({ kind: 'unreadable' })
  })
})
