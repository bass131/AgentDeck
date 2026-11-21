// 시작하기 안내의 단계 판정 — 여섯 단계의 입력에서 끝남·할 일·확인 중·막힘과 이유를 낸다.
// 프로젝트가 없으면 헌장·Taste와 첫 마일스톤은 「프로젝트를 먼저 열어요」로 막히고 버튼이 꺼진다.
import { describe, expect, it } from 'vitest'
import type { EngineState, GithubAuthStatus, GhCheckResult, LoopStatus, TasteDocsRead } from '@shared/ipcContract'
import {
  ONBOARDING_KEY,
  allDone,
  autoOpenWanted,
  closedValue,
  decideSteps,
  type OnboardingInputs,
  type Step,
  type StepId,
} from '@renderer/14_Onboarding/onboardingModel'

const CWD = 'C:/work/practice'
const authed: EngineState = { available: true, authed: true, version: '0.2.0' }
const connected: GithubAuthStatus = { phase: 'connected', login: 'octo' }
const ghOk: GhCheckResult = { state: 'present', version: '2.62.0' }
const present = <T,>(doc: T) => ({ absent: false as const, path: 'p', raw: 'r', doc, problems: [] })
const docsAll: TasteDocsRead = {
  global: present({ scope: 'global', items: [] }) as TasteDocsRead['global'],
  charter: present({ goal: ['목표'], nonGoals: null }) as TasteDocsRead['charter'],
  project: { absent: true, path: 'p' },
}
const status = (over: Partial<LoopStatus>): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'not-started', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
  paused: false, mainBusy: false, mainWaiting: false, mainNode: false, recentLines: [], sessions: [], ...over,
})
const running = status({ phase: 'running', milestoneId: 'M01' })

const allGood: OnboardingInputs = {
  engine: authed, github: connected, gh: ghOk, cwd: CWD, gitRoot: CWD, taste: docsAll, loop: running,
}
const byId = (steps: Step[]): Record<StepId, Step> => Object.fromEntries(steps.map((s) => [s.id, s])) as Record<StepId, Step>
const step = (over: Partial<OnboardingInputs>, id: StepId): Step => byId(decideSteps({ ...allGood, ...over }))[id]

