/**
 * diff-types.ts — DiffLine 공통 타입 (단일 진실 공급원)
 *
 * ipc-contract.ts 와 agent-events.ts 가 동시에 참조하는 타입.
 * 두 파일 간 순환 import 를 방지하기 위해 독립 모듈로 추출.
 *
 * 소비처:
 *   - src/shared/ipc-contract.ts  (FsDiffResponse.lines, GitFileAt.diff)
 *   - src/shared/agent-events.ts  (AgentEventFileChanged.diff)
 *   - src/main/fs/diff.ts         (computeDiff 반환 타입)
 *   - src/main/git.ts             (git diff 반환 타입)
 *   - src/renderer/**             (DiffViewer, DiffViewerPane)
 *
 * 변경 주의: 모든 소비처에 영향 → shared-ipc / main-process / renderer 정합 동반.
 */

/** diff 변경 라인 단위 */
export interface DiffLine {
  /** 라인 종류 */
  kind: 'add' | 'remove' | 'context'
  /** 라인 내용 (줄바꿈 제외) */
  content: string
  /** 원본(스냅샷) 기준 라인 번호 (context/remove일 때) */
  lineOld?: number
  /** 변경 후(워크 트리) 기준 라인 번호 (context/add일 때) */
  lineNew?: number
}
