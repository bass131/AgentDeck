// M09 G1 — 실행기가 바깥 세계를 만지는 포트. G1은 인터페이스와 시험용 가짜를 두었다.
// G2 실물: realPorts/(명령·git·gh·fs), digestStore.ts(앱 쪽 다이제스트). 세션 포트의 실물은 G2 2차분이다.
// 모든 경로는 작업 저장소 뿌리 기준의 상대 경로이고 구분자는 / 다.
//
// G2에서 정한 것
// - `.agentdeck/`는 작업 저장소의 `.git/info/exclude`로 추적 밖이다(openLoop가 시작할 때 더한다). 그래서 commitAll·hasChanges·
//   diffStat에 실리지 않는다.
// - 상태 파일 위조의 겹은 둘이다. 루프 잠금 노드(04_Claude/permission/loopLock.ts)가 편집 도구와 순진한 Bash 편집을 잡고,
//   앱 쪽 다이제스트(DigestStore)가 실행기가 쓴 정규 JSON의 sha256을 작업 저장소 밖에 적어 읽을 때 다르면 멈춘다.
//   다이제스트는 편집 도구와 순진한 Bash 편집을 잡는 겹이다 — 키 없는 해시라 세션이 앱 영역에 쓰면 맞출 수 있다(보증이 아니다).
//   한 번 불일치를 보면 위조 래치(DigestStore.writeLatch + 실행기 메모리)가 걸려, 사람이 풀기 전까지 짝이 맞아도 멈춘다.
// - 실행기 git(자격 있음)은 세션이 심은 설정 코드를 돌릴 수 있다. 그래서 열 때 git 설정 스냅숏을 앱 영역에 적고 실행기의 모든
//   git·gh 호출 직전에 대조한다(configGuard.ts). 실행기는 단계 앞뒤로 ConfigCheck를 보고, 바뀌었으면 래치를 걸고 멈춘다.
//
// G4에서 정한 것
// - 모델 게이트의 입력은 실행기가 만든다 — goal 문서와, 작업 트리(커밋 안 된 변경·untracked 포함) 대 마일스톤 브랜치의 diff(GitPort.reviewSnapshot).
//   같은 임시 인덱스에서 낸 트리 해시가 검수 pass에 묶이고, 실행기는 goal 커밋·push 직전에 작업 트리 해시가 같은지 다시 본다.
// - 세션 결과의 cancelled는 취소(실행기 닫기·화면의 취소)다. 실행기는 이것을 FAIL로 세지 않고 멈춤(stop)으로 둔다.
// - 래치 풀기는 사람이 화면에서 한다(loopDriver) — DigestStore.clearLatch·remove가 그 길이다. 실행기 자신은 래치를 풀지 않는다.
import type { CiStatus } from './executor'
import type { FileChange } from './grade'
import type { GoalState } from './runState'
import type { DocKind, GateNode, WorkNode } from './template'

export interface CommandResult { code: number; stdout: string; stderr: string }
// 템플릿이 적은 검사 명령을 돈다. 원격 자격(GH_TOKEN 같은 것)이 없는 환경에서 돌린다 — 검사 명령이 원격을 만지지 못하게.
export interface CommandPort {
  run(cmd: string, cwd: string): Promise<CommandResult>
}

