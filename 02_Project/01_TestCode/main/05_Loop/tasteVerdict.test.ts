// 검수의 Taste 판 — 체크리스트(두 층의 ID 머리), TASTE 줄 판독, 판정 규칙, 근거 머리.
// 고정하는 것: 판을 읽지 못하거나 검사 문제가 있으면 체크리스트를 만들지 않는다, 항목마다 꼴이 맞는 줄이 정확히 하나여야 한다,
// 충돌 면제는 체크리스트의 P pass·G fail 짝일 때만이다, 금지 칸이 있는 항목의 fail은 「금지」로 적는다.
import { describe, expect, it } from 'vitest'
import { LOOP_DOC_MAX_BYTES } from '@main/13_Taste/tasteStore'
import { judgeTaste, tasteChecklist, tasteHead, type TasteCheckItem } from '@main/05_Loop/tasteVerdict'

const PROJECT = '# 프로젝트 Taste\n\n## T1 한 화면\n- 원칙: 한 화면에 하나\n\n## T5 장식\n- 원칙: 담백하게\n- 금지: 그라데이션\n'
const GLOBAL = '# 전역 Taste\n\n## T1 말투\n- 원칙: 평문\n\n## T2 색\n- 레퍼런스: https://example.invalid/a.png\n'

const items = (): TasteCheckItem[] => {
  const c = tasteChecklist({ project: PROJECT, global: GLOBAL })
  if (!c.ok) throw new Error(c.reason)
  return c.items
}
const answer = (...lines: string[]): string => ['근거를 본다.', ...lines, 'VERDICT: pass'].join('\n')
const ALL_PASS = ['TASTE P-T1: pass — 한 화면', 'TASTE P-T5: pass — 장식 없음', 'TASTE G-T1: pass — 평문', 'TASTE G-T2: n/a — 색 변경 없음']

describe('Taste 체크리스트', () => {
  it('프로젝트 항목은 P-, 전역 항목은 G- 머리를 붙이고 프로젝트를 먼저 싣는다', () => {
    expect(items().map((i) => i.id)).toEqual(['P-T1', 'P-T5', 'G-T1', 'G-T2'])
    expect(items()[1]).toEqual({ id: 'P-T5', title: '장식', fields: [{ name: '원칙', text: '담백하게' }, { name: '금지', text: '그라데이션' }] })
  })

  it('없는 층은 빠지고, 둘 다 없거나 항목이 없으면 빈 체크리스트다', () => {
    expect(tasteChecklist({ project: null, global: GLOBAL })).toMatchObject({ ok: true, items: [{ id: 'G-T1' }, { id: 'G-T2' }] })
    expect(tasteChecklist({ project: null, global: null })).toEqual({ ok: true, items: [] })
    expect(tasteChecklist({ project: '# 프로젝트 Taste\n', global: null })).toEqual({ ok: true, items: [] })
  })

  it('검사 문제·빈 파일·상한 초과는 체크리스트를 만들지 않고 사유를 낸다', () => {
    const bad = tasteChecklist({ project: '# 프로젝트 Taste\n\n## T1 a\n- 원칙: b\n\n## T1 c\n- 원칙: d\n', global: GLOBAL })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.reason).toContain('프로젝트 Taste')
    expect(!bad.ok && bad.reason).toContain('겹친다')
    const empty = tasteChecklist({ project: null, global: '' })
    expect(!empty.ok && empty.reason).toContain('전역 Taste')
    const big = tasteChecklist({ project: `${PROJECT}${'- 원칙: x\n'.repeat(LOOP_DOC_MAX_BYTES / 8)}`, global: null })
    expect(!big.ok && big.reason).toContain('상한')
  })
})

