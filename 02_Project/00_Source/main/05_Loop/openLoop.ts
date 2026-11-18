// M09 G2 — 실행기 조립 진입점. 작업 저장소 하나에 실물 포트를 붙여 실행기를 연다(화면·IPC 연결은 G3).
//   1. 작업 저장소 뿌리(git rev-parse --show-toplevel의 실제 경로)를 정한다. git 저장소가 아니면 열지 않는다.
//      실물 gh로 CI를 판정하는데 필수 검사 이름(requiredChecks)이 없으면 열지 않는다(머리의 아무 검사로 통과하지 않게).
//   2. 저장소당 실행기 하나 — 앱 영역의 잠금(repoLock)을 잡는다. 이미 있으면 열지 않는다.
//   3. 실행기 git 설정 대조(configGuard) — 설정 스냅숏을 앱 영역에 적는다. 지난 실행의 스냅숏과 다르면 열지 않는다.
//   4. `.agentdeck/`를 작업 저장소의 .git/info/exclude에 더한다(확인 뒤 실행, 저장소 파일은 안 바꾼다).
//   5. 자격 없는 자식 환경을 만든다 — 커밋 신원은 실행기 환경의 git config user.name·user.email을 넘겨받는다.
//   6. 포트: 명령(자격 없는 환경), git·gh(실행기 환경 — 자격 있음, 묻는 창 없음, 작업 저장소 훅은 끄고 호출마다 설정 대조),
//      fs(뿌리 밖 거부), 다이제스트·위조 래치(앱 영역).
//   7. 세션: 부르는 쪽이 백엔드를 주면 실물 작업 노드 세션 포트(workSession.ts)를 붙인다 — 자격 없는 환경, 자동 모드,
//      루프 잠금(앱 영역 포함). 시험은 세션 포트를 직접 줄 수 있다(주면 그것이 이긴다).
//   닫기: 돌고 있는 세션을 멈추고, 진행 중인 step(직렬화 줄)이 끝나기를 기다린 뒤 자식 환경을 지우고 잠금을 푼다.
// 앱 영역은 부르는 쪽이 준다(실물은 join(getUserDataDir(), 'loop') — 이 모듈은 electron을 import하지 않는다).
// 검수 포트는 부르는 쪽이 준다(실물은 G3). gh와 템플릿은 시험이 바꿔 끼울 수 있다.
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { AgentBackend } from '@main/03_Agent/AgentBackend'
import { loadBundledTemplate } from './bundledTemplate'
import { createCredentialFreeEnv, type CredentialFreeEnv, type GitIdentity } from './childEnv'
import { createConfigGuard, executorGitEnv } from './configGuard'
import { createFileDigestStore, repoKeyOf } from './digestStore'
import { createLoopRunner, type LoopRunner } from './loopRunner'
import type { Clock, GhPort, ReviewPort, SessionPort } from './ports'
import { createCommandPort } from './realPorts/commandPort'
import { runProcess } from './realPorts/exec'
import { createFsPort } from './realPorts/fsPort'
import { createGhExec, createGhPort } from './realPorts/ghPort'
import { createGitPort, ensureAgentdeckExcluded } from './realPorts/gitPort'
import { acquireRepoLock } from './repoLock'
import type { Template } from './template'
import { createWorkSessionPort, type CardResponder } from './workSession'

export const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60_000

