// M09 G2 — 실행 상태의 앱 쪽 다이제스트. 실행기가 run-state.json을 쓸 때마다 그 정규 JSON(키 정렬)의 sha256을
// 작업 저장소 밖(Electron userData 아래)에 적는다. 실행기는 읽을 때 다르면 멈춘다(loopRunner).
// 작업 세션은 작업 저장소 안을 쓸 수 있고, Bash로 상태 파일을 고치는 길은 명령 글자 판정으로 다 닫히지 않으므로
// 이것이 위조 방어의 정본이다. 세션이 앱 영역을 쓰는 길은 G2 2차분의 잠금 노드(앱 엔진·설정 경로 잠금과 같은 겹)가 막는다.
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

function fileOf(dir: string, repoKey: string): string {
  if (!KEY.test(repoKey)) throw new Error('다이제스트 키가 sha256 16진수가 아니다')
  return path.join(dir, `${repoKey}.sha256`)
}

export function createFileDigestStore(dir: string): DigestStore {
  return {
    async read(repoKey) {
      try {
        return (await fsp.readFile(fileOf(dir, repoKey), 'utf8')).trim()
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    async write(repoKey, hash) {
      const file = fileOf(dir, repoKey)
      await fsp.mkdir(dir, { recursive: true })
      await writeFileAtomic(file, `${hash}\n`)
    },
  }
}
