// M09 G1 — 실행기가 바깥 세계를 만지는 포트. G1은 인터페이스와 시험용 가짜만 둔다.
// 실제 구현(Agent SDK 세션, git·gh 실행, 작업 저장소 파일)은 G2의 몫이다. 아래 계약은 G2 구현이 지켜야 하는 것이다.
// 모든 경로는 작업 저장소 뿌리 기준의 상대 경로이고 구분자는 / 다.
//
// G2 인계
// - 작업 세션이 `.agentdeck/`(특히 run-state.json·verification.md)를 직접 쓰는 구멍은 G1에서 막지 못한다.
//   실행 상태 검사는 자기 일관성(계수·멈춤)만 보므로, 줄 목록과 상태를 함께 고치면 통과한다. G2의 노드 세션 잠금 노드가
//   `.agentdeck/` 쓰기를 거부해서 막는다(원격 쓰기 잠금과 같은 노드).
// - `.agentdeck/`의 git 취급(gitignore, 커밋 pathspec에서 빼기, 실행기가 정한 시점에만 커밋)은 G2가 정한다.
//   지금 commitAll은 작업 트리 전부를 싣고, 실행기는 매 단계 run-state.json을 고친다.
import type { CiStatus } from './executor'
import type { FileChange } from './grade'
import type { GoalState } from './runState'
import type { DocKind, GateNode, WorkNode } from './template'

export interface CommandResult { code: number; stdout: string; stderr: string }
// 템플릿이 적은 검사 명령을 돈다. 원격 자격(GH_TOKEN 같은 것)이 없는 환경에서 돌린다 — 검사 명령이 원격을 만지지 못하게.
export interface CommandPort {
  run(cmd: string, cwd: string): Promise<CommandResult>
}

export interface GitPort {
  branchExists(name: string): Promise<boolean>
  // from에서 name 브랜치를 만든다(옮겨 가지는 않는다).
  createBranch(name: string, from: string): Promise<void>
  checkout(name: string): Promise<void>
  headSha(ref: string): Promise<string | null>
  // 커밋 안 된 변경이 있는가(untracked 포함).
  hasChanges(): Promise<boolean>
  // 지금 브랜치에 변경 전부를 커밋하고 새 머리 SHA를 돌려준다.
  commitAll(message: string): Promise<string>
  push(branch: string): Promise<void>
  // 원격을 읽고, 로컬 branch가 원격의 조상이면 원격 머리로 fast-forward한다. 같거나 로컬이 앞서면 그대로 둔다.
  // 원격에 그 브랜치가 없으면 그대로 둔다. 둘이 갈라졌으면 실패한다(throw). 맞춘 뒤의 로컬 머리를 돌려준다.
  syncToRemote(branch: string): Promise<string | null>
  // sha가 ref의 역사에 있는가(같은 커밋 포함 — 이미 병합됐는가·계보의 확인).
  isAncestor(sha: string, ref: string): Promise<boolean>
  // 지금 브랜치에 sha를 --no-ff로 병합하고 병합 커밋 SHA를 돌려준다. 실패하면 `git merge --abort`로 되돌린 뒤 throw한다.
  mergeNoFf(sha: string, message: string): Promise<string>
  // 작업 트리(커밋 안 된 변경과 untracked 파일 포함)와 base의 차이. rename은 옛 경로와 새 경로를 둘 다 낸다.
  // 줄 수를 모르는 파일(바이너리)은 added·removed를 null로 낸다. 얻지 못하면 null(등급은 강이 된다).
  diffStat(base: string): Promise<FileChange[] | null>
}

export type PrState = 'open' | 'merged' | 'closed'
// headSha는 PR의 머리(병합됐으면 병합 때의 머리), mergeCommitSha는 병합됐을 때만 있다.
export interface PrInfo { number: number; state: PrState; headSha: string; mergeCommitSha: string | null }
export interface GhPort {
  // head → base의 PR 가운데 가장 최근 것(열림·병합·닫힘 모두). 없으면 null.
  findPr(head: string, base: string): Promise<PrInfo | null>
  getPr(number: number): Promise<PrInfo | null>
  createPr(req: { head: string; base: string; title: string; body: string }): Promise<PrInfo>
  // PR 머리 커밋의 필수 검사 상태와 그 머리 SHA. 새 머리의 검사가 아직 시작되지 않았으면 pending이다 —
  // 옛 머리의 결과를 돌려주면 안 된다(실행기는 headSha가 push한 머리와 다르면 기다린다).
  ciStatus(number: number): Promise<CiStatus>
}

export interface FsPort {
  read(rel: string): Promise<string | null>
  write(rel: string, text: string): Promise<void>
  // 폴더 바로 아래의 파일 이름들. 폴더가 없으면 빈 배열.
  list(relDir: string): Promise<string[]>
}

// 작업 노드 하나의 의뢰. 세션에는 노드의 지시와 생존 문서만 준다(마일스톤 스펙).
export interface WorkRequest {
  milestoneId: string
  node: WorkNode
  goal: GoalState | null
  docs: Partial<Record<DocKind, string | null>>
}
export interface SessionPort {
  runWork(req: WorkRequest): Promise<{ ok: boolean; summary: string }>
}

// 모델 게이트 — 구현 문맥이 없는 세션이 판정한다(G3).
export interface ReviewPort {
  review(req: { milestoneId: string; node: GateNode; goal: GoalState | null }): Promise<{ verdict: 'pass' | 'fail' | 'stop'; evidence: string }>
}

export interface Clock { now(): string }

export interface LoopPorts {
  command: CommandPort
  git: GitPort
  gh: GhPort
  fs: FsPort
  session: SessionPort
  review: ReviewPort
  clock: Clock
}
