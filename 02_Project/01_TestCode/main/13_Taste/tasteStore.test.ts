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
  TasteWriteError,
  LOOP_DOC_MAX_BYTES,
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

  it('읽기 실패는 「없음」으로 숨기지 않고 그 장의 문제로 돌려주며, 다른 장은 그대로 읽는다', async () => {
    await writeProjectCharter(ws, CHARTER)
    fs.mkdirSync(globalTastePath(ud), { recursive: true })
    const r = await readTasteDocs(ud, ws)
    expect(r.global.absent).toBe(false)
    if (!r.global.absent) {
      expect(r.global.raw).toBe('')
      expect(r.global.problems.map((p) => p.kind)).toEqual(['unreadable'])
    }
    expect(r.charter).toMatchObject({ absent: false, doc: CHARTER, problems: [] })
  })

  it('저장소에 docs라는 파일이 있으면(ENOTDIR) 프로젝트 두 장은 「없음」이고 전역 Taste는 그대로 읽는다', async () => {
    await writeGlobalTaste(ud, ITEMS)
    fs.writeFileSync(path.join(ws, 'docs'), 'not a folder')
    const r = await readTasteDocs(ud, ws)
    expect(r.global).toMatchObject({ absent: false, problems: [] })
    expect(r.charter.absent).toBe(true)
    expect(r.project.absent).toBe(true)
  })

  it('docs/agentdeck이 저장소 밖을 가리키는 junction이면 읽지도 쓰지도 않는다', async () => {
    const outside = fs.mkdtempSync(path.join(root, 'outside-'))
    fs.writeFileSync(path.join(outside, 'Taste.md'), serializeTaste({ scope: 'project', items: ITEMS }))
    fs.mkdirSync(path.join(ws, 'docs'))
    fs.symlinkSync(outside, path.join(ws, 'docs', 'agentdeck'), 'junction')
    const r = await readTasteDocs(ud, ws)
    expect(r.project.absent).toBe(false)
    if (!r.project.absent) {
      expect(r.project.raw).toBe('')
      expect(r.project.problems.map((p) => p.kind)).toEqual(['unreadable'])
    }
    await expect(writeProjectCharter(ws, CHARTER)).rejects.toThrow('뿌리 밖')
    expect(fs.readdirSync(outside)).toEqual(['Taste.md'])
    const text = await loadLoopDocsAppend(undefined, ws)
    expect(text ?? '').not.toContain('밀도는 높게')
  })
})

