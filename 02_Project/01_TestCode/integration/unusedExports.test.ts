// M11 G6(M05 Backlog 18) — 자기 파일 밖(소스·시험 어디에서도) 이름이 안 나오는 export를 0으로 묶는다.
// 셈법: 파일마다 식별자 토큰 집합을 만들고, 선언한 파일 밖의 어느 집합에도 이름이 없으면 「안 쓰는 export」다.
// 시험만 쓰는 export는 쓰는 곳이 있는 것으로 센다 — 시험이 고정하는 계약이라 지우지 않는다.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SRC_DIR = '02_Project/00_Source'
const TEST_DIR = '02_Project/01_TestCode'
const SELF = `${TEST_DIR}/integration/unusedExports.test.ts`

function list(dir: string, ext: RegExp): string[] {
  return readdirSync(path.join(ROOT, dir), { recursive: true })
    .map((f) => `${dir}/${String(f).replace(/\\/g, '/')}`)
    .filter((f) => ext.test(f) && !f.includes('node_modules'))
}

const DECL = /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|function\*?|class|type|interface|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm
const tokens = (t: string): Set<string> => new Set(t.match(/[A-Za-z_$][\w$]*/g) ?? [])

function unusedExports(text: ReadonlyMap<string, string>, isSource: (f: string) => boolean): string[] {
  const owners = new Map<string, number>()
  for (const t of text.values()) for (const tok of tokens(t)) owners.set(tok, (owners.get(tok) ?? 0) + 1)
  const out: string[] = []
  for (const [f, t] of text) {
    if (!isSource(f)) continue
    for (const m of t.matchAll(DECL)) if (owners.get(m[1]) === 1) out.push(`${f}:${m[1]}`)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

describe('안 쓰는 export 래칫 (M05 Backlog 18)', () => {
  it('셈법은 다른 파일에서 이름이 안 나오는 export만 잡는다', () => {
    const text = new Map([
      ['src/a.ts', 'export const used = 1\nexport interface Lonely { x: number }\nexport function onlyTest() {}'],
      ['src/b.ts', "import { used } from './a'\nvoid used"],
      ['test/a.test.ts', "import { onlyTest } from '../src/a'"],
    ])
    expect(unusedExports(text, (f) => f.startsWith('src/'))).toEqual(['src/a.ts:Lonely'])
  })

  it('소스의 export는 모두 자기 파일 밖에서 이름이 나온다', () => {
    const src = list(SRC_DIR, /\.(ts|tsx)$/)
    const tests = list(TEST_DIR, /\.(ts|tsx|mts|cts|mjs|cjs|js)$/).filter((f) => f !== SELF)
    expect(src.length).toBeGreaterThan(300)
    const text = new Map([...src, ...tests].map((f) => [f, readFileSync(path.join(ROOT, f), 'utf8')]))
    expect(unusedExports(text, (f) => f.startsWith(SRC_DIR))).toEqual([])
  })
})