// 검수 입력 — 한 임시 인덱스에서 낸 작업 트리의 트리 해시와 base 대비 diff(전문)
export interface ReviewSnapshot { tree: string; diff: string }

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
  // 원격의 그 브랜치 머리(ls-remote). 원격에 없으면 null.
  remoteSha(branch: string): Promise<string | null>
  // 커밋의 부모들(병합 커밋이면 첫 부모, 병합한 머리 순).
  parents(sha: string): Promise<string[]>
  // 원격을 읽고, 로컬 branch가 원격의 조상이면 원격 머리로 fast-forward한다. 같거나 로컬이 앞서면 그대로 둔다.
  // 원격에 그 브랜치가 없으면 그대로 둔다. 둘이 갈라졌으면 실패한다(throw). 맞춘 뒤의 로컬 머리를 돌려준다.
  syncToRemote(branch: string): Promise<string | null>
  // sha가 ref의 역사에 있는가(같은 커밋 포함 — 이미 병합됐는가·계보의 확인).
  isAncestor(sha: string, ref: string): Promise<boolean>
  // 지금 브랜치에 sha를 --no-ff로 병합하고 병합 커밋 SHA를 돌려준다. 실패하면 `git merge --abort`로 되돌린 뒤 throw한다.
  mergeNoFf(sha: string, message: string): Promise<string>
  // commit이 (first, second)를 부모로 한 병합 커밋이고, 그 트리가 두 부모를 깨끗하게 병합한 트리(git merge-tree --write-tree)와
  // 같은가. 같으면 null, 아니면 사유. 작업 노드가 commit-tree로 부모만 맞춘 위조 병합 커밋을 실행기가 push하지 않게 한다(G2 재검수 차단 A).
  verifyMerge(commit: string, first: string, second: string): Promise<string | null>
  // 작업 트리(커밋 안 된 변경과 untracked 파일 포함)와 base의 차이. rename은 옛 경로와 새 경로를 둘 다 낸다.
  // 줄 수를 모르는 파일(바이너리)은 added·removed를 null로 낸다. 얻지 못하면 null(등급은 강이 된다).
  diffStat(base: string): Promise<FileChange[] | null>
  // M09 G4 — 작업 트리 전체(untracked 포함, 무시 목록 제외)를 임시 인덱스에 올린 트리 해시. 진짜 인덱스는 바꾸지 않는다. 얻지 못하면 null.
  worktreeTree(): Promise<string | null>
  // M09 G4 — 같은 임시 인덱스의 트리 해시와 base 대비 diff 전문. base가 없거나 얻지 못하면 null.
  reviewSnapshot(base: string): Promise<ReviewSnapshot | null>
  // M09 G4 — 커밋(ref)의 트리 해시. 없으면 null.
  treeOf(ref: string): Promise<string | null>
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
  // M09 G4 — 고정한 저장소의 기본 브랜치 이름(origin HEAD를 읽지 못할 때의 두 번째 출처). 모르면 null. 시험의 가짜에는 없을 수 있다.
  defaultBranch?(): Promise<string | null>
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
// cancelled: 실행기 닫기나 화면의 취소로 끝났다(G4 — FAIL로 세지 않고 멈춘다).
export interface WorkResult { ok: boolean; summary: string; cancelled?: boolean }
export interface SessionPort {
  runWork(req: WorkRequest): Promise<WorkResult>
  // 돌고 있는 작업 노드 세션을 멈춘다(화면의 취소). 멈춘 세션이 있었으면 true.
  cancel?(): boolean
}

// 모델 게이트 — 구현 문맥이 없는 세션이 판정한다(G4 실물: reviewSession.ts).
// 입력은 goal 문서와 실행기가 만든 diff뿐이다. 판정을 검수한 트리에 묶는 일은 실행기가 한다(포트는 트리를 돌려주지 않는다).
export interface ReviewRequest {
  milestoneId: string
  node: GateNode
  goal: GoalState | null
  // goal 문서 본문(없으면 null)
  goalDoc: string | null
  // 작업 트리 대 base(마일스톤 브랜치)의 diff 전문
  diff: string
  base: string
}
export interface ReviewPort {
  review(req: ReviewRequest): Promise<{ verdict: 'pass' | 'fail' | 'stop'; evidence: string }>
  cancel?(): boolean
}

export interface Clock { now(): string }

// 앱 영역(작업 저장소 밖)의 실행 상태 다이제스트. repoKey는 작업 저장소 경로의 해시(digestStore.repoKeyOf)다.
// 실행기만 쓴다. 실물은 Electron userData 아래 파일이다(digestStore.createFileDigestStore).
export interface DigestStore {
  read(repoKey: string): Promise<string | null>
  write(repoKey: string, hash: string): Promise<void>
  // 위조 래치 — 한 번 불일치를 본 사유. 걸려 있으면 실행기는 짝이 맞아도 멈춘다. 푸는 길은 사람의 「확인하고 풀기」다(loopDriver).
  readLatch(repoKey: string): Promise<string | null>
  writeLatch(repoKey: string, reason: string): Promise<void>
  // M09 G4 — 사람의 풀기(loopDriver)만 부른다. 래치를 지우고, 상태 파일이 없을 때는 다이제스트도 지운다.
  clearLatch(repoKey: string): Promise<void>
  remove(repoKey: string): Promise<void>
  // 래치 파일의 경로(사유 문구에 싣는다 — 사람이 어디를 볼지 안다). 파일이 아닌 저장소(시험의 가짜)는 없어도 된다.
  latchPath?: (repoKey: string) => string
}

// 실행기 git 설정 대조(configGuard.ts). 바뀌었으면 사유를, 아니면 null을 돌려준다. 한 번 바뀌면 계속 사유를 돌려준다.
export interface ConfigCheck {
  check(): Promise<string | null>
}

export interface LoopPorts {
  command: CommandPort
  git: GitPort
  gh: GhPort
  fs: FsPort
  session: SessionPort
  review: ReviewPort
  clock: Clock
  digest: DigestStore
  // 실물은 openLoop가 붙인다. 시험의 가짜 포트에는 없을 수 있다.
  configGuard?: ConfigCheck
}
