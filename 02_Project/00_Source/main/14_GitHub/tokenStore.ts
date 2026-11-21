// 앱의 GitHub 토큰 저장. safeStorage(Windows는 DPAPI)로 암호화한 덩어리를 base64 글로 앱 데이터의 파일 하나에 쓴다.
// 암호화를 쓸 수 없으면 쓰지 않는다. electron은 부르는 쪽이 넣는다.
import fs, { promises as fsp } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from '../05_Loop/realPorts/atomicWrite'

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(cipher: Buffer): string
}

interface StoredAuth { token: string; login: string }
type StoredRead = { kind: 'none' } | { kind: 'ok'; auth: StoredAuth } | { kind: 'unreadable' }

export interface TokenStore {
  available(): boolean
  read(): StoredRead
  write(auth: StoredAuth): Promise<{ ok: true } | { ok: false; reason: string }>
  clear(): Promise<void>
}

// 앱 데이터(userData) 안의 파일 이름
export const GITHUB_AUTH_FILE = 'github-auth.bin'
export const NO_SAFE_STORAGE ='이 PC에서 자격 보호(safeStorage)를 쓸 수 없어 토큰을 저장하지 않았어요'

export function createTokenStore(opts: { file: string; safeStorage: SafeStorageLike }): TokenStore {
  const available = (): boolean => {
    try { return opts.safeStorage.isEncryptionAvailable() } catch { return false }
  }
  return {
    available,
    read() {
      let raw: string
      try { raw = fs.readFileSync(opts.file, 'utf8') } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'none' } : { kind: 'unreadable' }
      }
      if (!available()) return { kind: 'unreadable' }
      try {
        const parsed = JSON.parse(opts.safeStorage.decryptString(Buffer.from(raw.trim(), 'base64'))) as Partial<StoredAuth>
        if (typeof parsed.token !== 'string' || !parsed.token || typeof parsed.login !== 'string') return { kind: 'unreadable' }
        return { kind: 'ok', auth: { token: parsed.token, login: parsed.login } }
      } catch {
        return { kind: 'unreadable' }
      }
    },
    async write(auth) {
      if (!available()) return { ok: false, reason: NO_SAFE_STORAGE }
      const cipher = opts.safeStorage.encryptString(JSON.stringify({ token: auth.token, login: auth.login }))
      await fsp.mkdir(path.dirname(opts.file), { recursive: true })
      await writeFileAtomic(opts.file, `${cipher.toString('base64')}\n`)
      return { ok: true }
    },
    async clear() {
      await fsp.rm(opts.file, { force: true })
    },
  }
}

export function storedToken(store: TokenStore): string | null {
  const r = store.read()
  return r.kind === 'ok' ? r.auth.token : null
}
