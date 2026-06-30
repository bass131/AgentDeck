/**
 * ipc/common.ts — 여러 도메인이 공유하는 기반 타입 (단일 진실 공급원)
 *
 * BackendId · BACKEND_LABELS · WORKSPACE_ROOT_ID 는 agent·conversation·engine·fs 등
 * 여러 도메인이 동시에 사용하므로 여기서 한 번만 정의하고 각 도메인이 import한다.
 * 배럴(ipc-contract.ts)도 이 파일을 re-export한다.
 */

/**
 * 코딩 엔진 백엔드 식별자 (단일 공급원).
 * registry(Phase 03)·IPC 계약·DB 레코드가 공유 → 엔진 추가 시 여기 한 곳만 확장.
 * Track 1은 'claude-code'만 실동작, 'codex'는 Track 2(stub).
 */
export type BackendId = 'claude-code' | 'codex'

/**
 * 백엔드 표시 이름(단일 공급원) — 프로바이더 상태 패널 등 UI 라벨.
 * id→라벨 매핑은 분기 로직이 아닌 표시 메타데이터라 shared 단일 정의.
 * 엔진 추가 시 BackendId 와 함께 여기 한 곳만 확장.
 */
export const BACKEND_LABELS: Record<BackendId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex'
}

/**
 * 워크스페이스 루트의 고정 등록 ID.
 *
 * main 레지스트리에서 ID → 실제 경로 매핑을 관리한다.
 * - 워크스페이스 루트는 항상 이 상수 ID를 가진다.
 * - 레퍼런스 폴더는 main이 'ref-1', 'ref-2'… 형식으로 발급한다(발급 로직은 main 담당).
 *
 * CRITICAL(보안): FsReadRequest.root 는 이 ID 또는 reference.add 가 발급한 ID여야 한다.
 * renderer가 임의 경로 문자열을 root로 주입할 수 없다 — main 레지스트리에 미등록 ID면 not-found.
 */
export const WORKSPACE_ROOT_ID = 'workspace' as const
