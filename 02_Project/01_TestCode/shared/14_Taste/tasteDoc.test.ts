import { describe, it, expect } from 'vitest'
import {
  parseTaste,
  serializeTaste,
  validateTaste,
  parseCharter,
  serializeCharter,
  validateCharter,
  type DocProblemKind,
  type TasteItem,
} from '@shared/14_Taste/tasteDoc'

const GLOBAL = [
  '# 전역 Taste',
  '',
  '## T1 정보 밀도',
  '- 원칙: 정보 밀도는 높게, 장식은 적게',
  '- 레퍼런스: https://example.com/dense.png',
  '- 금지: 카드 안의 장식 아이콘',
  '',
  '## T2 문서 말투',
  '- 원칙: 답을 먼저 쓴다',
  '- 원칙: 한 문장에 한 생각',
  '- 금지:',
  '',
].join('\n')

const CHARTER = [
  '# 프로젝트 헌장',
  '',
  '## 목표',
  '사람이 목표와 Taste를 정하면 에이전트가 마일스톤을 끝까지 맡는다.',
  '',
  '두 번째 문단도 목표에 든다.',
  '',
  '## 하지 않을 것',
  '- 클라우드 동기화',
  '- 모바일 앱',
  '',
].join('\n')

const kinds = (ps: { kind: DocProblemKind }[]): DocProblemKind[] => ps.map((p) => p.kind)

describe('Taste 문서 읽기·쓰기', () => {
  it('정상 문서는 검사 문제가 없고 항목·칸을 순서대로 읽는다', () => {
    expect(validateTaste(GLOBAL, 'global')).toEqual([])
    const doc = parseTaste(GLOBAL, 'global')
    expect(doc.scope).toBe('global')
    const items: TasteItem[] = doc.items
    expect(items.map((i) => [i.id, i.title])).toEqual([['T1', '정보 밀도'], ['T2', '문서 말투']])
    expect(items[0].fields).toEqual([
      { name: '원칙', text: '정보 밀도는 높게, 장식은 적게' },
      { name: '레퍼런스', text: 'https://example.com/dense.png' },
      { name: '금지', text: '카드 안의 장식 아이콘' },
    ])
    expect(items[1].fields.map((f) => f.name)).toEqual(['원칙', '원칙', '금지'])
    expect(items[1].fields[2].text).toBe('')
  })

  it('정상 문서는 읽고 다시 쓰면 같은 글이다 — 전역·프로젝트·항목 없는 문서', () => {
    expect(serializeTaste(parseTaste(GLOBAL, 'global'))).toBe(GLOBAL)
    const project = GLOBAL.replace('# 전역 Taste', '# 프로젝트 Taste')
    expect(validateTaste(project, 'project')).toEqual([])
    expect(serializeTaste(parseTaste(project, 'project'))).toBe(project)
    expect(serializeTaste(parseTaste('# 전역 Taste\n', 'global'))).toBe('# 전역 Taste\n')
    expect(serializeTaste({ scope: 'project', items: [{ id: 'T3', title: '', fields: [{ name: '금지', text: '그라데이션' }] }] }))
      .toBe('# 프로젝트 Taste\n\n## T3\n- 금지: 그라데이션\n')
  })

  it('CRLF·BOM 글은 LF 글과 같은 구조로 읽는다', () => {
    const crlf = String.fromCharCode(0xfeff) + GLOBAL.split('\n').join('\r\n')
    expect(parseTaste(crlf, 'global')).toEqual(parseTaste(GLOBAL, 'global'))
    expect(validateTaste(crlf, 'global')).toEqual([])
  })

  it('칸이 하나도 없는 항목을 문제로 돌려준다', () => {
    const text = '# 전역 Taste\n\n## T1 빈 항목\n\n## T2 찬 항목\n- 원칙: 있다\n'
    const ps = validateTaste(text, 'global')
    expect(kinds(ps)).toEqual(['empty-item'])
    expect(ps[0].line).toBe(3)
    expect(ps[0].message).toContain('T1')
    expect(parseTaste(text, 'global').items.map((i) => i.id)).toEqual(['T1', 'T2'])
  })

  it('겹치는 ID를 문제로 돌려주고 두 항목을 모두 남긴다', () => {
    const text = '# 전역 Taste\n\n## T1 하나\n- 원칙: a\n\n## T1 둘\n- 금지: b\n'
    const ps = validateTaste(text, 'global')
    expect(kinds(ps)).toEqual(['duplicate-id'])
    expect(ps[0].line).toBe(6)
    expect(parseTaste(text, 'global').items.map((i) => i.title)).toEqual(['하나', '둘'])
  })

  it('모르는 칸 이름을 문제로 돌려주고 그 칸을 구조에 남긴다', () => {
    const text = '# 전역 Taste\n\n## T1 색\n- 색상: 푸른 계열\n- 원칙: 대비는 높게\n'
    const ps = validateTaste(text, 'global')
    expect(kinds(ps)).toEqual(['unknown-field'])
    expect(ps[0].line).toBe(4)
    expect(ps[0].message).toContain('색상')
    expect(parseTaste(text, 'global').items[0].fields[0]).toEqual({ name: '색상', text: '푸른 계열' })
    expect(serializeTaste(parseTaste(text, 'global'))).toBe(text)
  })

  it('머리가 없거나 다른 층의 머리면 문제다 — 빈 글도 머리 없음이다', () => {
    expect(kinds(validateTaste('', 'global'))).toEqual(['bad-head'])
    expect(validateTaste('', 'global')[0].line).toBeNull()
    expect(kinds(validateTaste('# 프로젝트 Taste\n', 'global'))).toEqual(['bad-head'])
    expect(kinds(validateTaste('## T1 a\n- 원칙: b\n', 'project'))).toEqual(['bad-head'])
    expect(parseTaste('## T1 a\n- 원칙: b\n', 'project').items).toHaveLength(1)
  })

  it('ID 꼴이 아닌 항목 머리와 칸 밖의 줄을 문제로 돌려준다', () => {
    const text = '# 전역 Taste\n머리 밑 설명\n\n## 정보 밀도\n- 원칙: 버려진다\n\n## T2 b\n- 원칙: c\n그냥 문장\n'
    const ps = validateTaste(text, 'global')
    expect(kinds(ps)).toEqual(['stray-line', 'bad-heading', 'stray-line'])
    expect(ps.map((p) => p.line)).toEqual([2, 4, 9])
    expect(parseTaste(text, 'global').items.map((i) => i.id)).toEqual(['T2'])
  })

  it('검사는 어떤 글에도 던지지 않는다', () => {
    for (const t of ['', '\n\n', '#', '## ', '- :', '# 전역 Taste\n## T\n- 원칙', '\u0000\r\r\n', '## T1\n## T1\n']) {
      expect(() => validateTaste(t, 'global')).not.toThrow()
      expect(() => parseTaste(t, 'project')).not.toThrow()
    }
  })
})

