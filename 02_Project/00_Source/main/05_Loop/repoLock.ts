// M09 G2 — 저장소당 실행기 하나(M09 Backlog 2). 앱 영역(userData 아래)의 잠금 파일 `<repoKey>.lock`을 배타 생성(wx)으로 잡는다.
// 같은 프로세스 안은 메모리 표로, 다른 프로세스는 파일로 막는다.
// 죽은 잠금의 처리:
//   - 파일의 pid가 살아 있는 다른 프로세스 → 거부(사유에 pid와 파일 경로 — 사람이 확인하고 지울 수 있게).
//   - pid가 죽었다(process.kill(pid, 0)이 ESRCH) → 앞 실행이 정리 없이 꺼진 것으로 보고 넘겨받는다.
//   - pid가 이 프로세스인데 메모리 표에 없다 → 앞 실행의 찌꺼기(pid 재사용)로 보고 넘겨받는다.
//   - 파일이 읽히지 않는다 → 다른 실행이 막 만들고 아직 쓰지 않았을 수 있어 5초 동안은 거부, 그보다 오래됐으면 넘겨받는다.
// 한계: 죽은 앱의 pid를 다른 프로그램이 다시 쓰고 있으면 살아 있는 것으로 보여 거부한다(사유의 경로를 사람이 지운다).
// 넘겨받기는 지우고 다시 wx로 잡는 것이라, 둘이 동시에 넘겨받으려 해도 하나만 잡는다.
import { randomBytes } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

export interface RepoLock {
  readonly file: string
  release(): Promise<void>
}
export type LockResult = { ok: true; lock: RepoLock } | { ok: false; reason: string }

const KEY = /^[0-9a-f]{64}$/
const FRESH_MS = 5_000
const held = new Set<string>()

interface LockBody { pid: number; token: string; cwd: string; at: string }

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function readBody(file: string): Promise<LockBody | null> {
  try {
    const raw = JSON.parse(await fsp.readFile(file, 'utf8')) as Partial<LockBody>
    return typeof raw.pid === 'number' && Number.isInteger(raw.pid) && typeof raw.token === 'string' ? raw as LockBody : null
  } catch {
    return null
  }
}

async function tryCreate(file: string, body: LockBody): Promise<boolean> {
  try {
    await fsp.writeFile(file, JSON.stringify(body), { flag: 'wx' })
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw e
  }
}

export async function acquireRepoLock(dir: string, repoKey: string, info: { cwd: string }): Promise<LockResult> {
  if (!KEY.test(repoKey)) throw new Error('잠금 키가 sha256 16진수가 아니다')
  const file = path.join(dir, `${repoKey}.lock`)
  const id = path.resolve(file).toLowerCase()
  if (held.has(id)) return { ok: false, reason: `이 저장소(${info.cwd})의 실행기가 이미 이 앱에서 돌고 있다` }
  await fsp.mkdir(dir, { recursive: true })
  const body: LockBody = { pid: process.pid, token: randomBytes(8).toString('hex'), cwd: info.cwd, at: new Date().toISOString() }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (await tryCreate(file, body)) {
      held.add(id)
      return {
        ok: true,
        lock: {
          file,
          release: async () => {
            held.delete(id)
            const now = await readBody(file)
            if (now?.token === body.token) await fsp.rm(file, { force: true })
          },
        },
      }
    }
    const other = await readBody(file)
    if (other === null) {
      const age = await fsp.stat(file).then((s) => Date.now() - s.mtimeMs, () => Infinity)
      if (age < FRESH_MS) return { ok: false, reason: `이 저장소의 실행기 잠금(${file})을 다른 실행이 막 잡는 중이다 — 잠시 뒤 다시 연다` }
    } else if (other.pid !== process.pid && alive(other.pid)) {
      return { ok: false, reason: `이 저장소(${info.cwd})의 실행기가 이미 다른 프로세스(pid ${other.pid})에서 돌고 있다 — 그 프로세스가 아니면 잠금 파일 ${file}을 지운다` }
    }
    // 죽은 잠금 — 지우고 한 번 더 잡아 본다
    await fsp.rm(file, { force: true })
  }
  return { ok: false, reason: `이 저장소의 실행기 잠금(${file})을 잡지 못했다 — 다른 실행과 겹쳤다` }
}
