// M09 G2 — 실행기 조립 진입점. 작업 저장소 하나에 실물 포트를 붙여 실행기를 연다(화면·IPC 연결은 G3).
//   1. 작업 저장소 뿌리(git rev-parse --show-toplevel의 실제 경로)를 정한다. git 저장소가 아니면 열지 않는다.
//   2. 저장소당 실행기 하나 — 앱 영역의 잠금(repoLock)을 잡는다. 이미 있으면 열지 않는다.
//   3. `.agentdeck/`를 작업 저장소의 .git/info/exclude에 더한다(확인 뒤 실행, 저장소 파일은 안 바꾼다).
//   4. 자격 없는 자식 환경을 만든다 — 커밋 신원은 실행기 환경의 git config user.name·user.email을 넘겨받는다.
//   5. 포트: 명령(자격 없는 환경), git·gh(실행기 환경 — 자격 있음, 작업 저장소 훅은 끈다), fs(뿌리 밖 거부), 다이제스트(앱 영역).
// 앱 영역은 부르는 쪽이 준다(실물은 join(getUserDataDir(), 'loop') — 이 모듈은 electron을 import하지 않는다).
// 세션·검수 포트는 부르는 쪽이 준다(세션 실물은 G2 2차분, 검수 실물은 G3). gh와 템플릿은 시험이 바꿔 끼울 수 있다.
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { loadBundledTemplate } from './bundledTemplate'
import { createCredentialFreeEnv, type CredentialFreeEnv, type GitIdentity } from './childEnv'
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

export const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60_000

export interface OpenLoopOptions {
  cwd: string
  // 앱 영역 — digests/(실행 상태 다이제스트)와 locks/(저장소 잠금)가 산다
  appDataDir: string
  session: SessionPort
  review: ReviewPort
  clock?: Clock
  // 실행기 자신의 git·gh 환경(자격 있음). 기본은 이 프로세스의 환경
  executorEnv?: NodeJS.ProcessEnv
  // 자격 없는 자식 환경의 바탕. 기본은 executorEnv
  childBaseEnv?: NodeJS.ProcessEnv
  commandTimeoutMs?: number
  ciWaitLimit?: number
  // CI 판정에 쓸 검사 이름(예: hard-gates). 비우면 머리의 검사 전부
  requiredChecks?: string[]
  gh?: GhPort
  template?: { template: Template; hash: string }
}

export interface OpenedLoop {
  runner: LoopRunner
  // 작업 저장소 뿌리(실제 경로)
  root: string
  // 2차분의 작업 노드 세션도 이 환경으로 연다
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
  const executorEnv = opts.executorEnv ?? process.env
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
    await ensureAgentdeckExcluded(root, executorEnv)
    // 실행기 git의 hooksPath — 비어 있는 앱 영역 폴더. 자식 환경에 실리는 임시 폴더와 따로 둔다(세션이 그 경로에 훅을 넣지 못하게).
    const hooksDir = path.join(opts.appDataDir, 'no-hooks')
    await fsp.mkdir(hooksDir, { recursive: true })
    if ((await fsp.readdir(hooksDir)).length > 0) throw new Error(`실행기 git의 빈 훅 폴더 ${hooksDir}가 비어 있지 않다`)
    child = createCredentialFreeEnv(opts.childBaseEnv ?? executorEnv, await readIdentity(root, executorEnv))
    const gh = opts.gh ?? createGhPort(createGhExec({ cwd: root, env: executorEnv }), { requiredChecks: opts.requiredChecks })
    const runner = createLoopRunner({
      template: template.template,
      hash: template.hash,
      cwd: root,
      ciWaitLimit: opts.ciWaitLimit,
      ports: {
        command: createCommandPort({ env: child.env, timeoutMs: opts.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS }),
        git: createGitPort({ cwd: root, env: executorEnv, hooksPath: hooksDir }),
        gh,
        fs: createFsPort(root),
        session: opts.session,
        review: opts.review,
        clock: opts.clock ?? isoNow,
        digest: createFileDigestStore(path.join(opts.appDataDir, 'digests')),
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
          env.dispose()
          await locked.lock.release()
        },
      },
    }
  } catch (e) {
    child?.dispose()
    await locked.lock.release()
    return { ok: false, reason: `실행기를 열지 못했다 — ${(e as Error).message}` }
  }
}