describe('TASTE 줄 판독과 판정', () => {
  it('항목마다 꼴이 맞는 줄이 하나씩 있고 fail이 없으면 통과다', () => {
    const j = judgeTaste(items(), answer(...ALL_PASS))
    expect(j.pass).toBe(true)
    expect(j.entries.map((e) => `${e.id} ${e.state}`)).toEqual(['P-T1 pass', 'P-T5 pass', 'G-T1 pass', 'G-T2 n/a'])
  })

  it('줄 앞뒤 공백과 CRLF는 받는다', () => {
    expect(judgeTaste(items(), answer(...ALL_PASS.map((l) => `  ${l}  `)).replace(/\n/g, '\r\n')).pass).toBe(true)
  })

  it('TASTE fail이 하나라도 있으면 불통과다', () => {
    const j = judgeTaste(items(), answer('TASTE P-T1: fail — 두 화면', ...ALL_PASS.slice(1)))
    expect(j.pass).toBe(false)
    expect(j.entries[0]).toMatchObject({ state: 'fail', reason: '두 화면' })
  })

  it('빠진 항목, 같은 ID 두 줄, 체크리스트에 없는 ID는 불통과다', () => {
    const missing = judgeTaste(items(), answer(...ALL_PASS.slice(1)))
    expect(missing.pass).toBe(false)
    expect(missing.entries[0].state).toBe('missing')
    const dup = judgeTaste(items(), answer(...ALL_PASS, 'TASTE P-T1: pass — 다시'))
    expect(dup.pass).toBe(false)
    expect(dup.entries[0].state).toBe('duplicate')
    const unknown = judgeTaste(items(), answer(...ALL_PASS, 'TASTE P-T9: pass — 없는 항목'))
    expect(unknown.pass).toBe(false)
    expect(unknown.strays.join(' ')).toContain('P-T9')
  })

  it('꼴이 틀린 TASTE 머리 줄은 불통과다', () => {
    for (const bad of [
      'TASTE P-T1: PASS — 대문자', 'TASTE P-T1: pass - 하이픈', 'TASTE P-T1: pass —', 'TASTE P-T1 pass — 쌍점 없음',
      'TASTE P-T1: ok — 모르는 판정', 'TASTE  P-T1: pass — 두 칸',
    ]) {
      const j = judgeTaste(items(), answer(...ALL_PASS, bad))
      expect(j.pass, bad).toBe(false)
      expect(j.strays.join(' '), bad).toContain('꼴')
    }
  })

  it('줄 머리가 정확히 TASTE가 아닌 줄은 읽지 않는다 — 그 항목은 빠진 것이다', () => {
    for (const hidden of ['- TASTE P-T1: pass — 목록', '**TASTE P-T1: pass — 굵게**', '> TASTE P-T1: pass — 인용', 'taste P-T1: pass — 소문자']) {
      const j = judgeTaste(items(), answer(hidden, ...ALL_PASS.slice(1)))
      expect(j.pass, hidden).toBe(false)
      expect(j.entries[0].state, hidden).toBe('missing')
    }
  })

  it('충돌 면제는 체크리스트의 P pass·G fail 짝에만 — 그 전역 fail은 세지 않고 충돌을 안건으로 낸다', () => {
    const lines = ['TASTE P-T1: pass — 한 화면', 'TASTE P-T5: pass — 장식 없음', 'TASTE G-T1: fail — 평문이 아니다', 'TASTE G-T2: n/a — 색 없음']
    const j = judgeTaste(items(), answer(...lines, 'TASTE-CONFLICT P-T1 G-T1: 화면 문구가 프로젝트 쪽 말투를 따른다'))
    expect(j.pass).toBe(true)
    expect(j.conflicts).toEqual([{ project: 'P-T1', global: 'G-T1', note: '화면 문구가 프로젝트 쪽 말투를 따른다' }])
    expect(j.entries[2]).toMatchObject({ state: 'fail', exemptBy: 'P-T1' })
    expect(judgeTaste(items(), answer(...lines)).pass).toBe(false)
  })

  it('맞지 않는 충돌 줄은 면제·안건 없이 근거에만 남는다', () => {
    const gFail = ['TASTE P-T1: pass — a', 'TASTE P-T5: fail — b', 'TASTE G-T1: fail — c', 'TASTE G-T2: pass — d']
    for (const c of [
      'TASTE-CONFLICT P-T5 G-T1: 프로젝트 쪽이 fail', 'TASTE-CONFLICT P-T1 G-T2: 전역 쪽이 pass', 'TASTE-CONFLICT G-T1 P-T1: 순서가 거꾸로',
      'TASTE-CONFLICT P-T9 G-T1: 없는 프로젝트 항목', 'TASTE-CONFLICT P-T1 P-T5: 두 프로젝트 항목',
    ]) {
      const j = judgeTaste(items(), answer(...gFail, c))
      expect(j.pass, c).toBe(false)
      expect(j.conflicts, c).toEqual([])
      expect(j.ignoredConflicts.length, c).toBe(1)
      expect(j.entries[2].exemptBy, c).toBeNull()
    }
  })

  it('꼴이 틀린 충돌 줄은 TASTE 줄 꼴 틀림이 아니다 — 인정하지 않은 충돌로만 남는다', () => {
    const j = judgeTaste(items(), answer(...ALL_PASS, 'TASTE-CONFLICT P-T1: 짝이 없다'))
    expect(j.pass).toBe(true)
    expect(j.ignoredConflicts.length).toBe(1)
    expect(j.strays).toEqual([])
  })

  it('비지 않은 금지 칸이 있는 항목의 fail만 「금지」다', () => {
    const noBan = tasteChecklist({ project: '# 프로젝트 Taste\n\n## T1 a\n- 원칙: b\n- 금지:\n', global: null })
    if (!noBan.ok) throw new Error(noBan.reason)
    expect(judgeTaste(noBan.items, answer('TASTE P-T1: fail — x')).entries[0].forbidden).toBe(false)
    const j = judgeTaste(items(), answer('TASTE P-T1: fail — x', 'TASTE P-T5: fail — 그라데이션', ...ALL_PASS.slice(2)))
    expect(j.entries.map((e) => e.forbidden)).toEqual([false, true, false, false])
    expect(judgeTaste(items(), answer(...ALL_PASS)).entries[1].forbidden).toBe(false)
  })
})

