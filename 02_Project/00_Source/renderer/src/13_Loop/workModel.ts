import type { LoopPhase, LoopStatus } from '@shared/ipcContract'
import { cwdKey } from './loopModel'

type TagTone ='brain' | 'run' | 'stop' | 'merge' | 'idle'
interface ProjectTag {label: string; tone: TagTone }

const STOP_PHASES: ReadonlySet<LoopPhase> = new Set<LoopPhase>(['halted', 'latched', 'blocked', 'open-failed'])

export function projectTag(s: LoopStatus | null): ProjectTag | null {
  if (s === null || s.phase === 'closed') return null
  const pre = s.milestoneId !== null ? `${s.milestoneId} · ` : ''
  if (STOP_PHASES.has(s.phase)) return { label: `${pre}멈춤`, tone: 'stop' }
  if (s.phase === 'done') return { label: `${pre}끝`, tone: 'idle' }
  if (s.paused) return { label: `${pre}멈춤`, tone: 'stop' }
  if (s.phase === 'not-started') return { label: `${pre}시작 전`, tone: 'idle' }
  if (s.phase === 'waiting-human' && s.milestonePr !== null) return { label: `${pre}병합 대기`, tone: 'merge' }
  const brainstorming = s.mainNode || (s.phase === 'waiting-human' && s.approval !== null)
  if (brainstorming) return { label: `${pre}브레인스토밍`, tone: 'brain' }
  return { label: `${pre}진행 중`, tone: 'run' }
}

// 현황판이 직접 답하는 결정(이어 가기·래치 풀기·구동자 카드)은 빠진다. 여기는 다른 곳에서 답하는 결정을 가리키기만 한다
interface Decision {kind: 'chat' | 'merge'; title: string; text: string }
export function decisionsOf(s: LoopStatus): Decision[] {
  const out: Decision[] = []
  for (const c of s.cards) {
    if (c.inChat !== true) continue
    if (c.kind === 'question') out.push({ kind: 'chat', title: `질문 ${c.questions.length}개 — 메인 대화에 있어`, text: c.questions[0]?.question ?? c.text })
    else out.push({ kind: 'chat', title: '권한 요청 — 메인 대화에 있어', text: `${c.toolName} ${c.summary}` })
  }
  if (s.approval !== null) out.push({ kind: 'chat', title: `${s.approval.title} — 메인 대화에 있어`, text: s.approval.title })
  if (s.phase === 'waiting-human' && s.milestonePr !== null) {
    out.push({ kind: 'merge', title: `마일스톤 PR #${s.milestonePr} 병합 — 아래 PR 칸에서`, text: '병합은 사람이 버튼으로 한다' })
  }
  return out
}

export function goalProgress(s: LoopStatus): { done: number; total: number } | null {
  if (s.goals.length === 0) return null
  return { done: s.goals.filter((g) => g.status === 'done').length, total: s.goals.length }
}

export function addProject(list: readonly string[], p: string): string[] {
  if (list.some((x) => cwdKey(x) === cwdKey(p))) return [...list]
  return [...list, p]
}

export function folderName(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}
