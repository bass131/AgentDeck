import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const atomic = vi.hoisted(() => ({ files: [] as string[] }))
vi.mock('@main/05_Loop/realPorts/atomicWrite', async (importOriginal) => {
  const real = await importOriginal<typeof import('@main/05_Loop/realPorts/atomicWrite')>()
  return {
    ...real,
    writeFileAtomic: async (file: string, text: string): Promise<void> => {
      atomic.files.push(file)
      await real.writeFileAtomic(file, text)
    },
  }
})

import {
  globalTastePath,
  projectCharterPath,
  projectTastePath,
  readTasteDocs,
  writeGlobalTaste,
  writeProjectTaste,
  writeProjectCharter,
  loopDocsAppend,
  loadLoopDocsAppend,
} from '@main/13_Taste/tasteStore'
import { serializeTaste, serializeCharter, type TasteItem } from '@shared/14_Taste/tasteDoc'
import type { TasteDocsRead } from '@shared/14_Taste/taste'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-taste-store-'))
let ud = ''
let ws = ''

beforeEach(() => {
  ud = fs.mkdtempSync(path.join(root, 'ud-'))
  ws = fs.mkdtempSync(path.join(root, 'ws-'))
  atomic.files = []
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const ITEMS: TasteItem[] = [
  { id: 'T1', title: '정보 밀도', fields: [{ name: '원칙', text: '밀도는 높게' }, { name: '금지', text: '장식 아이콘' }] },
]
const CHARTER = { goal: ['에이전트가 마일스톤을 끝까지 맡는다.'], nonGoals: ['- 클라우드 동기화'] }

const listTree = (dir: string): string[] =>
  (fs.readdirSync(dir, { recursive: true }) as string[]).map((f) => String(f).split(path.sep).join('/')).sort()

describe('Taste·헌장 저장소', () => {
  it('거처는 앱 데이터 폴더의 taste/global-taste.md와 작업 폴더의 docs/agentdeck/ 두 장이다', () => {
    expect(globalTastePath(ud)).toBe(path.join(ud, 'taste', 'global-taste.md'))
    expect(projectCharterPath(ws)).toBe(path.join(ws, 'docs', 'agentdeck', '헌장.md'))
    expect(projectTastePath(ws)).toBe(path.join(ws, 'docs', 'agentdeck', 'Taste.md'))
  })

  it('없는 문서는 세 장 모두 「없음」으로 읽는다', async () => {
    const r: TasteDocsRead = await readTasteDocs(ud, ws)
    expect(r.global).toEqual({ absent: true, path: globalTastePath(ud) })
    expect(r.charter).toEqual({ absent: true, path: projectCharterPath(ws) })
    expect(r.project).toEqual({ absent: true, path: projectTastePath(ws) })
  })

  it('전역 Taste를 원자적 쓰기로 폴더째 만들어 쓰고, 다시 읽으면 원문·구조가 같고 문제가 없다', async () => {
    await writeGlobalTaste(ud, ITEMS)
    expect(atomic.files).toEqual([globalTastePath(ud)])
    const raw = fs.readFileSync(globalTastePath(ud), 'utf8')
    expect(raw).toBe(serializeTaste({ scope: 'global', items: ITEMS }))
    expect(raw.startsWith('# 전역 Taste\n')).toBe(true)
    const r = await readTasteDocs(ud, ws)
    expect(r.global).toEqual({ absent: false, path: globalTastePath(ud), raw, doc: { scope: 'global', items: ITEMS }, problems: [] })
    expect(r.charter.absent).toBe(true)
    expect(listTree(ud)).toEqual(['taste', 'taste/global-taste.md'])
  })

  it('프로젝트 헌장·Taste를 작업 폴더의 docs/agentdeck/에 쓰고 다시 읽는다 — 그 밖의 파일은 만들지 않는다', async () => {
    await writeProjectCharter(ws, CHARTER)
    await writeProjectTaste(ws, ITEMS)
    expect(atomic.files).toEqual([projectCharterPath(ws), projectTastePath(ws)])
    const r = await readTasteDocs(ud, ws)
    expect(r.charter).toEqual({ absent: false, path: projectCharterPath(ws), raw: serializeCharter(CHARTER), doc: CHARTER, problems: [] })
    expect(r.project.absent).toBe(false)
    if (!r.project.absent) {
      expect(r.project.raw.startsWith('# 프로젝트 Taste\n')).toBe(true)
      expect(r.project.doc).toEqual({ scope: 'project', items: ITEMS })
    }
    expect(r.global.absent).toBe(true)
    expect(listTree(ws)).toEqual(['docs', 'docs/agentdeck', 'docs/agentdeck/Taste.md', 'docs/agentdeck/헌장.md'])
  })

  it('빈 파일은 「없음」이 아니라 빈 문서다 — 원문은 빈 글이고 검사 문제가 붙는다', async () => {
    fs.mkdirSync(path.dirname(globalTastePath(ud)), { recursive: true })
    fs.writeFileSync(globalTastePath(ud), '')
    fs.mkdirSync(path.dirname(projectCharterPath(ws)), { recursive: true })
    fs.writeFileSync(projectCharterPath(ws), '')
    const r = await readTasteDocs(ud, ws)
    expect(r.global.absent).toBe(false)
    if (!r.global.absent) {
      expect(r.global.raw).toBe('')
      expect(r.global.doc.items).toEqual([])
      expect(r.global.problems.map((p) => p.kind)).toEqual(['bad-head'])
    }
    expect(r.charter.absent).toBe(false)
    if (!r.charter.absent) expect(r.charter.problems.map((p) => p.kind)).toEqual(['bad-head', 'empty-goal'])
    expect(r.project.absent).toBe(true)
  })

  it('층이 다른 머리를 쓴 파일은 그 거처의 꼴로 검사한다', async () => {
    fs.mkdirSync(path.dirname(projectTastePath(ws)), { recursive: true })
    fs.writeFileSync(projectTastePath(ws), serializeTaste({ scope: 'global', items: ITEMS }))
    const r = await readTasteDocs(ud, ws)
    expect(r.project.absent).toBe(false)
    if (!r.project.absent) expect(r.project.problems.map((p) => p.kind)).toEqual(['bad-head'])
  })

  it('파일이 없는 것 말고 읽기 실패는 「없음」으로 숨기지 않고 던진다', async () => {
    fs.mkdirSync(globalTastePath(ud), { recursive: true })
    await expect(readTasteDocs(ud, ws)).rejects.toThrow()
  })
})

describe('루프 세션에 싣는 Taste·헌장 덧붙임', () => {
  it('있는 문서만 짧은 머리 표지와 함께 전역 Taste·헌장·프로젝트 Taste 순으로 싣는다', () => {
    const text = loopDocsAppend({ global: '# 전역 Taste\n\n## T1 a\n- 원칙: b\n', charter: null, project: '# 프로젝트 Taste\n\n## T1 c\n- 금지: d\n' })
    expect(text).toBe(
      '[전역 Taste]\n# 전역 Taste\n\n## T1 a\n- 원칙: b\n\n[프로젝트 Taste — docs/agentdeck/Taste.md]\n# 프로젝트 Taste\n\n## T1 c\n- 금지: d',
    )
    expect(loopDocsAppend({ global: null, charter: '# 프로젝트 헌장\n\n## 목표\nx\n', project: null }))
      .toBe('[프로젝트 헌장 — docs/agentdeck/헌장.md]\n# 프로젝트 헌장\n\n## 목표\nx')
  })

  it('문서가 하나도 없거나 모두 빈 글이면 덧붙임이 없다', () => {
    expect(loopDocsAppend({ global: null, charter: null, project: null })).toBeUndefined()
    expect(loopDocsAppend({ global: '  \n', charter: '', project: null })).toBeUndefined()
  })

  it('두 거처에서 원문을 읽어 덧붙임을 만든다 — 앱 데이터 폴더를 모르면 전역 Taste만 뺀다', async () => {
    await writeGlobalTaste(ud, ITEMS)
    await writeProjectCharter(ws, CHARTER)
    const both = await loadLoopDocsAppend(ud, ws)
    expect(both).toContain('[전역 Taste]\n# 전역 Taste')
    expect(both).toContain('[프로젝트 헌장 — docs/agentdeck/헌장.md]\n# 프로젝트 헌장')
    expect(both).not.toContain('[프로젝트 Taste')
    const projectOnly = await loadLoopDocsAppend(undefined, ws)
    expect(projectOnly).not.toContain('[전역 Taste]')
    expect(projectOnly).toContain('에이전트가 마일스톤을 끝까지 맡는다.')
    expect(await loadLoopDocsAppend(ud, path.join(root, 'no-such-ws'))).toContain('[전역 Taste]')
  })

  it('한 장의 읽기 실패는 그 장만 빼고 세션을 막지 않는다', async () => {
    await writeProjectCharter(ws, CHARTER)
    fs.mkdirSync(globalTastePath(ud), { recursive: true })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const text = await loadLoopDocsAppend(ud, ws)
      expect(text).toContain('[프로젝트 헌장')
      expect(text).not.toContain('[전역 Taste]')
      expect(err).toHaveBeenCalled()
    } finally {
      err.mockRestore()
    }
  })
})
