// 실행기 조립 진입점. 작업 저장소 하나에 실물 포트를 붙여 실행기를 연다(화면·IPC 연결은 loopDriver).
//   1. 작업 저장소 뿌리(git rev-parse --show-toplevel의 실제 경로)를 정한다. git 저장소가 아니면 열지 않는다.
//      실물 gh로 CI를 판정하는데 필수 검사 이름(requiredChecks)이 없으면 열지 않는다(머리의 아무 검사로 통과하지 않게).
//   2. 저장소당 실행기 하나 — 앱 영역의 잠금(repoLock)을 잡는다. 이미 있으면 열지 않는다.
//   3. 실물 gh면 origin 주소에서 gh 저장소(HOST/OWNER/REPO)를 정한다 — 모든 gh 호출에 -R로 고정한다. 정하지 못하면 열지 않는다.
//      실행기 git 설정 대조(configGuard) — 위험 키가 로컬 설정에 있으면 열지 않고, 설정 스냅숏을 앱 영역에 적는다.
//      지난 실행의 스냅숏과 다르면 열지 않는다. 사람이 화면에서 바뀐 키를 확인하고 받으면(acceptConfigChanged) 그 차이만 새 기준선으로 연다.
//   4. 기준 브랜치 — origin의 기본 브랜치. `refs/remotes/origin/HEAD`를 먼저 읽고, 없으면 gh의 저장소 정보(defaultBranchRef)를
//      읽는다. 둘 다 못 읽으면 열지 않는다. 부르는 쪽이 base를 주면 그것을 쓴다.
//   5. `.agentdeck/`를 작업 저장소의 .git/info/exclude에 더한다(확인 뒤 실행, 저장소 파일은 안 바꾼다).
//   6. 자격 없는 자식 환경을 만든다 — 커밋 신원은 실행기 환경의 git config user.name·user.email을 넘겨받는다.
//   7. 포트: 명령(자격 없는 환경), git·gh(실행기 환경 — 자격 있음, 묻는 창 없음, 작업 저장소 훅은 끄고 호출마다 설정 대조,
//      앱 토큰이 있으면 gh는 GH_TOKEN, git은 github.com 원격 호출의 자격 도우미로 그 토큰을 쓴다),
//      fs(뿌리 밖 거부), 다이제스트·위조 래치(앱 영역).
//   8. 세션: 부르는 쪽이 백엔드를 주면 실물 작업 노드 세션 포트(workSession.ts)와 실물 검수 세션 포트(reviewSession.ts)를 붙인다 —
//      자격 없는 환경, 자동 모드, 루프 잠금(앱 영역 포함, 검수는 읽기 전용 꼴). 시험은 세션·검수 포트를 직접 줄 수 있다(주면 그것이 이긴다).
//   닫기: 돌고 있는 세션을 멈추고, 진행 중인 step(직렬화 줄)이 끝나기를 기다린 뒤 자식 환경을 지우고 잠금을 푼다.
// 앱 영역은 부르는 쪽이 준다(실물은 join(getUserDataDir(), 'loop') — 이 모듈은 electron을 import하지 않는다). gh와 템플릿은 시험이 바꿔 끼울 수 있다.
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { AgentBackend } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopSessionTag } from '@shared/13_Loop/loop'
import { loadBundledTemplate } from './bundledTemplate'
import { createCredentialFreeEnv, type CredentialFreeEnv, type GitIdentity } from './childEnv'
import { createConfigGuard, executorGitEnv, promptlessGitEnv } from './configGuard'
import { createFileDigestStore, repoKeyOf } from './digestStore'
import { createLoopRunner, type LoopRunner } from './loopRunner'
import type { Clock, DigestStore, GhPort, GitPort, ReviewPort, SessionPort, WorkRequest, WorkResult } from './ports'
import { createCommandPort } from './realPorts/commandPort'
import { runProcess } from './realPorts/exec'
import { createFsPort } from './realPorts/fsPort'
import { maskCredentials } from '../08_Git/git'
import { repoSlugOf } from './realPorts/ghParse'
import { createGhExec, createGhPort } from './realPorts/ghPort'
import { createGitPort, ensureAgentdeckExcluded, readOriginDefaultBranch } from './realPorts/gitPort'
import { acquireRepoLock } from './repoLock'
import { createReviewSessionPort } from './reviewSession'
import { readGlobalTaste } from '@main/13_Taste/tasteStore'
import type { Template } from './template'
import { createWorkSessionPort, type CardResponder } from './workSession'
import { withLimitInjection } from './limitInjection'
import { GITHUB_GIT_URL } from '@main/14_GitHub/appToken'

const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60_000

