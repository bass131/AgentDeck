import type { LoopGoalView, LoopLimitView, LoopPhase, LoopStatus, LoopVerificationLine } from '@shared/ipcContract'
import { localClockLabel } from '@shared/13_Loop/clock'

// main의 decide 근거 상한(handlers/loop.ts EVIDENCE_MAX)과 같다 — 넘으면 main이 요청을 거부한다
export const EVIDENCE_MAX = 2000
// main은 빈 근거를 받지 않는다
export const RESUME_EVIDENCE = '사람이 루프 화면에서 멈춘 사유를 보고 이어 가기를 골랐다'

// 저장소 경로 비교 키 — main의 repoKeyOf처럼 구분자·끝 구분자를 맞추고, Windows 경로는 대소문자를 가리지 않는다.
// push의 cwd는 그 저장소를 처음 연 표기라 화면이 고른 표기와 다를 수 있다.
export function cwdKey(p: string): string {
  let s = p.replace(/\\/g, '/').replace(/\/+$/, '')
  if (/^[A-Za-z]:/.test(s) || s.startsWith('//')) s = s.toLowerCase()
  return s
}

export const sameCwd = (a: string | null, b: string | null): boolean => a !== null && b !== null && cwdKey(a) === cwdKey(b)

export const PHASE_LABEL: Record<LoopPhase, string> = {
  closed: '닫힘',
  'open-failed': '열기 실패',
  'not-started': '시작 전',
  running: '도는 중',
  'waiting-human': '사람 대기',
  'waiting-ci': 'CI 대기',
  halted: '멈춤',
  latched: '래치',
  blocked: '진행 불가',
  limit: '한도 멈춤',
  done: '끝남',
}

// 검증 기록 마커의 화면 이름 — 저장 값('PASS'·'FAIL'·'USER-INPUT')은 그대로다
export const MARKER_LABEL: Record<LoopVerificationLine['marker'], string> = { PASS: '통과', FAIL: '실패', 'USER-INPUT': '사람 입력' }
export const VERDICT_LABEL: Record<NonNullable<LoopStatus['lastVerdict']>['verdict'], string> = { pass: '통과', fail: '실패', stop: '멈춤' }

export const GOAL_STATUS_LABEL: Record<LoopGoalView['status'], string> = { pending: '대기', active: '진행', done: '완료' }
export const GRADE_LABEL: Record<NonNullable<LoopGoalView['grade']>, string> = { strong: '강', weak: '약' }

const EXCEPTION_PHASES: ReadonlySet<LoopPhase> = new Set<LoopPhase>([
  'waiting-human', 'waiting-ci', 'halted', 'blocked', 'open-failed', 'latched', 'limit',
])

const localTime = (iso: string): string => localClockLabel(Date.parse(iso)) ?? iso

// 한도 멈춤의 사실 한 줄들 — 모르는 값은 「모름」이다
export function limitFacts(l: LoopLimitView): string[] {
  return [
    l.resetsAt === null ? '풀리는 시각 모름' : `풀리는 시각 ${localTime(l.resetsAt)}`,
    l.human ? '사람의 「지금 이어 가기」 전에는 스스로 이어 가지 않는다' : l.resumeAt === null ? '풀리는 시각을 몰라 스스로 이어 가지 않는다' : `${localTime(l.resumeAt)} 뒤 스스로 이어 간다`,
    l.utilization === null ? '사용률 모름' : `사용률 ${Math.round(l.utilization * 100)}%`,
  ]
}

interface ExceptionLine {label: string; reason: string | null; latchFile: string | null }

// 사람을 부르는 예외 한 줄. 여섯 단계는 늘 보이고, 그 밖의 단계도 사유가 있으면 「알림」으로 보인다(시작 실패·구동 오류).
export function exceptionLine(s: LoopStatus): ExceptionLine | null {
  const latchFile = s.latch?.file ?? null
  if (EXCEPTION_PHASES.has(s.phase)) {
    let reason = s.reason
    if (reason === null && s.phase === 'waiting-human') {
      reason = s.approval ? '스펙 승인을 기다려요' : s.milestonePr !== null ? `마일스톤 PR #${s.milestonePr} 병합을 기다려요` : null
    }
    return { label: PHASE_LABEL[s.phase], reason, latchFile }
  }
  if (s.reason !== null && s.reason.trim() !== '') return { label: '알림', reason: s.reason, latchFile }
  return null
}

export const sha12 = (sha: string): string => sha.slice(0, 12)

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
