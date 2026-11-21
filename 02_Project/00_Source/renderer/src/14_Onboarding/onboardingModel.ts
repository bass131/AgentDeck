import type { EngineState, GhCheckResult, GithubAuthStatus, LoopStatus, TasteDocsRead } from '@shared/ipcContract'
import { GH_CHECK_TIMEOUT_MS } from '@shared/ipcContract'
import { folderName, missingTasteDocs } from '@renderer/13_Loop'

export type StepId = 'claude' | 'github' | 'gh' | 'project' | 'taste' | 'milestone'
export type StepState = 'done' | 'todo' | 'checking' | 'blocked'
export type Reading<T> = T | 'checking' | 'failed'

export interface OnboardingInputs {
  engine: Reading<EngineState>
  github: Reading<GithubAuthStatus>
  gh: Reading<GhCheckResult>
  // 작업 모드의 작업 폴더 — 헌장·Taste 칸과 현황판이 보는 폴더다
  cwd: string | null
  gitRoot: Reading<string | null>
  taste: Reading<TasteDocsRead>
  loop: Reading<LoopStatus>
}

// actionable이 거짓이면 앞 단계가 원인이라 버튼을 끈다
export interface Step { id: StepId; title: string; state: StepState; detail: string; actionable: boolean }
type Verdict = Omit<Step, 'id' | 'title' | 'actionable'> & { actionable?: boolean }

export const ONBOARDING_KEY = 'onboarding.closed'

const CHECKING: Verdict = { state: 'checking', detail: '확인하고 있어요…' }
const unreadable = (what: string): Verdict => ({ state: 'blocked', detail: `${what} 읽지 못했어요 — 다시 확인해 주세요` })
const NEED_PROJECT: Verdict = { state: 'blocked', detail: '프로젝트를 먼저 열어요', actionable: false }

function claude(r: Reading<EngineState>): Verdict {
  if (r === 'checking') return CHECKING
  if (r === 'failed') return unreadable('엔진 상태를')
  if (!r.available) return { state: 'blocked', detail: 'Claude Code 엔진을 불러오지 못했어요' }
  if (!r.authed) return { state: 'todo', detail: 'Claude Code에 로그인해야 해요' }
  return { state: 'done', detail: '로그인돼 있어요' }
}

function github(r: Reading<GithubAuthStatus>): Verdict {
  if (r === 'checking') return CHECKING
  if (r === 'failed') return unreadable('연결 상태를')
  if (r.phase === 'connected') return { state: 'done', detail: `${r.login} 계정에 연결돼 있어요` }
  if (r.phase === 'requesting') return { state: 'checking', detail: 'GitHub에서 코드를 받고 있어요…' }
  if (r.phase === 'pending') return { state: 'checking', detail: 'GitHub 승인을 기다리고 있어요' }
  return { state: 'todo', detail: r.error ?? 'GitHub 계정을 연결해야 해요' }
}

function gh(r: Reading<GhCheckResult>): Verdict {
  if (r === 'checking') return CHECKING
  if (r === 'failed') return unreadable('gh 상태를')
  if (r.state === 'present') return { state: 'done', detail: r.version ? `gh ${r.version}이 설치돼 있어요` : 'gh가 설치돼 있어요' }
  if (r.state === 'timeout') return { state: 'blocked', detail: `gh 확인이 ${GH_CHECK_TIMEOUT_MS / 1000}초 안에 끝나지 않았어요` }
  return { state: 'todo', detail: 'gh를 설치한 뒤 「다시 확인」을 눌러 주세요' }
}

function project(cwd: string | null, root: Reading<string | null>): Verdict {
  if (cwd === null) return { state: 'todo', detail: '작업 모드에서 프로젝트 폴더를 열어요' }
  if (root === 'checking') return CHECKING
  if (root === 'failed') return { state: 'blocked', detail: '폴더를 확인하지 못했어요 — 다시 확인해 주세요' }
  if (root === null) return { state: 'blocked', detail: 'git 저장소가 아니에요 — git 저장소 폴더를 열어 주세요' }
  return { state: 'done', detail: `${folderName(cwd)} 폴더가 열려 있어요` }
}

function taste(r: Reading<TasteDocsRead>): Verdict {
  if (r === 'checking') return CHECKING
  if (r === 'failed') return unreadable('문서를')
  const missing = missingTasteDocs(r, null)
  if (missing.length > 0) return { state: 'todo', detail: `${missing.join('·')}이 아직 없어요 — 문답으로 써요` }
  return { state: 'done', detail: '전역 Taste와 프로젝트 헌장이 있어요' }
}

// 앞서 끝난 실행은 실행기가 시작 전(not-started)과 안내 한 줄(notice)로 보인다
function started(s: LoopStatus): boolean {
  return s.milestoneId !== null || s.phase === 'done' || (s.phase === 'not-started' && s.notice !== undefined)
}

function milestone(r: Reading<LoopStatus>): Verdict {
  if (r === 'checking') return CHECKING
  if (r === 'failed') return unreadable('루프 상태를')
  if (started(r)) return { state: 'done', detail: r.milestoneId !== null ? `${r.milestoneId} 마일스톤을 시작했어요` : '마일스톤을 시작한 적이 있어요' }
  if (r.phase === 'closed') return { state: 'todo', detail: '현황판에서 루프를 열고 마일스톤을 시작해요' }
  if (r.phase === 'open-failed') return { state: 'blocked', detail: `루프를 열지 못했어요 — ${r.reason ?? '사유 없음'}` }
  return { state: 'todo', detail: '현황판에서 마일스톤을 시작해요' }
}

const TITLES: Record<StepId, string> = {
  claude: 'Claude Code 로그인',
  github: 'GitHub 계정',
  gh: 'gh CLI',
  project: '프로젝트 열기',
  taste: '헌장·Taste',
  milestone: '첫 마일스톤',
}

export function decideSteps(i: OnboardingInputs): Step[] {
  const proj = project(i.cwd, i.gitRoot)
  const afterProject = (v: () => Verdict): Verdict => (proj.state === 'done' ? v() : NEED_PROJECT)
  const verdicts: [StepId, Verdict][] = [
    ['claude', claude(i.engine)],
    ['github', github(i.github)],
    ['gh', gh(i.gh)],
    ['project', proj],
    ['taste', afterProject(() => taste(i.taste))],
    ['milestone', afterProject(() => milestone(i.loop))],
  ]
  return verdicts.map(([id, v]) => ({ id, title: TITLES[id], state: v.state, detail: v.detail, actionable: v.actionable ?? true }))
}

export const allDone = (steps: readonly Step[]): boolean => steps.every((s) => s.state === 'done')

export const autoOpenWanted = (saved: unknown): boolean => saved !== 'later' && saved !== 'done'

export const closedValue = (steps: readonly Step[]): 'done' | 'later' => (allDone(steps) ? 'done' : 'later')
