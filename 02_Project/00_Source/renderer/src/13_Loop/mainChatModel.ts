// M10 G3 메인 대화 보기의 순수 도우미 — 사건 줄의 이름표·모양, 시각 글자, 고정 근거 문구, 입력을 막는 까닭.
// 화면은 대화를 만들지 않는다. 여기 함수는 main이 준 보기(MainChatView)와 상태(LoopStatus)를 읽어 보일 글만 고른다.
import type { LoopEventKind, LoopStatus, MainChatItem, MainChatView } from '@shared/ipcContract'

// 사건 줄의 모양 — ok(통과·병합), run(노드 시작), fail(FAIL·멈춤·오류·래치), human(사람 판정), flag(메인의 일시 정지 깃발), muted(기록)
// 깃발(flag)은 사람의 이어 가기(resumed, human)와 다른 모양이다 — 깃발은 「멈춤」 표시이고, 이어 가기는 사람의 판정이다(G2 독립 검수)
export type EventTone = 'ok' | 'run' | 'fail' | 'human' | 'flag' | 'muted'

export const EVENT_LOOK: Record<LoopEventKind, { label: string; tone: EventTone }> = {
  'node-start': { label: 'RUN', tone: 'run' },
  'node-end': { label: 'PASS', tone: 'ok' },
  fail: { label: 'FAIL', tone: 'fail' },
  halt: { label: '멈춤', tone: 'fail' },
  error: { label: '오류', tone: 'fail' },
  'goal-merged': { label: '병합', tone: 'ok' },
  'milestone-pr': { label: '마일스톤 PR', tone: 'ok' },
  'spec-approved': { label: '사람 · 승인', tone: 'human' },
  'spec-rejected': { label: '사람 · 고치기', tone: 'human' },
  'flag-raised': { label: '깃발 올림', tone: 'flag' },
  'flag-lowered': { label: '깃발 내림', tone: 'flag' },
  resumed: { label: '사람 · 이어 가기', tone: 'human' },
  backlog: { label: 'Backlog', tone: 'muted' },
  latched: { label: '래치', tone: 'fail' },
  done: { label: '끝', tone: 'ok' },
}

// 사건 종류 → 모양. 표에 없는 종류(옛 빌드가 남긴 이름, 객체 원형의 이름)는 종류 이름을 이름표로, muted로 그린다 —
// 모르는 종류 하나가 화면 전체를 무너뜨리지 않는다(G3 독립 검수 중요 1). 저장본도 main이 모르는 종류를 걸러 연다
export function lookOf(kind: string): { label: string; tone: EventTone } {
  return Object.prototype.hasOwnProperty.call(EVENT_LOOK, kind) ? EVENT_LOOK[kind as LoopEventKind] : { label: kind, tone: 'muted' }
}

// 기록 한 줄이 같은 내용인가 — push는 매번 새 객체를 주므로 id만이 아니라 그 줄이 그리는 칸을 모두 본다
// (같은 id의 사람 글이 줄 섬 → 보냄으로 바뀐다). 같으면 그 줄을 다시 그리지 않는다(G3 독립 검수 중요 2)
export function sameItem(a: MainChatItem, b: MainChatItem): boolean {
  if (a === b) return true
  if (a.id !== b.id || a.at !== b.at) return false
  switch (a.kind) {
    case 'user': return b.kind === 'user' && a.text === b.text && a.state === b.state
    case 'assistant': return b.kind === 'assistant' && a.text === b.text && a.turn === b.turn
    case 'notice': return b.kind === 'notice' && a.text === b.text
    case 'event': {
      if (b.kind !== 'event') return false
      const x = a.event
      const y = b.event
      return x.kind === y.kind && x.text === y.text && x.node === y.node && x.goal === y.goal && x.verdict === y.verdict
    }
  }
}

// 사람이 메인 대화의 승인 카드 버튼으로 낸 판정의 근거 — main은 빈 근거를 받지 않는다
export const CHAT_APPROVE_EVIDENCE = '사람이 메인 대화에서 스펙 본문을 보고 승인했다'

// ISO 시각 → 지역 시각 HH:MM. 읽지 못하면 빈 글자
export function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 입력을 막는 까닭 — 작업 폴더가 없거나, 보기를 아직 못 읽었거나, 열린 실행기가 없으면(root null) 막는다. 막지 않으면 null
export function blockedReason(cwd: string | null, view: MainChatView | null): string | null {
  if (cwd === null) return '작업 폴더를 먼저 골라요 — 오른쪽 현황판의 「폴더 고르기」나 왼쪽 「프로젝트 열기」'
  if (view === null) return '메인 대화를 읽는 중이에요'
  if (view.root === null) return '실행기가 열려 있지 않아요 — 오른쪽 현황판에서 「열기」를 누르면 메인 대화가 열려요'
  return null
}

// 「작업 세션 멈추기」를 보일까 — 작업·검수 세션이 떠 있을 때. 브레인스토밍의 세션은 메인 대화라 작업 세션이 아니다.
// 상태의 sessionActive는 메인 턴도 함께 센다 — 실행이 노드를 돌지 않는데(사람·CI 기다림) 메인 턴만 돌면 작업 세션이 아니다.
// 확신할 수 없는 경우(노드를 돌며 메인 턴도 돎)는 보이고, 멈출 세션이 없으면 main이 거짓을 돌려준다.
// 메인 대화 화면과 현황판의 「작업 세션 취소」가 이 한 판단을 쓴다(G3 독립 검수 사소 3).
export function workSessionLive(status: LoopStatus | null, view: MainChatView | null): boolean {
  if (status === null || !status.sessionActive) return false
  if (status.mainNode || view?.brainstorming === true) return false
  return !(status.mainBusy && status.phase !== 'running')
}
