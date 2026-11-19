// M09 G2 — 실행 상태의 앱 쪽 다이제스트. 실행기가 run-state.json을 쓸 때마다 그 정규 JSON(키 정렬)의 sha256을
// 작업 저장소 밖(Electron userData 아래)에 적는다. 실행기는 읽을 때 다르면 멈춘다(loopRunner).
// 이것은 편집 도구와 순진한 Bash 편집을 잡는 겹이다 — 키 없는 해시라 세션이 앱 영역에 쓰면 맞출 수 있다(보증이 아니다).
// 세션의 앱 영역 쓰기는 루프 잠금 노드가 명령 글자로 막는다(역시 겹). HMAC은 쓰지 않는다 — 비밀을 세션이 읽을 수 있어 의미가 없다.
// 위조 래치(`<key>.latch`) — 실행기가 한 번 불일치를 보면 사유를 적는다. 걸려 있으면 짝이 맞아도 멈춘다. 푸는 길은 G3(사람)이다.
// 이 모듈은 electron을 import하지 않는다 — 경로는 부르는 쪽(G3 조립)이 getUserDataDir()로 만들어 넘긴다.
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { DigestStore } from './ports'
import { writeFileAtomic } from './realPorts/atomicWrite'
import { canonicalJson } from './template'

const KEY = /^[0-9a-f]{64}$/

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

// 작업 저장소 경로 → 키. 경로 표기 차이(구분자·끝 구분자, Windows의 대소문자)로 갈리지 않게 정규화한다.
// 부르는 쪽이 실제 경로(realpath)를 넘기면 링크 차이로도 갈리지 않는다.
export function repoKeyOf(cwd: string): string {
  let p = path.resolve(cwd).replace(/\\/g, '/').replace(/\/+$/, '')
  if (process.platform === 'win32') p = p.toLowerCase()
  return sha256(p)
}

// 파싱한 상태 값의 정규 JSON sha256. 파일에 쓴 텍스트를 다시 파싱한 값과 같은 값을 준다(줄바꿈·들여쓰기와 무관).
export function stateDigest(value: unknown): string {
  return sha256(canonicalJson(value))
}

function fileOf(dir: string, repoKey: string, ext = 'sha256'): string {
  if (!KEY.test(repoKey)) throw new Error('다이제스트 키가 sha256 16진수가 아니다')
  return path.join(dir, `${repoKey}.${ext}`)
}

async function readText(file: string): Promise<string | null> {
  try {
    return (await fsp.readFile(file, 'utf8')).trim()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export function createFileDigestStore(dir: string): DigestStore {
  const put = async (file: string, text: string): Promise<void> => {
    await fsp.mkdir(dir, { recursive: true })
    await writeFileAtomic(file, `${text}\n`)
  }
  return {
    // G4 검수 I1 — 상태 본문의 사본(`<key>.state.json`). 바이트 그대로 쓰고 읽는다(다듬지 않는다).
    writeCopy: async (repoKey, text) => {
      await fsp.mkdir(dir, { recursive: true })
      await writeFileAtomic(fileOf(dir, repoKey, 'state.json'), text)
    },
    readCopy: async (repoKey) => {
      try {
        return await fsp.readFile(fileOf(dir, repoKey, 'state.json'), 'utf8')
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    read: async (repoKey) => readText(fileOf(dir, repoKey)),
    write: async (repoKey, hash) => put(fileOf(dir, repoKey), hash),
    readLatch: async (repoKey) => (await readText(fileOf(dir, repoKey, 'latch'))) || null,
    writeLatch: async (repoKey, reason) => put(fileOf(dir, repoKey, 'latch'), reason.replace(/\r?\n/g, ' ')),
    // M09 G4 — 사람의 「확인하고 풀기」(loopDriver)만 부른다. 없는 파일은 그대로 지나간다.
    clearLatch: async (repoKey) => fsp.rm(fileOf(dir, repoKey, 'latch'), { force: true }),
    remove: async (repoKey) => fsp.rm(fileOf(dir, repoKey), { force: true }),
    latchPath: (repoKey) => fileOf(dir, repoKey, 'latch'),
  }
}
