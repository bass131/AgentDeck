// M09 G1 — 실행기가 바깥 세계를 만지는 포트. G1은 인터페이스와 시험용 가짜만 둔다.
// 실제 구현(Agent SDK 세션, git·gh 실행, 작업 저장소 파일)은 G2의 몫이다.
// 모든 경로는 작업 저장소 뿌리 기준의 상대 경로이고 구분자는 / 다.
import type { CiStatus } from './executor'
import type { FileChange } from './grade'
import type { GoalState } from './runState'
import type { DocKind, GateNode, WorkNode } from './template'

export interface CommandResult { code: number; stdout: string; stderr: string }
export interface CommandPort {
  run(cmd: string, cwd: string): Promise<CommandResult>
}

export interface GitPort {
  branchExists(name: string): Promise<boolean>
  // from에서 name 브랜치를 만든다(옮겨 가지는 않는다).
  createBranch(name: string, from: string): Promise<void>
  checkout(name: string): Promise<void>
  headSha(ref: string): Promise<string | null>
  // 커밋 안 된 변경이 있는가.
  hasChanges(): Promise<boolean>
  // 지금 브랜치에 변경 전부를 커밋하고 새 머리 SHA를 돌려준다.
  commitAll(message: string): Promise<string>
  push(branch: string): Promise<void>
  // sha가 ref의 역사에 있는가(이미 병합됐는가의 확인).
  isAncestor(sha: string, ref: string): Promise<boolean>
  // 지금 브랜치에 sha를 --no-ff로 병합하고 병합 커밋 SHA를 돌려준다.
  mergeNoFf(sha: string, message: string): Promise<string>
  // 작업 트리(커밋 안 된 변경 포함)와 base의 차이. 얻지 못하면 null(등급은 강이 된다).
  diffStat(base: string): Promise<FileChange[] | null>
}

export type PrState = 'open' | 'merged' | 'closed'
// headSha는 PR의 머리(병합됐으면 병합 때의 머리), mergeCommitSha는 병합됐을 때만 있다.
export interface PrInfo { number: number; state: PrState; headSha: string; mergeCommitSha: string | null }
export interface GhPort {
  // head → base의 가장 최근 PR(열림·병합·닫힘 모두). 없으면 null.
  findPr(head: string, base: string): Promise<PrInfo | null>
  getPr(number: number): Promise<PrInfo | null>
  createPr(req: { head: string; base: string; title: string; body: string }): Promise<PrInfo>
  // PR 머리 커밋의 필수 검사 상태.
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