describe('헌장 문서 읽기·쓰기', () => {
  it('정상 헌장은 문제가 없고 목표·하지 않을 것을 줄로 읽는다', () => {
    expect(validateCharter(CHARTER)).toEqual([])
    const doc = parseCharter(CHARTER)
    expect(doc.goal).toEqual(['사람이 목표와 Taste를 정하면 에이전트가 마일스톤을 끝까지 맡는다.', '', '두 번째 문단도 목표에 든다.'])
    expect(doc.nonGoals).toEqual(['- 클라우드 동기화', '- 모바일 앱'])
  })

  it('정상 헌장은 읽고 다시 쓰면 같은 글이다 — 하지 않을 것이 없는 헌장 포함', () => {
    expect(serializeCharter(parseCharter(CHARTER))).toBe(CHARTER)
    const goalOnly = '# 프로젝트 헌장\n\n## 목표\n한 문장.\n'
    expect(validateCharter(goalOnly)).toEqual([])
    expect(parseCharter(goalOnly).nonGoals).toBeNull()
    expect(serializeCharter(parseCharter(goalOnly))).toBe(goalOnly)
  })

  it('빈 목표와 목표 절이 없는 헌장을 문제로 돌려준다', () => {
    const empty = '# 프로젝트 헌장\n\n## 목표\n\n## 하지 않을 것\n- x\n'
    expect(kinds(validateCharter(empty))).toEqual(['empty-goal'])
    expect(validateCharter(empty)[0].line).toBe(3)
    expect(kinds(validateCharter('# 프로젝트 헌장\n\n## 하지 않을 것\n- x\n'))).toEqual(['empty-goal'])
    expect(validateCharter('# 프로젝트 헌장\n\n## 하지 않을 것\n- x\n')[0].line).toBeNull()
  })

  it('머리 없음·모르는 절·겹치는 절·절 밖의 줄을 문제로 돌려준다', () => {
    expect(kinds(validateCharter(''))).toEqual(['bad-head', 'empty-goal'])
    const text = '# 프로젝트 헌장\n앞 줄\n\n## 목표\na\n\n## 배경\nb\n\n## 목표\nc\n'
    const ps = validateCharter(text)
    expect(kinds(ps)).toEqual(['stray-line', 'bad-heading', 'bad-heading'])
    expect(ps.map((p) => p.line)).toEqual([2, 7, 10])
    expect(parseCharter(text).goal).toEqual(['a'])
  })

  it('검사는 어떤 글에도 던지지 않는다', () => {
    for (const t of ['', '#', '## 목표', '## 목표\n## 목표', '\r\n\r\n', '# 프로젝트 헌장\n## 하지 않을 것']) {
      expect(() => validateCharter(t)).not.toThrow()
      expect(() => parseCharter(t)).not.toThrow()
    }
  })
})
