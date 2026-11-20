import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface LintMessage { ruleId: string | null; message: string }
interface LintEngine { lintText(code: string, o: { filePath: string }): Promise<{ messages: LintMessage[] }[]> }

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SRC = path.join(ROOT, '02_Project', '00_Source')
const BOUNDARY_RULES = new Set(['no-restricted-imports', 'no-restricted-syntax'])

let eslint: LintEngine

beforeAll(() => {
  const { ESLint } = createRequire(import.meta.url)('eslint') as { ESLint: new (o: { cwd: string }) => LintEngine }
  eslint = new ESLint({ cwd: ROOT })
})

async function boundaryHits(rel: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(SRC, rel) })
  return result.messages.filter((m) => m.ruleId !== null && BOUNDARY_RULES.has(m.ruleId)).map((m) => m.message)
}

const RENDERER_FILE = 'renderer/src/00_App/probe.ts'

describe('프로세스 경계 lint — 위반 꼴 고정물', () => {
  it.each([
    ['정적 import', `import { x } from '../../../main/00_App/bootstrap'\nvoid x`],
    ['동적 import()', `export const m = import('../../../main/00_App/bootstrap')`],
    ['별칭 동적 import()', `export const m = import('@main/00_App/bootstrap')`],
    ['typeof import()', `export type T = typeof import('@main/00_App/bootstrap')`],
    ['타입 위치 import().T', `export let v: import('../../../preload').Api | null = null`],
    ['소스 루트 경유', `export const m = import('../../../../00_Source/main/x')`],
  ])('renderer가 main·preload를 %s로 가져오면 걸린다', async (_name, code) => {
    expect(await boundaryHits(RENDERER_FILE, code)).not.toEqual([])
  })

  it.each([
    ['대소문자만 같은 이름', `import { x } from '../Main'\nvoid x`],
    ['대소문자만 같은 preload', `export const m = import('../Preload')`],
    ['하위 폴더 이름 main', `import { x } from './sub/main/x'\nvoid x`],
    ['shared 별칭 동적 import()', `export const m = import('@shared/ipcContract')`],
  ])('renderer의 %s는 걸리지 않는다', async (_name, code) => {
    expect(await boundaryHits(RENDERER_FILE, code)).toEqual([])
  })

  it.each([
    ['상대 경로', `import { x } from '../main/00_App/bootstrap'\nvoid x`],
    ['별칭 경로', `import { x } from '@main/00_App/bootstrap'\nvoid x`],
    ['동적 import()', `export const m = import('../main/00_App/bootstrap')`],
    ['renderer', `import { x } from '../renderer/src/main'\nvoid x`],
  ])('preload가 %s로 main·renderer를 가져오면 걸린다', async (_name, code) => {
    expect(await boundaryHits('preload/index.ts', code)).not.toEqual([])
  })

  it('preload가 shared를 가져오는 것은 걸리지 않는다', async () => {
    expect(await boundaryHits('preload/index.ts', `import { x } from '../shared/ipcContract'\nvoid x`)).toEqual([])
  })

  it('env.d.ts는 preload 타입만 가져올 수 있다', async () => {
    expect(await boundaryHits('renderer/src/env.d.ts', `import type { Api } from '../../preload'\nexport type A = Api`)).toEqual([])
    expect(await boundaryHits('renderer/src/env.d.ts', `export type T = typeof import('../../main/00_App/bootstrap')`)).not.toEqual([])
  })

  it('main은 renderer를, shared는 main을 동적으로도 가져오지 못한다', async () => {
    expect(await boundaryHits('main/00_App/probe.ts', `export const m = import('../../renderer/src/main')`)).not.toEqual([])
    expect(await boundaryHits('shared/01_Ipc/probe.ts', `export type T = typeof import('@main/00_App/bootstrap')`)).not.toEqual([])
  })
})

describe('renderer 소스는 shared를 별칭으로 가져온다 (M05 Backlog 36)', () => {
  it('상대 경로로 shared를 가리키는 import가 없다', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const dir = path.join(SRC, 'renderer', 'src')
    const rel = /(?:from|import\()\s*'(?:\.\.\/)+shared\//
    const hits = (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && rel.test(readFileSync(path.join(dir, f), 'utf8')))
    expect(hits).toEqual([])
  })
})
