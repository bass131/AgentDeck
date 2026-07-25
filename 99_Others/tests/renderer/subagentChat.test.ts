/**
 * subagentChat.test.ts — buildSubagentChatItems 순수 함수 TDD (FB1 P06).
 *
 * 검증 대상: SubAgentInfo → 시간순 "채팅 아이템"(task/tool/text/thinking) 프로젝션.
 *   - 위임 프롬프트(role) → task 아이템 1개, 최상단.
 *   - transcript를 시간순 순회하되 연속 동종(text/text 또는 thinking/thinking) delta는
 *     1개 버블로 병합(reducer가 delta마다 별도 항목을 append하므로 — reducer/text.ts).
 *   - tool 항목은 병합 대상 아님(항상 새 행) — 병합 체인을 끊는다.
 *   - 최종 답변(activity)은 transcript 마지막 text와 다를 때만, 항상 새 항목으로 추가.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSubagentChatItems,
  hasSubagentConversation,
  groupSubagentToolRuns,
} from '../../../02.Source/renderer/src/lib/subagentChat'
import type { SubAgentInfo } from '../../../02.Source/renderer/src/lib/agentSampleData'

function agent(overrides: Partial<SubAgentInfo>): SubAgentInfo {
  return {
    id: 'sa-1',
    name: '탐색 에이전트',
    role: '',
    status: 'running',
    tools: [],
    transcript: [],
    ...overrides,
  }
}

describe('buildSubagentChatItems — 위임 프롬프트(task)', () => {
  it('role 있으면 첫 항목이 kind=task, text=role', () => {
    const items = buildSubagentChatItems(agent({ role: 'Summarize Button.ts' }))
    expect(items[0]).toEqual({ kind: 'task', id: 'task', text: 'Summarize Button.ts' })
  })

  it('role 공백/미지정이면 task 아이템 없음', () => {
    const items1 = buildSubagentChatItems(agent({ role: '' }))
    expect(items1.some((it) => it.kind === 'task')).toBe(false)

    const items2 = buildSubagentChatItems(agent({ role: '   ' }))
    expect(items2.some((it) => it.kind === 'task')).toBe(false)
  })
})

describe('buildSubagentChatItems — 연속 동종 delta 병합(스트리밍 클러터 방지)', () => {
  it('연속 text 델타 2개 → 1개 text 아이템으로 병합(연결 순서 유지)', () => {
    const items = buildSubagentChatItems(
      agent({
        role: '',
        transcript: [
          { kind: 'text', text: '안녕' },
          { kind: 'text', text: '하세요' },
        ],
      })
    )
    const texts = items.filter((it) => it.kind === 'text')
    expect(texts).toHaveLength(1)
    expect(texts[0]).toMatchObject({ text: '안녕하세요' })
  })

  it('연속 thinking 델타 2개 → 1개 thinking 아이템으로 병합', () => {
    const items = buildSubagentChatItems(
      agent({
        transcript: [
          { kind: 'thinking', text: '파일 구조' },
          { kind: 'thinking', text: ' 분석 중' },
        ],
      })
    )
    const th = items.filter((it) => it.kind === 'thinking')
    expect(th).toHaveLength(1)
    expect(th[0]).toMatchObject({ text: '파일 구조 분석 중' })
  })

  it('text 사이 tool이 끼면 병합 체인이 끊겨 별도 버블 2개가 됨', () => {
    const items = buildSubagentChatItems(
      agent({
        transcript: [
          { kind: 'text', text: '탐색 시작' },
          { kind: 'tool', verb: 'read', target: 'src/main.ts', status: 'done', id: 't1' },
          { kind: 'text', text: '읽기 완료' },
        ],
      })
    )
    // role 미지정이므로 task 없음 → text, tool, text 순(병합 체인이 tool에서 끊김)
    expect(items.map((it) => it.kind)).toEqual(['text', 'tool', 'text'])
    const texts = items.filter((it) => it.kind === 'text')
    expect(texts).toHaveLength(2)
    expect(texts[0]).toMatchObject({ text: '탐색 시작' })
    expect(texts[1]).toMatchObject({ text: '읽기 완료' })
  })

  it('text와 thinking이 번갈아 오면 서로 다른 kind이므로 병합되지 않음', () => {
    const items = buildSubagentChatItems(
      agent({
        transcript: [
          { kind: 'text', text: 'A' },
          { kind: 'thinking', text: 'B' },
          { kind: 'text', text: 'C' },
        ],
      })
    )
    expect(items.map((it) => it.kind)).toEqual(['text', 'thinking', 'text'])
  })
})

describe('buildSubagentChatItems — tool 항목 필드 매핑', () => {
  it('verb/target/status/id를 그대로 보존', () => {
    const items = buildSubagentChatItems(
      agent({
        transcript: [{ kind: 'tool', verb: 'bash', target: 'npm test', status: 'running', id: 'tool-9' }],
      })
    )
    expect(items[0]).toEqual({ kind: 'tool', id: 'tool-9', verb: 'bash', target: 'npm test', status: 'running' })
  })

  it('id 누락 시 인덱스 기반 폴백 id 부여', () => {
    const items = buildSubagentChatItems(
      agent({ transcript: [{ kind: 'tool', verb: 'read', target: 'a.ts', status: 'done' }] })
    )
    expect(items[0].id).toBe('tool-0')
  })
})

describe('buildSubagentChatItems — 최종 답변(activity) 처리', () => {
  it('activity가 transcript 마지막 text와 다르면 별도 text 아이템으로 끝에 추가', () => {
    const items = buildSubagentChatItems(
      agent({
        transcript: [{ kind: 'text', text: '진행 중입니다' }],
        activity: '작업을 완료했습니다',
      })
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: 'text', text: '진행 중입니다' })
    expect(items[1]).toMatchObject({ kind: 'text', text: '작업을 완료했습니다' })
    // 병합되지 않고 별개 항목(마지막 원시 조각과 다른 성격의 정제된 답변)
    expect(items[1].id).not.toBe(items[0].id)
  })

  it('activity가 transcript 마지막 text와 같으면 중복 추가하지 않음', () => {
    const items = buildSubagentChatItems(
      agent({
        transcript: [{ kind: 'text', text: '동일한 답변' }],
        activity: '동일한 답변',
      })
    )
    const texts = items.filter((it) => it.kind === 'text')
    expect(texts).toHaveLength(1)
  })

  it('transcript가 비어 있고 activity만 있으면(라이브 케이스) text 아이템 1개', () => {
    const items = buildSubagentChatItems(agent({ transcript: [], activity: 'ALPHA-BRAVO 결과' }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'text', text: 'ALPHA-BRAVO 결과' })
  })

  it('activity 미지정/공백이면 추가 아이템 없음', () => {
    const items1 = buildSubagentChatItems(agent({ transcript: [{ kind: 'text', text: 'x' }] }))
    expect(items1.filter((it) => it.kind === 'text')).toHaveLength(1)

    const items2 = buildSubagentChatItems(
      agent({ transcript: [{ kind: 'text', text: 'x' }], activity: '   ' })
    )
    expect(items2.filter((it) => it.kind === 'text')).toHaveLength(1)
  })
})

describe('buildSubagentChatItems — 빈 상태', () => {
  it('role 없음 + transcript 없음 + activity 없음 → 빈 배열', () => {
    const items = buildSubagentChatItems(agent({ role: '', transcript: [], activity: undefined }))
    expect(items).toEqual([])
  })

  it('transcript 미지정(undefined)이어도 안전하게 빈 배열 취급', () => {
    const items = buildSubagentChatItems(agent({ role: '', transcript: undefined, activity: undefined }))
    expect(items).toEqual([])
  })
})

describe('hasSubagentConversation — task 제외 실질 대화 존재 판정', () => {
  it('task만 있고 나머지 없으면 false', () => {
    const items = buildSubagentChatItems(agent({ role: '작업 지시만 있음' }))
    expect(hasSubagentConversation(items)).toBe(false)
  })

  it('text/tool/thinking 중 하나라도 있으면 true', () => {
    const items = buildSubagentChatItems(
      agent({ role: '작업', transcript: [{ kind: 'text', text: '응답' }] })
    )
    expect(hasSubagentConversation(items)).toBe(true)
  })

  it('빈 배열이면 false', () => {
    expect(hasSubagentConversation([])).toBe(false)
  })
})

describe('groupSubagentToolRuns — 인접 tool 런 그룹핑 (영호 지시 2026-07-04, 패널 문법 이식 세부화)', () => {
  it('연속 tool 2개 → 하나의 toolgroup으로 묶임(순서 보존)', () => {
    const items = buildSubagentChatItems({
      id: 'sa-1', name: 'a', role: '', status: 'done', tools: [],
      transcript: [
        { kind: 'tool', verb: 'read', target: 'a.ts', status: 'done', id: 't1' },
        { kind: 'tool', verb: 'read', target: 'b.ts', status: 'done', id: 't2' },
      ],
    })
    const groups = groupSubagentToolRuns(items)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ kind: 'toolgroup' })
    if (groups[0].kind === 'toolgroup') {
      expect(groups[0].tools.map((t) => t.id)).toEqual(['t1', 't2'])
    }
  })

  it('tool 사이에 text가 끼면 서로 다른 toolgroup 2개로 분리(재배열 없음)', () => {
    const items = buildSubagentChatItems({
      id: 'sa-1', name: 'a', role: '', status: 'done', tools: [],
      transcript: [
        { kind: 'tool', verb: 'read', target: 'a.ts', status: 'done', id: 't1' },
        { kind: 'text', text: '중간 응답' },
        { kind: 'tool', verb: 'bash', target: 'npm test', status: 'done', id: 't2' },
      ],
    })
    const groups = groupSubagentToolRuns(items)
    expect(groups.map((g) => g.kind)).toEqual(['toolgroup', 'single', 'toolgroup'])
    expect(groups[0].kind === 'toolgroup' && groups[0].tools).toHaveLength(1)
    expect(groups[2].kind === 'toolgroup' && groups[2].tools).toHaveLength(1)
  })

  it('task/text/thinking은 그룹핑 대상이 아니다 — single로 그대로 통과', () => {
    const items = buildSubagentChatItems({
      id: 'sa-1', name: 'a', role: '지시', status: 'done', tools: [],
      transcript: [{ kind: 'thinking', text: '생각' }],
      activity: '답변',
    })
    const groups = groupSubagentToolRuns(items)
    expect(groups.map((g) => g.kind)).toEqual(['single', 'single', 'single'])
  })

  it('빈 배열 입력 → 빈 배열 출력', () => {
    expect(groupSubagentToolRuns([])).toEqual([])
  })
})

describe('buildSubagentChatItems — 통합 시나리오(스크린샷 재현: task→tool→text→finalAnswer)', () => {
  it('위임 프롬프트 → 도구 호출 → 중간 응답 → 최종 답변 순서로 정확히 배열', () => {
    const items = buildSubagentChatItems(
      agent({
        role: 'Summarize Button.ts',
        transcript: [
          { kind: 'tool', verb: 'read', target: 'src/components/Button.ts', status: 'done', id: 'r1' },
          { kind: 'text', text: 'Button.ts는 label과 disabled 속성을' },
          { kind: 'text', text: ' 받는 버튼 컴포넌트입니다.' },
        ],
        activity: 'Button.ts는 label과 disabled 속성을 받는 버튼 컴포넌트입니다.',
      })
    )

    expect(items.map((it) => it.kind)).toEqual(['task', 'tool', 'text'])
    expect(items[0]).toMatchObject({ kind: 'task', text: 'Summarize Button.ts' })
    expect(items[1]).toMatchObject({ kind: 'tool', verb: 'read', target: 'src/components/Button.ts' })
    expect(items[2]).toMatchObject({
      kind: 'text',
      text: 'Button.ts는 label과 disabled 속성을 받는 버튼 컴포넌트입니다.',
    })
    // activity가 병합된 transcript 마지막 text와 완전히 같으므로 중복 없음(총 3항목)
    expect(items).toHaveLength(3)
  })
})
