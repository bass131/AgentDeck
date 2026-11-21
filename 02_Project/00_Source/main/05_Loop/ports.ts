// 실행기가 바깥 세계를 만지는 포트. 실물은 realPorts/(명령·git·gh·fs), digestStore.ts(앱 쪽 다이제스트), workSession.ts다.
// 모든 경로는 작업 저장소 뿌리 기준의 상대 경로이고 구분자는 / 다.
//
// - `.agentdeck/`는 작업 저장소의 `.git/info/exclude`로 추적 밖이다(openLoop가 시작할 때 더한다). 그래서 commitAll·hasChanges·
//   diffStat에 실리지 않는다.
// - 상태 파일 위조의 겹은 둘이다. 루프 잠금 노드(04_Claude/permission/loopLock.ts)가 편집 도구와 순진한 Bash 편집을 잡고,
//   앱 쪽 다이제스트(DigestStore)가 실행기가 쓴 정규 JSON의 sha256을 작업 저장소 밖에 적어 읽을 때 다르면 멈춘다.
//   다이제스트는 편집 도구와 순진한 Bash 편집을 잡는 겹이다 — 키 없는 해시라 세션이 앱 영역에 쓰면 맞출 수 있다(보증이 아니다).
//   한 번 불일치를 보면 위조 래치(DigestStore.writeLatch + 실행기 메모리)가 걸려, 사람이 풀기 전까지 짝이 맞아도 멈춘다.
// - 실행기 git(자격 있음)은 세션이 심은 설정 코드를 돌릴 수 있다. 그래서 열 때 git 설정 스냅숏을 앱 영역에 적고 실행기의 모든
//   git·gh 호출 직전에 대조한다(configGuard.ts). 실행기는 단계 앞뒤로 ConfigCheck를 보고, 바뀌었으면 래치를 걸고 멈춘다.
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
// diff가 상한(REVIEW_DIFF_LIMIT)을 넘으면 잘린 diff를 주지 않는다. tooLarge: true, diff는 빈 글, chars는 전체 길이다.
// 실행기는 그때 검수를 열지 않고 멈춘다(fail-closed — 잘린 diff로 낸 pass가 전체 트리에 묶이지 않게).
interface ReviewSnapshot {tree: string; diff: string; tooLarge?: boolean; chars?: number }

// 브랜치 이름 인자(ref)는 실물에서 `refs/heads/<이름>`으로 읽는다(같은 이름의 태그가 가리지 못한다).
// 40·64자리 16진수는 커밋 SHA로 그대로 읽는다. diffStat·reviewSnapshot의 base는 실행기가 쥔 goal 시작 SHA다.
export interface GitPort {
  branchExists(name: string): Promise<boolean>
  // from에서 name 브랜치를 만든다(옮겨 가지는 않는다).
  createBranch(name: string, from: string): Promise<void>
  checkout(name: string): Promise<void>
  // 체크아웃된 브랜치 이름. 분리된 HEAD면 null. 시험의 가짜에는 없을 수 있다.
  currentBranch?(): Promise<string | null>
  headSha(ref: string): Promise<string | null>
  // 커밋 안 된 변경이 있는가(untracked 포함).
  hasChanges(): Promise<boolean>
  // 지금 브랜치에 변경 전부를 커밋하고 새 머리 SHA를 돌려준다.
  commitAll(message: string): Promise<string>
  // sha를 주면 그 커밋을 원격 branch로 push한다(`<sha>:refs/heads/<branch>` — 트리를 본 그 커밋만 나간다).
  push(branch: string, sha?: string): Promise<void>
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
  // 같은가. 같으면 null, 아니면 사유. 작업 노드가 commit-tree로 부모만 맞춘 위조 병합 커밋을 실행기가 push하지 않게 한다.
  verifyMerge(commit: string, first: string, second: string): Promise<string | null>
  // 작업 트리(커밋 안 된 변경과 untracked 파일 포함)와 base의 차이. rename은 옛 경로와 새 경로를 둘 다 낸다.
  // 줄 수를 모르는 파일(바이너리)은 added·removed를 null로 낸다. 얻지 못하면 null(등급은 강이 된다).
  diffStat(base: string): Promise<FileChange[] | null>
  // 작업 트리 전체(untracked 포함, 무시 목록 제외)를 임시 인덱스에 올린 트리 해시. 진짜 인덱스는 바꾸지 않는다. 얻지 못하면 null.
  worktreeTree(): Promise<string | null>
  // 같은 임시 인덱스의 트리 해시와 base 대비 diff 전문. base가 없거나 얻지 못하면 null.
  reviewSnapshot(base: string): Promise<ReviewSnapshot | null>
  // 커밋(ref)의 트리 해시. 없으면 null.
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
  // 고정한 저장소의 기본 브랜치 이름(origin HEAD를 읽지 못할 때의 두 번째 출처). 모르면 null. 시험의 가짜에는 없을 수 있다.
  defaultBranch?(): Promise<string | null>
}

export interface FsPort {
  read(rel: string): Promise<string | null>
  write(rel: string, text: string): Promise<void>
  // 폴더 바로 아래의 파일 이름들. 폴더가 없으면 빈 배열.
  list(relDir: string): Promise<string[]>
  // 끝난 실행의 보관이 쓴다. 파일이나 폴더가 있는가 / 이름 바꾸기(대상 폴더를 만들고, 대상이 있으면 덮어쓰지 않고 실패한다).
  exists(rel: string): Promise<boolean>
  move(fromRel: string, toRel: string): Promise<void>
}

