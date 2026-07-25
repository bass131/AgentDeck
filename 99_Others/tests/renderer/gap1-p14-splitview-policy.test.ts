/**
 * gap1-p14-splitview-policy.test.ts — SubAgent 스플릿 뷰 배정 정책 순수 함수 계약
 * (GAP1 P14 (a) 최초 RED, TG1 P08 정본 교체 — 옛 계약 유지 금지).
 *
 * 계약 정본(coordinator 확정 2026-07-14, TG1 P08 개정 2026-07-17): 이 테스트가 renderer
 * 구현의 계약이다. 대상 모듈: 02.Source/renderer/src/lib/splitView.ts
 *
 * 정책 요지 (TG1 P08 §📐 확정 스펙 — 영호 육안 피드백 2026-07-17, 옛 P14 활성확대 계약 폐기):
 *  - cells: 배정 순서 = 슬롯 순서(스냅샷 순서 그대로, 재정렬 X). 상한 MAX_CELLS=6.
 *  - 상한 초과분은 queue(FIFO 탭 대기열).
 *  - done 전이 관측 시 doneAt=now 기록(즉시 제거 X — CLOSE_LINGER_MS 동안 잠시 표시),
 *    now >= doneAt + CLOSE_LINGER_MS 재적용 시 제거 → queue 선두 승격(재배치).
 *  - computeColumns: 지그재그 스태킹 — 짝수 index(0,2,4..)=좌 컬럼, 홀수 index(1,3,5..)=우
 *    컬럼. 우 컬럼이 비면(cells.length<=1) 컬럼 1개만 반환(전폭). cells가 비면 컬럼 0개.
 *  - 셀 크기: 항상 균등(1:1) — activeId 기반 확대 계약 없음(ACTIVE_WEIGHT/rowWeights 폐기,
 *    균등은 소비처 CSS `.sag-cell{flex:1 1 0}`가 담당, 이 모듈은 크기를 다루지 않는다).
 *  - activeId/noteActivity는 존속 — 소비 목적만 "자동 확대"에서 "정적 하이라이트"로
 *    바뀐다(크기 계약과 무관, 소비처가 클래스로 표현).
 *  - 순수 함수: 시간은 now(ms) 파라미터 주입(Date.now 금지), 입력 state 불변(새 참조 반환).
 *
 * [계약 보완] 표시 라벨이 붙은 케이스 2종은 계약 문면에 없지만 상태 셰이프(닫힘 이력 필드
 * 부재)와 무한 누적 입력(state.subagents)의 조합에서 모순 없는 유일한 해석이라 여기서 확정:
 *  ① 신규 id가 이미 done이면 배정하지 않는다 — 없으면 린저 만료 제거 다음 스냅샷에서
 *     동일 id가 "신규"로 재배정되어 add/remove 플랩이 무한 반복된다.
 *  ② queue 대기 중 done 전이 → queue에서 즉시 제거 — 표시된 적 없어 린저 대상이 아니고,
 *     남겨두면 죽은 항목이 승격된다.
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_CELLS,
  CLOSE_LINGER_MS,
  emptySplitView,
  applySubagents,
  noteActivity,
  toggleCell,
  computeColumns,
  type SplitViewState,
} from '../../../02.Source/renderer/src/lib/splitView'

type SubStatus = 'queued' | 'running' | 'done'
interface SubSnapshot {
  id: string
  status: SubStatus
}

const sub = (id: string, status: SubStatus = 'running'): SubSnapshot => ({ id, status })
const running = (...list: string[]): SubSnapshot[] => list.map((id) => sub(id))
const cellIds = (state: SplitViewState): string[] => state.cells.map((c) => c.id)

/** 입력 불변성 검증용 — 변형 시도가 있으면 strict mode에서 TypeError로 즉사한다. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

describe('계약 상수·초기 상태', () => {
  it('MAX_CELLS=6 · CLOSE_LINGER_MS=4000', () => {
    expect(MAX_CELLS).toBe(6)
    expect(CLOSE_LINGER_MS).toBe(4000)
  })

  it('emptySplitView → cells=[] · queue=[] · activeId=null', () => {
    expect(emptySplitView()).toEqual({ cells: [], queue: [], activeId: null })
  })
})

describe('배치 규칙 — 1개 (시나리오 1)', () => {
  it('applySubagents(empty, [a running]) → cells=[a], 신규 셀 기본값 disabled=false·doneAt 없음', () => {
    const s = applySubagents(emptySplitView(), [sub('a')], 1_000)
    expect(cellIds(s)).toEqual(['a'])
    expect(s.cells[0].disabled).toBe(false)
    expect(s.cells[0].doneAt).toBeUndefined()
    expect(s.queue).toEqual([])
  })

  it('computeColumns → 셀 1개면 컬럼 1개(전폭 — 지그재그 분기 진입 금지)', () => {
    const s = applySubagents(emptySplitView(), [sub('a')], 1_000)
    const cols = computeColumns(s)
    expect(cols).toHaveLength(1)
    expect(cols[0].map((c) => c.id)).toEqual(['a'])
  })
})

describe('배치 규칙 — 지그재그 스태킹(짝수 index=좌, 홀수 index=우) (시나리오 2)', () => {
  it('computeColumns(emptySplitView()) → 컬럼 0개', () => {
    expect(computeColumns(emptySplitView())).toEqual([])
  })

  it('2개 a,b → 좌1·우1(2컬럼)', () => {
    const s = applySubagents(emptySplitView(), running('a', 'b'), 1_000)
    const cols = computeColumns(s)
    expect(cols).toHaveLength(2)
    expect(cols[0].map((c) => c.id)).toEqual(['a'])
    expect(cols[1].map((c) => c.id)).toEqual(['b'])
  })

  it('3개 a,b,c → 좌2·우1 — [a,c] | [b]', () => {
    const s = applySubagents(emptySplitView(), running('a', 'b', 'c'), 1_000)
    const cols = computeColumns(s)
    expect(cols).toHaveLength(2)
    expect(cols[0].map((c) => c.id)).toEqual(['a', 'c'])
    expect(cols[1].map((c) => c.id)).toEqual(['b'])
  })

  it('4개 a,b,c,d → [a,c] | [b,d]', () => {
    const s = applySubagents(emptySplitView(), running('a', 'b', 'c', 'd'), 1_000)
    const cols = computeColumns(s)
    expect(cols).toHaveLength(2)
    expect(cols[0].map((c) => c.id)).toEqual(['a', 'c'])
    expect(cols[1].map((c) => c.id)).toEqual(['b', 'd'])
  })

  it('6개 → [a,c,e] | [b,d,f] · queue 없음(상한 내)', () => {
    const s = applySubagents(emptySplitView(), running('a', 'b', 'c', 'd', 'e', 'f'), 1_000)
    expect(s.cells).toHaveLength(MAX_CELLS)
    expect(s.queue).toEqual([])
    const cols = computeColumns(s)
    expect(cols[0].map((c) => c.id)).toEqual(['a', 'c', 'e'])
    expect(cols[1].map((c) => c.id)).toEqual(['b', 'd', 'f'])
  })

  it('입력 스냅샷 순서가 바뀌어도 기존 셀의 슬롯 순서는 배정 순서 유지(스냅샷마다 재정렬 X)', () => {
    const s1 = applySubagents(emptySplitView(), running('a', 'b', 'c'), 1_000)
    const s2 = applySubagents(s1, running('c', 'a', 'b'), 2_000)
    expect(cellIds(s2)).toEqual(['a', 'b', 'c'])
  })
})

describe('상한 초과 대기열 (시나리오 3)', () => {
  it('7개 a..g → cells 6개(a..f) + queue=[g] (탭 대기열 발생)', () => {
    const s = applySubagents(emptySplitView(), running('a', 'b', 'c', 'd', 'e', 'f', 'g'), 1_000)
    expect(s.cells).toHaveLength(MAX_CELLS)
    expect(cellIds(s)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(s.queue).toEqual(['g'])
  })

  it('8개 → queue=[g,h] — 대기열은 도착 순서 FIFO', () => {
    const s = applySubagents(
      emptySplitView(),
      running('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
      1_000
    )
    expect(s.queue).toEqual(['g', 'h'])
  })
})

describe('완료 자동 닫기 → 대기열 승격 (시나리오 4)', () => {
  const T0 = 1_000
  const T = 10_000
  const ALL7 = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const seven = (): SplitViewState => applySubagents(emptySplitView(), running(...ALL7), T0)
  /** b만 done, 나머지 running인 스냅샷 재적용 — 무한 누적 입력에 b가 계속 남는 실제 상황 재현. */
  const withBDone = (prev: SplitViewState, now: number): SplitViewState =>
    applySubagents(
      prev,
      ALL7.map((id) => sub(id, id === 'b' ? 'done' : 'running')),
      now
    )

  it('done 전이 관측(now=T) → 같은 호출에서 셀 유지 + doneAt=T (즉시 제거 X — 잠시 표시)', () => {
    const s = withBDone(seven(), T)
    expect(cellIds(s)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(s.cells.find((c) => c.id === 'b')?.doneAt).toBe(T)
    expect(s.queue).toEqual(['g'])
  })

  it('doneAt은 최초 관측 시각으로 고정 — 재적용에도 갱신되지 않음(린저 창 결정론)', () => {
    const s1 = withBDone(seven(), T)
    const s2 = withBDone(s1, T + 2_000)
    expect(s2.cells.find((c) => c.id === 'b')?.doneAt).toBe(T)
  })

  it('now < doneAt + CLOSE_LINGER_MS 동안은 계속 표시', () => {
    const s1 = withBDone(seven(), T)
    const s2 = withBDone(s1, T + CLOSE_LINGER_MS - 1)
    expect(cellIds(s2)).toContain('b')
    expect(s2.queue).toEqual(['g'])
  })

  it('now >= doneAt + CLOSE_LINGER_MS → b 제거 · g 승격(queue 비움) · 재배치(잔존 압축 + 승격 셀 말미)', () => {
    const s1 = withBDone(seven(), T)
    const s2 = withBDone(s1, T + CLOSE_LINGER_MS)
    expect(cellIds(s2)).toEqual(['a', 'c', 'd', 'e', 'f', 'g'])
    expect(s2.queue).toEqual([])
  })

  it('[계약 보완] 린저 만료로 제거된 done id는 입력에 남아 있어도 재배정하지 않는다(add/remove 플랩 방지)', () => {
    const s1 = withBDone(seven(), T)
    const s2 = withBDone(s1, T + CLOSE_LINGER_MS)
    const s3 = withBDone(s2, T + CLOSE_LINGER_MS + 3_000)
    expect(cellIds(s3)).toEqual(['a', 'c', 'd', 'e', 'f', 'g'])
    expect(s3.queue).toEqual([])
  })

  it('[계약 보완] 신규 id가 이미 done이면 배정하지 않는다(위 플랩 방지 규칙의 일반형)', () => {
    const s = applySubagents(emptySplitView(), [sub('x', 'done')], T)
    expect(s.cells).toEqual([])
    expect(s.queue).toEqual([])
  })

  it('[계약 보완] queue 대기 중 done 전이 → queue에서 즉시 제거(표시된 적 없어 린저 대상 아님)', () => {
    const s1 = seven() // queue=['g']
    const s2 = applySubagents(
      s1,
      ALL7.map((id) => sub(id, id === 'g' ? 'done' : 'running')),
      T
    )
    expect(s2.queue).toEqual([])
    expect(cellIds(s2)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('린저 만료로 제거된 셀이 activeId였다면 activeId=null(댕글링 참조 방지)', () => {
    const s1 = noteActivity(withBDone(seven(), T), 'b', T)
    expect(s1.activeId).toBe('b')
    const s2 = withBDone(s1, T + CLOSE_LINGER_MS)
    expect(s2.activeId).toBeNull()
  })
})

describe('창별 활성/비활성 토글 (시나리오 5)', () => {
  it('toggleCell 왕복 — disabled false→true→false', () => {
    const s0 = applySubagents(emptySplitView(), running('a', 'b'), 1_000)
    const s1 = toggleCell(s0, 'b')
    expect(s1.cells.find((c) => c.id === 'b')?.disabled).toBe(true)
    const s2 = toggleCell(s1, 'b')
    expect(s2.cells.find((c) => c.id === 'b')?.disabled).toBe(false)
  })

  it('다른 셀의 disabled에는 영향 없음', () => {
    const s0 = applySubagents(emptySplitView(), running('a', 'b'), 1_000)
    const s1 = toggleCell(s0, 'b')
    expect(s1.cells.find((c) => c.id === 'a')?.disabled).toBe(false)
  })

  it('미존재 id는 무시 — 상태 의미 동일', () => {
    const s0 = applySubagents(emptySplitView(), running('a'), 1_000)
    expect(toggleCell(s0, 'ghost')).toEqual(s0)
  })

  it('applySubagents 재적용에도 disabled 보존(재구축이 아니라 병합)', () => {
    const s1 = toggleCell(applySubagents(emptySplitView(), running('a', 'b'), 1_000), 'b')
    const s2 = applySubagents(s1, running('a', 'b'), 2_000)
    expect(s2.cells.find((c) => c.id === 'b')?.disabled).toBe(true)
  })
})

describe('activeId 수명주기 — 정적 하이라이트 소비 대상(크기 계약 없음, 시나리오 6)', () => {
  const four = (): SplitViewState =>
    applySubagents(emptySplitView(), running('a', 'b', 'c', 'd'), 1_000)

  it('noteActivity(표시 중 셀) → activeId 갱신 · cells/queue는 그대로(크기 무영향)', () => {
    const s0 = four()
    const s1 = noteActivity(s0, 'b', 2_000)
    expect(s1.activeId).toBe('b')
    expect(s1.cells).toEqual(s0.cells)
    expect(s1.queue).toEqual(s0.queue)
  })

  it('disabled 토글은 activeId를 건드리지 않는다(단, 하이라이트 표시 여부는 소비처 재량)', () => {
    const s0 = applySubagents(emptySplitView(), running('a', 'b', 'c'), 1_000)
    const s1 = toggleCell(noteActivity(s0, 'b', 1_500), 'b')
    expect(s1.activeId).toBe('b') // toggleCell은 disabled만 반전 — activeId 무접촉
    expect(s1.cells.find((c) => c.id === 'b')?.disabled).toBe(true)
  })

  it('queue 소속 id에 noteActivity → 변경 없음(activeId 불변)', () => {
    const s0 = noteActivity(
      applySubagents(emptySplitView(), running('a', 'b', 'c', 'd', 'e', 'f', 'g'), 1_000),
      'b',
      1_500
    )
    const s1 = noteActivity(s0, 'g', 2_000) // g는 queue
    expect(s1).toEqual(s0)
    expect(s1.activeId).toBe('b')
  })

  it('미존재 id에 noteActivity → 변경 없음', () => {
    const s0 = noteActivity(four(), 'a', 1_500)
    const s1 = noteActivity(s0, 'ghost', 2_000)
    expect(s1).toEqual(s0)
  })
})

describe('순수성 — 입력 불변 (시나리오 7)', () => {
  it('applySubagents: deep-freeze된 prev에서도 동작(무변형) + 새 참조 반환', () => {
    const prev = deepFreeze(applySubagents(emptySplitView(), running('a'), 1_000))
    const next = applySubagents(prev, running('a', 'b'), 2_000)
    expect(next).not.toBe(prev)
    expect(cellIds(prev)).toEqual(['a']) // 원본 그대로
    expect(cellIds(next)).toEqual(['a', 'b'])
  })

  it('toggleCell: deep-freeze된 prev 무변형 + 새 참조 반환', () => {
    const prev = deepFreeze(applySubagents(emptySplitView(), running('a'), 1_000))
    const next = toggleCell(prev, 'a')
    expect(next).not.toBe(prev)
    expect(prev.cells[0].disabled).toBe(false)
    expect(next.cells[0].disabled).toBe(true)
  })

  it('noteActivity: deep-freeze된 prev 무변형', () => {
    const prev = deepFreeze(applySubagents(emptySplitView(), running('a', 'b'), 1_000))
    const next = noteActivity(prev, 'b', 2_000)
    expect(prev.activeId).toBeNull()
    expect(next.activeId).toBe('b')
  })

  it('applySubagents: subagents 입력 배열도 변형하지 않음', () => {
    const input = deepFreeze(running('a', 'b'))
    const s = applySubagents(emptySplitView(), input, 1_000)
    expect(cellIds(s)).toEqual(['a', 'b'])
    expect(input).toEqual([sub('a'), sub('b')])
  })
})

describe('소멸 정리 (시나리오 8)', () => {
  it('입력 subagents에서 사라진 id는 cells에서 제거(잔존 순서 유지)', () => {
    const s1 = applySubagents(emptySplitView(), running('a', 'b', 'c'), 1_000)
    const s2 = applySubagents(s1, running('a', 'c'), 2_000)
    expect(cellIds(s2)).toEqual(['a', 'c'])
  })

  it('queue에서도 제거', () => {
    const s1 = applySubagents(
      emptySplitView(),
      running('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
      1_000
    ) // queue=[g,h]
    const s2 = applySubagents(s1, running('a', 'b', 'c', 'd', 'e', 'f', 'h'), 2_000) // g 소멸
    expect(s2.queue).toEqual(['h'])
    expect(cellIds(s2)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('셀 소멸로 생긴 빈 슬롯 수만큼 queue 선두부터 승격(FIFO)', () => {
    const s1 = applySubagents(
      emptySplitView(),
      running('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
      1_000
    ) // cells=a..f, queue=[g,h]
    const s2 = applySubagents(s1, running('a', 'd', 'e', 'f', 'g', 'h'), 2_000) // b,c 소멸
    expect(cellIds(s2)).toEqual(['a', 'd', 'e', 'f', 'g', 'h'])
    expect(s2.queue).toEqual([])
  })

  it('제거된 셀이 activeId였다면 activeId=null', () => {
    const s1 = noteActivity(applySubagents(emptySplitView(), running('a', 'b'), 1_000), 'b', 1_500)
    const s2 = applySubagents(s1, running('a'), 2_000)
    expect(s2.activeId).toBeNull()
  })

  it('잔존 셀이 activeId면 유지', () => {
    const s1 = noteActivity(applySubagents(emptySplitView(), running('a', 'b'), 1_000), 'a', 1_500)
    const s2 = applySubagents(s1, running('a'), 2_000)
    expect(s2.activeId).toBe('a')
  })
})