export interface OpenLoopOptions {
  cwd: string
  // 앱 영역 — digests/(다이제스트·위조 래치), locks/(저장소 잠금), git-config/(설정 스냅숏)가 산다. 루프 잠금이 이 폴더 쓰기를 막는다.
  appDataDir: string
  // 세션 포트를 직접 준다(시험). 없으면 backend로 실물 포트를 만든다. 둘 다 없으면 열지 않는다.
  session?: SessionPort
  backend?: AgentBackend
  // 작업자 노드 세션 하나의 시간 상한. 기본은 workSession.DEFAULT_SESSION_TIMEOUT_MS. 메인 노드에는 걸지 않는다
  sessionTimeoutMs?: number
  // 작업자 노드 세션의 카드 응답자. 기본은 거부·무응답
  onCard?: CardResponder
  // 메인 노드(브레인스토밍) 세션의 카드 응답자(화면으로 보낸다)
  mainCard?: CardResponder
  // 메인 노드(브레인스토밍)를 메인 대화로 보낸다(실물 세션 포트일 때만 — 시험이 session을 주면 그것이 이긴다)
  mainWork?: (req: WorkRequest) => Promise<WorkResult>
  // 작업·검수 세션의 사건을 세션 꼬리표(kind work·review, key, 노드·goal, SDK 세션 id)와 함께 흘린다
  onSessionEvent?: (e: AgentEvent, tag: LoopSessionTag) => void
  // 검수 포트를 직접 준다(시험). 없으면 backend로 실물 검수 세션 포트를 만든다. 둘 다 없으면 열지 않는다.
  review?: ReviewPort
  reviewTimeoutMs?: number
  clock?: Clock
  // 실행기 자신의 git·gh 환경(자격 있음). 기본은 이 프로세스의 환경. 묻는 창은 언제나 끈다(executorGitEnv)
  executorEnv?: NodeJS.ProcessEnv
  // 자격 없는 자식 환경의 바탕. 기본은 executorEnv(PATH를 좁히기 전)
  childBaseEnv?: NodeJS.ProcessEnv
  commandTimeoutMs?: number
  // CI 기다림의 시간 상한(기본 60분)과 횟수 보조 상한
  ciWaitMs?: number
  ciWaitLimit?: number
  // CI 판정에 쓸 검사 이름(예: hard-gates). 실물 gh(gh를 주지 않을 때)는 비어 있으면 열지 않는다
  requiredChecks?: string[]
  gh?: GhPort
  template?: { template: Template; hash: string }
  // 기준 브랜치를 직접 준다. 없으면 origin의 기본 브랜치를 읽는다
  base?: string
  // 사람이 화면에서 확인하고 받은 설정 차이(래치 풀기). 지난 스냅숏과의 차이가 이 목록과 같을 때만 연다
  acceptConfigChanged?: readonly string[]
  // 전역 Taste의 거처(실물은 getUserDataDir()). 검수 때마다 여기서 전역 Taste를 읽는다. 없으면 전역 Taste가 없는 것으로 본다
  tasteDataDir?: string
  // 사용량 한도 주입 파일(limitInjection — 켜는 곳은 main 조립 지점뿐). 작업·검수 세션의 백엔드만 감싼다
  limitInjectFile?: string
  // 앱 토큰(14_GitHub/appToken). 실행기 gh·git 포트만 호출마다 읽는다 — executorEnv와 자식 환경에는 넣지 않는다
  githubToken?: () => string | null
  // 시험 이음매 — 앱 토큰을 거는 git 원격 주소(기본 https://github.com)와 실물 gh를 띄우는 함수(기본 runProcess)
  githubGitUrl?: string
  ghRun?: typeof runProcess
}

export interface OpenedLoop {
  runner: LoopRunner
  // 작업 저장소 뿌리(실제 경로)
  root: string
  // 다이제스트 키(repoKeyOf(root))와 그 저장소(래치 풀기가 쓴다)
  repoKey: string
  digest: DigestStore
  base: string
  // 작업 노드 세션과 검사 명령이 이 환경으로 돈다
  childEnv: CredentialFreeEnv
  // 실물 gh가 모든 호출에 -R로 고정한 저장소(HOST/OWNER/REPO). 부르는 쪽이 gh 포트를 주면 null
  ghRepo: string | null
  // 실행기와 같은 git·gh 포트(설정 대조·훅 끄기 포함). 실행기 밖에서 쓰는 쪽은 실행기가 돌지 않을 때만 쓴다
  git: GitPort
  gh: GhPort
  // 열린 뒤 기준선과 달라진 설정 키(래치 카드가 보인다)
  configChanges(): string[]
  // 돌고 있는 작업·검수 세션을 취소한다(화면의 취소). 멈춘 세션이 있었으면 true
  cancelSession(): boolean
  close(): Promise<void>
}