export interface OpenLoopOptions {
  cwd: string
  // 앱 영역 — digests/(다이제스트·위조 래치), locks/(저장소 잠금), git-config/(설정 스냅숏)가 산다. 루프 잠금이 이 폴더 쓰기를 막는다.
  appDataDir: string
  // 세션 포트를 직접 준다(시험). 없으면 backend로 실물 포트를 만든다. 둘 다 없으면 열지 않는다.
  session?: SessionPort
  backend?: AgentBackend
  // 작업 노드 세션 하나의 시간 상한. 기본은 workSession.DEFAULT_SESSION_TIMEOUT_MS
  sessionTimeoutMs?: number
  // 작업 노드 세션의 카드 응답자. 기본은 거부·무응답(G3 사람 게이트가 바꿔 끼운다)
  onCard?: CardResponder
  review: ReviewPort
  clock?: Clock
  // 실행기 자신의 git·gh 환경(자격 있음). 기본은 이 프로세스의 환경. 묻는 창은 언제나 끈다(executorGitEnv)
  executorEnv?: NodeJS.ProcessEnv
  // 자격 없는 자식 환경의 바탕. 기본은 executorEnv
  childBaseEnv?: NodeJS.ProcessEnv
  commandTimeoutMs?: number
  // CI 기다림의 시간 상한(기본 60분)과 횟수 보조 상한
  ciWaitMs?: number
  ciWaitLimit?: number
  // CI 판정에 쓸 검사 이름(예: hard-gates). 실물 gh(gh를 주지 않을 때)는 비어 있으면 열지 않는다
  requiredChecks?: string[]
  gh?: GhPort
  template?: { template: Template; hash: string }
}

export interface OpenedLoop {
  runner: LoopRunner
  // 작업 저장소 뿌리(실제 경로)
  root: string
  // 작업 노드 세션과 검사 명령이 이 환경으로 돈다
  childEnv: CredentialFreeEnv
  close(): Promise<void>
}

export type OpenLoopResult = { ok: true; loop: OpenedLoop } | { ok: false; reason: string }

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
  if (!opts.gh && !(opts.requiredChecks?.length)) {
    return { ok: false, reason: '실물 gh로 CI를 판정하려면 필수 검사 이름(requiredChecks, 예: hard-gates)이 있어야 한다 — 비우면 머리의 아무 검사로 통과한다' }
  }
  const executorEnv = executorGitEnv(opts.executorEnv ?? process.env)
  const top = await gitOut(opts.cwd, executorEnv, ['rev-parse', '--show-toplevel'])
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
    // 실행기 git의 hooksPath — 만들지 않는 앱 영역 경로. 대조가 호출마다 비었는지(없는지) 본다.
    // 자식 환경에 실리는 임시 폴더와 따로 둔다(세션이 그 경로를 모르고, 앱 영역 쓰기는 루프 잠금이 막는다).
    const hooksDir = path.join(opts.appDataDir, 'no-hooks')
    const guarded = await createConfigGuard({
      cwd: root, env: executorEnv, hooksPath: hooksDir, snapshotFile: path.join(opts.appDataDir, 'git-config', `${repoKey}.json`),
    })
    if (!guarded.ok) throw new Error(guarded.reason)
    const guard = guarded.guard
    await ensureAgentdeckExcluded(root, executorEnv)
    child = createCredentialFreeEnv(opts.childBaseEnv ?? executorEnv, await readIdentity(root, executorEnv))
    const gh = opts.gh ?? createGhPort(createGhExec({ cwd: root, env: executorEnv, guard }), { requiredChecks: opts.requiredChecks })
    const sessions = new AbortController()
    const session = opts.session ?? createWorkSessionPort({
      backend: opts.backend as AgentBackend,
      cwd: root,
      env: child.env,
      appLoopDir: opts.appDataDir,
      timeoutMs: opts.sessionTimeoutMs,
      signal: sessions.signal,
      ...(opts.onCard ? { onCard: opts.onCard } : {}),
    })
    const runner = createLoopRunner({
      template: template.template,
      hash: template.hash,
      cwd: root,
      ciWaitMs: opts.ciWaitMs,
      ciWaitLimit: opts.ciWaitLimit,
      ports: {
        command: createCommandPort({ env: child.env, timeoutMs: opts.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS }),
        git: createGitPort({ cwd: root, env: executorEnv, hooksPath: hooksDir, guard }),
        gh,
        fs: createFsPort(root),
        session,
        review: opts.review,
        clock: opts.clock ?? isoNow,
        digest: createFileDigestStore(path.join(opts.appDataDir, 'digests')),
        configGuard: guard,
      },
    })
    const env = child
    let closed = false
    return {
      ok: true,
      loop: {
        runner,
        root,
        childEnv: env,
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
    return { ok: false, reason: `실행기를 열지 못했다 — ${(e as Error).message}` }
  }
}