describe('근거 머리', () => {
  it('모든 항목의 ID와 판정을 체크리스트 순서로 싣는다', () => {
    const lines = ['TASTE P-T1: pass — a', 'TASTE P-T5: fail — b', 'TASTE G-T1: fail — c', 'TASTE-CONFLICT P-T1 G-T1: d']
    expect(tasteHead(judgeTaste(items(), answer(...lines)), 380))
      .toBe('Taste P-T1 pass, P-T5 fail(금지), G-T1 fail(면제 P-T1), G-T2 없음')
    const odd = judgeTaste(items(), answer(...ALL_PASS, 'TASTE P-T1: pass — 다시', 'TASTE P-T9: pass — x', 'TASTE G-T1 pass', 'TASTE-CONFLICT P-T5 G-T2: y'))
    expect(tasteHead(odd, 380)).toBe('Taste P-T1 중복, P-T5 pass, G-T1 pass, G-T2 n/a; 모르는 ID P-T9; 꼴이 틀린 TASTE 줄 1개; 인정하지 않은 충돌 P-T5 G-T2')
    expect(tasteHead(judgeTaste(items(), answer(...ALL_PASS)), 380)).toBe('Taste P-T1 pass, P-T5 pass, G-T1 pass, G-T2 n/a')
  })

  it('상한을 넘으면 판정별로 묶어 ID를 빼지 않는다', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `P-T${i + 10}`, title: 't', fields: [{ name: '원칙', text: 'x' }] }))
    const text = answer(...many.map((m, i) => `TASTE ${m.id}: ${i === 3 ? 'fail' : 'pass'} — 근거`))
    const head = tasteHead(judgeTaste(many, text), 380)
    expect(head.length).toBeLessThanOrEqual(380)
    expect(head.startsWith('Taste pass ')).toBe(true)
    for (const m of many) expect(head).toContain(m.id)
    expect(head).toContain('fail P-T13')
  })
})