describe('쓰기는 구조를 지키지 못하는 입력과 문제 있는 기존 문서를 거절한다', () => {
  const reason = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p
    } catch (e) {
      if (e instanceof TasteWriteError) return e.kind
      throw e
    }
    return 'written'
  }

  it('칸 글의 줄바꿈(다시 읽으면 항목이 둘), 쌍점이 든 칸 이름, 절 머리 꼴의 목표 줄을 bad-input으로 거절한다', async () => {
    const injected: TasteItem[] = [{ id: 'T1', title: 'a', fields: [{ name: '원칙', text: 'x\n## T9 z\n- 금지: y' }] }]
    expect(await reason(writeGlobalTaste(ud, injected))).toBe('bad-input')
    expect(await reason(writeProjectTaste(ws, [{ id: 'T1', title: 'a', fields: [{ name: '원칙: 몰래', text: 'x' }] }]))).toBe('bad-input')
    expect(await reason(writeProjectCharter(ws, { goal: ['한 줄', '## 하지 않을 것', '- 몰래'], nonGoals: null }))).toBe('bad-input')
    expect(await reason(writeProjectTaste(ws, [{ id: 'T1', title: '제목\r', fields: [{ name: '원칙', text: 'x' }] }]))).toBe('bad-input')
    expect(await reason(writeProjectCharter(ws, { goal: ['```'], nonGoals: null }))).toBe('bad-input')
    expect(fs.existsSync(globalTastePath(ud))).toBe(false)
    expect(fs.existsSync(path.join(ws, 'docs'))).toBe(false)
    expect(atomic.files).toEqual([])
  })

  it('다시 읽으면 문제가 생길 글(칸 없는 항목·빈 목표)도 bad-input이다 — 쓰고 나면 다음 쓰기가 막히는 글을 만들지 않는다', async () => {
    expect(await reason(writeGlobalTaste(ud, [{ id: 'T1', title: 'a', fields: [] }]))).toBe('bad-input')
    expect(await reason(writeProjectCharter(ws, { goal: [], nonGoals: null }))).toBe('bad-input')
  })

  it('지금 파일에 문제가 있으면 덮어쓰지 않고 existing-problems와 그 문제를 돌려준다', async () => {
    const cases: [string, string, () => Promise<void>][] = [
      [projectCharterPath(ws), '# 프로젝트 헌장\n\n## 소개\n사람이 쓴 소개\n\n## 목표\na\n', () => writeProjectCharter(ws, CHARTER)],
      [projectTastePath(ws), '# 프로젝트 Taste\n\n## T1 a\n- 원칙: x\n- see https://x\n', () => writeProjectTaste(ws, ITEMS)],
      [globalTastePath(ud), '# 전역 Taste\n\n## T1 a\n- 원칙: x\n```\n## T2 b\n```\n', () => writeGlobalTaste(ud, ITEMS)],
    ]
    for (const [file, before, write] of cases) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, before)
      let caught: unknown
      await write().catch((e: unknown) => { caught = e })
      expect(caught).toBeInstanceOf(TasteWriteError)
      expect((caught as TasteWriteError).kind).toBe('existing-problems')
      expect((caught as TasteWriteError).problems.length).toBeGreaterThan(0)
      expect(fs.readFileSync(file, 'utf8')).toBe(before)
    }
    expect(atomic.files).toEqual([])
  })

  it('문제 없는 기존 문서와 빈 파일은 덮어쓴다', async () => {
    await writeProjectTaste(ws, ITEMS)
    const next: TasteItem[] = [...ITEMS, { id: 'T2', title: 'b', fields: [{ name: '레퍼런스', text: 'https://x.example' }] }]
    await writeProjectTaste(ws, next)
    const r = await readTasteDocs(ud, ws)
    expect(r.project).toMatchObject({ absent: false, doc: { items: next }, problems: [] })
    fs.mkdirSync(path.dirname(globalTastePath(ud)), { recursive: true })
    fs.writeFileSync(globalTastePath(ud), '\n')
    await writeGlobalTaste(ud, ITEMS)
    expect(fs.readFileSync(globalTastePath(ud), 'utf8')).toBe(serializeTaste({ scope: 'global', items: ITEMS }))
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

  it('크기 상한을 넘는 장은 싣지 않고 그 사실을 한 줄로 알리며 main 로그에 남긴다', async () => {
    await writeProjectCharter(ws, CHARTER)
    const big = `# 프로젝트 Taste\n\n## T1 a\n- 원칙: ${'가'.repeat(LOOP_DOC_MAX_BYTES)}\n`
    fs.writeFileSync(projectTastePath(ws), big)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const text = await loadLoopDocsAppend(undefined, ws)
      expect(text).toContain('[프로젝트 헌장')
      expect(text).toContain(`[프로젝트 Taste — docs/agentdeck/Taste.md] 크기 ${Buffer.byteLength(big)}바이트가 상한 ${LOOP_DOC_MAX_BYTES}바이트를 넘어 싣지 않았다.`)
      expect(text).not.toContain('가가가')
      expect(text!.length).toBeLessThan(2000)
      expect(err).toHaveBeenCalled()
    } finally {
      err.mockRestore()
    }
    expect(LOOP_DOC_MAX_BYTES).toBe(32 * 1024)
    expect(loopDocsAppend({ global: { tooLarge: 40000 }, charter: null, project: null }))
      .toBe('[전역 Taste] 크기 40000바이트가 상한 32768바이트를 넘어 싣지 않았다.')
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