// 작업 노드 하나의 의뢰. 세션에는 노드의 지시와 생존 문서만 준다(마일스톤 스펙).
// visit: 이 노드 방문의 키(마일스톤 id와 검증 줄 수 — 기다리는 동안은 줄이 늘지 않아 같다)와, 사람 반려가 이 노드로 되돌렸으면
// 그 줄의 문장(rejected). 메인 대화 포트가 시작 턴을 한 번만 넣고 반려 사유 턴을 고르는 데 쓴다. 실행기가 상태에서 만든다.
// failed: 메인 노드의 마지막 줄이 그 노드의 FAIL이면 그 문장. 다시 도는 세션의 프롬프트에 싣는다.
export interface WorkRequest {
  milestoneId: string
  node: WorkNode
  goal: GoalState | null
  docs: Partial<Record<DocKind, string | null>>
  visit?: { key: string; rejected: string | null; failed?: string | null }
}
// cancelled: 실행기 닫기나 화면의 취소로 끝났다(FAIL로 세지 않고 멈춘다).
// waiting: 메인 노드(role main)의 여러 턴 대화가 아직 끝나지 않았다(사람을 기다린다). 실행기는 판정도 줄도 남기지 않는다 —
//   메인 노드에만 받고, 작업자 노드가 돌려주면 FAIL이다. baseline: 메인 대화 포트가 그 방문을 연 때의 스펙 sha256(없었으면 null).
//   있으면 「이번에 스펙이 바뀌었나」를 실행기가 지금 스펙과 그것으로 대조한다(재기동 뒤 다시 읽은 본문이 기준이 되지 않게).
export interface WorkResult { ok: boolean; summary: string; cancelled?: boolean; waiting?: boolean; baseline?: { specSha256: string | null } }
export interface SessionPort {
  runWork(req: WorkRequest): Promise<WorkResult>
  // 돌고 있는 작업 노드 세션을 멈춘다(화면의 취소). 멈춘 세션이 있었으면 true.
  cancel?(): boolean
}

// 모델 게이트 — 구현 문맥이 없는 세션이 판정한다(실물: reviewSession.ts).
// 입력은 goal 문서와 실행기가 만든 diff뿐이다. 판정을 검수한 트리에 묶는 일은 실행기가 한다(포트는 트리를 돌려주지 않는다).
export interface ReviewRequest {
  milestoneId: string
  node: GateNode
  goal: GoalState | null
  // goal 문서 본문(없으면 null)
  goalDoc: string | null
  // 작업 트리 대 goal 시작 커밋(baseSha)의 diff 전문
  diff: string
  // 마일스톤 브랜치 이름(프롬프트에 보이는 설명일 뿐 — diff의 기준은 baseSha다)
  base: string
  // 실행기가 상태에 쥔 goal 시작 SHA
  baseSha: string
}
export interface ReviewPort {
  review(req: ReviewRequest): Promise<{ verdict: 'pass' | 'fail' | 'stop'; evidence: string }>
  cancel?(): boolean
}

export interface Clock { now(): string }

// 앱 영역(작업 저장소 밖)의 실행 상태 다이제스트. repoKey는 작업 저장소 경로의 해시(digestStore.repoKeyOf)다.
// 실행기만 쓴다. 실물은 Electron userData 아래 파일이다(digestStore.createFileDigestStore).
// 사본(writeCopy·readCopy): 실행기가 쓴 상태 본문을 그대로 앱 영역에 둔다. 쓰는 순서는 사본 → 상태 파일 → 다이제스트다.
// 사람이 상태 위조 래치를 풀면 구동자는 위조본을 받지 않고 이 사본으로 상태 파일을 되돌린다.
export interface DigestStore {
  writeCopy(repoKey: string, text: string): Promise<void>
  readCopy(repoKey: string): Promise<string | null>
  read(repoKey: string): Promise<string | null>
  write(repoKey: string, hash: string): Promise<void>
  // 위조 래치 — 한 번 불일치를 본 사유. 걸려 있으면 실행기는 짝이 맞아도 멈춘다. 푸는 길은 사람의 「확인하고 풀기」다(loopDriver).
  readLatch(repoKey: string): Promise<string | null>
  writeLatch(repoKey: string, reason: string): Promise<void>
  // 사람의 풀기(loopDriver)만 부른다. 래치를 지우고, 상태 파일이 없을 때는 다이제스트도 지운다.
  clearLatch(repoKey: string): Promise<void>
  remove(repoKey: string): Promise<void>
  // 래치 파일의 경로(사유 문구에 싣는다 — 사람이 어디를 볼지 안다). 파일이 아닌 저장소(시험의 가짜)는 없어도 된다.
  latchPath?: (repoKey: string) => string
}

// 실행기 git 설정 대조(configGuard.ts). 바뀌었으면 사유를, 아니면 null을 돌려준다. 한 번 바뀌면 계속 사유를 돌려준다.
export interface ConfigCheck {
  check(): Promise<string | null>
}

// 사람을 부르는 Windows 알림(실물: realPorts/notifyPort.ts의 Electron Notification). onClick은 사람이 알림을 눌렀을 때 한 번 불린다.
// 실행기 포트가 아니라 알림 판정자(loopNotifier.ts)가 쓴다.
export interface NotifyRequest { title: string; body: string; onClick: () => void }
export interface NotifyPort {
  show(n: NotifyRequest): void
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