// changed·root: 설정 스냅숏 차이로 열지 못했을 때(화면이 바뀐 키를 보이고 사람이 받는다)
export type OpenLoopResult = { ok: true; loop: OpenedLoop } | { ok: false; reason: string; changed?: string[]; root?: string }

class OpenRefused extends Error {
  constructor(message: string, readonly changed?: string[]) { super(message) }
}

async function gitOut(cwd: string, env: NodeJS.ProcessEnv, args: string[]): Promise<string | null> {
  const r = await runProcess('git', args, { cwd, env, timeoutMs: 30_000 })
  return r.code === 0 ? r.stdout.trim() : null
}

async function readIdentity(root: string, env: NodeJS.ProcessEnv): Promise<GitIdentity | null> {
  const name = await gitOut(root, env, ['config', '--get', 'user.name'])
  const email = await gitOut(root, env, ['config', '--get', 'user.email'])
  return name && email ? { name, email } : null
}

const isoNow: Clock = { now: () => new Date().toISOString() }

export async function openLoop(opts: OpenLoopOptions): Promise<OpenLoopResult> {
  if (!opts.session && !opts.backend) return { ok: false, reason: '작업 노드 세션을 열 백엔드(또는 세션 포트)가 없다' }
  if (!opts.review && !opts.backend) return { ok: false, reason: '검수 세션을 열 백엔드(또는 검수 포트)가 없다' }
  if (!opts.gh && !(opts.requiredChecks?.length)) {
    return { ok: false, reason: '실물 gh로 CI를 판정하려면 필수 검사 이름(requiredChecks, 예: hard-gates)이 있어야 한다 — 비우면 머리의 아무 검사로 통과한다' }
  }
  const executorEnv = executorGitEnv(opts.executorEnv ?? process.env)
  const probe = await runProcess('git', ['rev-parse', '--show-toplevel'], { cwd: opts.cwd, env: executorEnv, timeoutMs: 30_000 })
  // 실행기 PATH는 사용자 프로필 아래 폴더를 뺀다 — git을 거기에만 두면 실행 파일을 찾지 못한다(code -1)
  if (probe.code === -1) {
    return { ok: false, reason: '실행기가 git을 찾지 못했다 — 실행기 PATH는 사용자 프로필 아래 폴더를 빼니, git·gh를 사용자 프로필 밖(예: C:\\Program Files)에 설치해야 한다' }
  }
  const top = probe.code === 0 ? probe.stdout.trim() : ''
  if (!top) return { ok: false, reason: `${opts.cwd}는 git 작업 저장소가 아니다` }
  const root = await fsp.realpath(path.resolve(top))

  let template = opts.template
  if (!template) {
    const t = loadBundledTemplate()
    if (!t.ok) return { ok: false, reason: `번들 템플릿이 스키마에 맞지 않는다 — ${t.errors.map((e) => `${e.path} ${e.reason}`).join('; ')}` }
    template = { template: t.template, hash: t.hash }
  }

  const repoKey = repoKeyOf(root)
  const locked = await acquireRepoLock(path.join(opts.appDataDir, 'locks'), repoKey, { cwd: root })
  if (!locked.ok) return { ok: false, reason: locked.reason }

  let child: CredentialFreeEnv | null = null
  try {
    // 실물 gh는 origin 주소(실행기 git이 push하는 곳)에서 정한 HOST/OWNER/REPO로 모든 호출을 고정한다.
    // 주소는 설정 대조가 본다(remote.origin.url). 부르는 쪽이 gh 포트를 주면 고정은 그 포트의 몫이다.
    // 설정 스냅숏을 적기 전에 정한다 — 열지 못한 실행이 스냅숏을 남기면, origin을 고친 뒤의 다시 열기가 「설정이 바뀌었다」로 막힌다.
    let ghRepo: string | null = null
    if (!opts.gh) {
      const url = await gitOut(root, executorEnv, ['remote', 'get-url', 'origin'])
      ghRepo = url === null ? null : repoSlugOf(url)
      if (ghRepo === null) throw new Error(`origin 주소(${url === null ? '없음' : maskCredentials(url)})에서 gh 저장소(HOST/OWNER/REPO)를 정하지 못했다`)
    }
    // 실행기 git의 hooksPath — 만들지 않는 앱 영역 경로. 대조가 호출마다 비었는지(없는지) 본다.
    // 자식 환경에 실리는 임시 폴더와 따로 둔다(세션이 그 경로를 모르고, 앱 영역 쓰기는 루프 잠금이 막는다).
    const hooksDir = path.join(opts.appDataDir, 'no-hooks')
    const guarded = await createConfigGuard({
      cwd: root, env: executorEnv, hooksPath: hooksDir, snapshotFile: path.join(opts.appDataDir, 'git-config', `${repoKey}.json`),
      ...(opts.acceptConfigChanged ? { acceptChanged: opts.acceptConfigChanged } : {}),
    })
    if (!guarded.ok) throw new OpenRefused(guarded.reason, guarded.changed)
    const guard = guarded.guard
    const gh = opts.gh ?? createGhPort(
      createGhExec({ cwd: root, repo: ghRepo as string, env: executorEnv, guard, ...(opts.githubToken ? { token: opts.githubToken } : {}), ...(opts.ghRun ? { run: opts.ghRun } : {}) }),
      { requiredChecks: opts.requiredChecks },
    )
    // 기준 브랜치 — 설정 대조가 위험 키를 거른 뒤에 읽는다
    const base = opts.base ?? (await readOriginDefaultBranch(root, executorEnv)) ?? (await gh.defaultBranch?.()) ?? null
    if (base === null) {
      throw new Error('origin의 기본 브랜치를 읽지 못했다 — refs/remotes/origin/HEAD가 없고 gh 저장소 정보에서도 읽지 못했다(`git remote set-head origin --auto`로 정한 뒤 다시 연다)')
    }
    await ensureAgentdeckExcluded(root, executorEnv)
    child = createCredentialFreeEnv(opts.childBaseEnv ?? promptlessGitEnv(opts.executorEnv ?? process.env), await readIdentity(root, executorEnv))
    const sessions = new AbortController()
    const clock = opts.clock ?? isoNow
    // 한도 사건의 시각은 실행기와 같은 시계로 거른다
    const now = (): number => Date.parse(clock.now())
    const sessionBackend = (kind: 'work' | 'review'): AgentBackend =>
      opts.limitInjectFile ? withLimitInjection(opts.backend as AgentBackend, opts.limitInjectFile, kind) : opts.backend as AgentBackend
    const session = opts.session ?? createWorkSessionPort({
      now,
      backend: sessionBackend('work'),
      cwd: root,
      env: child.env,
      appLoopDir: opts.appDataDir,
      timeoutMs: opts.sessionTimeoutMs,
      signal: sessions.signal,
      ...(opts.onCard ? { onCard: opts.onCard } : {}),
      ...(opts.mainCard ? { mainCard: opts.mainCard } : {}),
      ...(opts.mainWork ? { mainWork: opts.mainWork } : {}),
      ...(opts.onSessionEvent ? { onEvent: opts.onSessionEvent } : {}),
    })
    const review = opts.review ?? createReviewSessionPort({
      now,
      backend: sessionBackend('review'),
      cwd: root,
      env: child.env,
      appLoopDir: opts.appDataDir,
      timeoutMs: opts.reviewTimeoutMs,
      signal: sessions.signal,
      ...(opts.onSessionEvent ? { onEvent: opts.onSessionEvent } : {}),
    })
    const digest = createFileDigestStore(path.join(opts.appDataDir, 'digests'))
    const git = createGitPort({
      cwd: root, env: executorEnv, hooksPath: hooksDir, guard,
      ...(opts.githubToken ? { credential: { url: opts.githubGitUrl ?? GITHUB_GIT_URL, token: opts.githubToken } } : {}),
    })
    const runner = createLoopRunner({
      template: template.template,
      hash: template.hash,
      cwd: root,
      base,
      ciWaitMs: opts.ciWaitMs,
      ciWaitLimit: opts.ciWaitLimit,
      ports: {
        command: createCommandPort({ env: child.env, timeoutMs: opts.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS }),
        git,
        gh,
        fs: createFsPort(root),
        session,
        review,
        clock,
        digest,
        configGuard: guard,
        ...(opts.tasteDataDir !== undefined ? { taste: { readGlobal: () => readGlobalTaste(opts.tasteDataDir as string) } } : {}),
      },
    })
    const env = child
    let closed = false
    return {
      ok: true,
      loop: {
        runner,
        root,
        repoKey,
        digest,
        base,
        childEnv: env,
        ghRepo,
        git,
        gh,
        configChanges: () => guard.changes(),
        cancelSession: () => {
          const a = session.cancel?.() ?? false
          const b = review.cancel?.() ?? false
          return a || b
        },
        close: async () => {
          if (closed) return
          closed = true
          sessions.abort()
          try { await runner.idle() } finally {
            env.dispose()
            await locked.lock.release()
          }
        },
      },
    }
  } catch (e) {
    child?.dispose()
    await locked.lock.release()
    const changed = e instanceof OpenRefused ? e.changed : undefined
    return { ok: false, reason: `실행기를 열지 못했다 — ${(e as Error).message}`, root, ...(changed ? { changed } : {}) }
  }
}