describe('decideSteps — 여섯 단계', () => {
  it('순서와 제목이 정해져 있고, 모두 갖추면 모두 끝남이다', () => {
    const steps = decideSteps(allGood)
    expect(steps.map((s) => [s.id, s.title])).toEqual([
      ['claude', 'Claude Code 로그인'], ['github', 'GitHub 계정'], ['gh', 'gh CLI'],
      ['project', '프로젝트 열기'], ['taste', '헌장·Taste'], ['milestone', '첫 마일스톤'],
    ])
    expect(steps.every((s) => s.state === 'done')).toBe(true)
    expect(allDone(steps)).toBe(true)
    expect(steps.find((s) => s.id === 'github')?.detail).toContain('octo')
    expect(steps.find((s) => s.id === 'gh')?.detail).toContain('2.62.0')
  })

  it.each<[string, Partial<OnboardingInputs>, StepId, Step['state'], string]>([
    ['엔진 읽는 중', { engine: 'checking' }, 'claude', 'checking', '확인하고 있어요'],
    ['엔진 읽기 실패', { engine: 'failed' }, 'claude', 'blocked', '읽지 못했어요'],
    ['SDK 없음', { engine: { available: false, authed: false, version: null } }, 'claude', 'blocked', '불러오지 못했어요'],
    ['미인증', { engine: { available: true, authed: false, version: null } }, 'claude', 'todo', '로그인'],
    ['GitHub 연결 안 됨', { github: { phase: 'disconnected' } }, 'github', 'todo', '연결해야 해요'],
    ['GitHub 연결 오류', { github: { phase: 'disconnected', error: 'GitHub 연결 준비가 안 됐어요' } }, 'github', 'todo', '준비가 안 됐어요'],
    ['GitHub 코드 받는 중', { github: { phase: 'requesting' } }, 'github', 'checking', '코드를 받고'],
    ['GitHub 승인 기다림', { github: { phase: 'pending', userCode: 'A-1', verificationUri: 'u', expiresAt: 'e' } }, 'github', 'checking', '승인을 기다리고'],
    ['GitHub 읽기 실패', { github: 'failed' }, 'github', 'blocked', '읽지 못했어요'],
    ['gh 확인 중', { gh: 'checking' }, 'gh', 'checking', '확인하고 있어요'],
    ['gh 없음', { gh: { state: 'absent' } }, 'gh', 'todo', '설치'],
    ['gh 시간 초과', { gh: { state: 'timeout' } }, 'gh', 'blocked', '5초'],
    ['gh 버전 모름', { gh: { state: 'present', version: null } }, 'gh', 'done', '설치돼 있어요'],
    ['폴더 없음', { cwd: null }, 'project', 'todo', '폴더를 열어요'],
    ['git 확인 중', { gitRoot: 'checking' }, 'project', 'checking', '확인하고 있어요'],
    ['git 아님', { gitRoot: null }, 'project', 'blocked', 'git 저장소가 아니에요'],
    ['git 읽기 실패', { gitRoot: 'failed' }, 'project', 'blocked', '확인하지 못했어요'],
    ['문서 읽는 중', { taste: 'checking' }, 'taste', 'checking', '확인하고 있어요'],
    ['문서 읽기 실패', { taste: 'failed' }, 'taste', 'blocked', '읽지 못했어요'],
    ['헌장 없음', { taste: { ...docsAll, charter: { absent: true, path: 'p' } } }, 'taste', 'todo', '프로젝트 헌장이 아직 없어요'],
    ['전역 Taste 없음', { taste: { ...docsAll, global: { absent: true, path: 'p' } } }, 'taste', 'todo', '전역 Taste이 아직 없어요'],
    ['루프 읽는 중', { loop: 'checking' }, 'milestone', 'checking', '확인하고 있어요'],
    ['루프 읽기 실패', { loop: 'failed' }, 'milestone', 'blocked', '읽지 못했어요'],
    ['루프 닫힘', { loop: status({ phase: 'closed', root: null }) }, 'milestone', 'todo', '루프를 열고'],
    ['루프 열기 실패', { loop: status({ phase: 'open-failed', reason: '기준 브랜치가 없다' }) }, 'milestone', 'blocked', '기준 브랜치가 없다'],
    ['열렸고 시작 전', { loop: status({ phase: 'not-started' }) }, 'milestone', 'todo', '마일스톤을 시작해요'],
    ['멈췄어도 시작한 마일스톤', { loop: status({ phase: 'halted', milestoneId: 'M02' }) }, 'milestone', 'done', 'M02'],
    ['끝난 마일스톤', { loop: status({ phase: 'done', milestoneId: 'M03' }) }, 'milestone', 'done', 'M03'],
    ['지난번에 끝난 실행', { loop: status({ phase: 'not-started', notice: '끝난 실행(M04) — 새 마일스톤을 시작하면 보관해요' }) }, 'milestone', 'done', '시작한 적이 있어요'],
  ])('%s', (_name, over, id, state, detail) => {
    const s = step(over, id)
    expect(s.state).toBe(state)
    expect(s.detail).toContain(detail)
  })

  it('프로젝트가 안 끝났으면 헌장·Taste와 첫 마일스톤은 프로젝트를 먼저 열라며 막히고 버튼이 꺼진다', () => {
    for (const over of [{ cwd: null }, { gitRoot: null }, { gitRoot: 'checking' as const }]) {
      const steps = byId(decideSteps({ ...allGood, ...over, taste: 'checking', loop: 'checking' }))
      for (const id of ['taste', 'milestone'] as const) {
        expect(steps[id].state).toBe('blocked')
        expect(steps[id].detail).toBe('프로젝트를 먼저 열어요')
        expect(steps[id].actionable).toBe(false)
      }
    }
  })

  it('앞 세 단계는 서로 기대지 않는다 — 로그인이 안 돼도 GitHub·gh는 제 상태다', () => {
    const steps = byId(decideSteps({ ...allGood, engine: { available: true, authed: false, version: null } }))
    expect(steps.github.state).toBe('done')
    expect(steps.gh.state).toBe('done')
    expect(steps.project.state).toBe('done')
  })

  it('막힌 단계라도 앞 단계가 원인이 아니면 버튼은 켜져 있다(엔진·gh 시간 초과·git 아님·열기 실패)', () => {
    expect(step({ engine: { available: false, authed: false, version: null } }, 'claude').actionable).toBe(true)
    expect(step({ gh: { state: 'timeout' } }, 'gh').actionable).toBe(true)
    expect(step({ gitRoot: null }, 'project').actionable).toBe(true)
    expect(step({ loop: status({ phase: 'open-failed', reason: 'x' }) }, 'milestone').actionable).toBe(true)
  })

  it('하나라도 끝나지 않으면 모두 끝남이 아니다', () => {
    expect(allDone(decideSteps({ ...allGood, gh: { state: 'absent' } }))).toBe(false)
  })
})

describe('뜨는 때 — prefs 기록', () => {
  it('기록이 없으면 저절로 뜨고, 「나중에」나 모두 끝남이 기록되면 뜨지 않는다', () => {
    expect(ONBOARDING_KEY).toBe('onboarding.closed')
    expect(autoOpenWanted(undefined)).toBe(true)
    expect(autoOpenWanted('')).toBe(true)
    expect(autoOpenWanted('later')).toBe(false)
    expect(autoOpenWanted('done')).toBe(false)
  })

  it('닫을 때 기록할 값은 모두 끝났으면 done, 아니면 later다', () => {
    expect(closedValue(decideSteps(allGood))).toBe('done')
    expect(closedValue(decideSteps({ ...allGood, cwd: null }))).toBe('later')
  })
})
