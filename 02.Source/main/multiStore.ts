/**
 * multiStore.ts — 멀티 에이전트 워크스페이스 JSON blob 영속 (순수 모듈)
 *
 * 원본 미러: C:/Dev/AgentCodeGUI/src/main/maStore.ts (L12-28 동형)
 * 저장 경로: userData/multi-agent.json
 *
 * CRITICAL:
 *   - electron을 import하지 않는다 → vitest node 환경에서 직접 테스트 가능.
 *   - 경로를 생성자/함수 인자로 주입 → 임시 파일로 테스트.
 *   - readMulti: version≠2 blob → null (S1 — MULTI_VERSION = 2 고정).
 *   - writeMulti: best-effort try-catch (실패해도 크래시 0).
 *   - validatePanelCwd: isAbsolute + existsSync + isDirectory (B2 신뢰경계).
 *     resolveSafe 미사용 — panel.cwd는 자체 루트인 독립 절대경로.
 *
 * ADR-008: API 키·시크릿 평문 저장 금지 — 이 blob은 워크스페이스 메타만 포함.
 */

import path from 'node:path'
import fs from 'node:fs'
import type { PersistedMultiState, PersistedMultiSession } from '../shared/ipc-contract'

/** 멀티 에이전트 blob의 고정 version 번호 (원본 maStore.ts MULTI_VERSION=2 미러) */
const MULTI_VERSION = 2

/**
 * 멀티 에이전트 워크스페이스 blob을 읽는다.
 *
 * @param filePath 읽을 파일의 절대경로 (app.getPath('userData') 기준 경로를 외부 주입)
 * @returns PersistedMultiState (version=2 검증 통과 시) 또는 null (파일 없음/손상/version 불일치)
 *
 * 원본 maStore.ts readMulti() 동형:
 *   - try-catch: 파일 없음(ENOENT), 파싱 실패 → null (크래시 0)
 *   - version 불일치 → null (S1 - forward-compat graceful)
 */
export function readMulti(filePath: string): PersistedMultiState | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    // version 필드 존재 + MULTI_VERSION(=2) 일치 검증
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      (parsed as { version: unknown }).version !== MULTI_VERSION
    ) {
      return null
    }
    return parsed as PersistedMultiState
  } catch {
    return null
  }
}

/**
 * 멀티 에이전트 워크스페이스 blob을 저장한다.
 *
 * @param filePath 저장할 파일의 절대경로
 * @param data 저장할 PersistedMultiState
 *
 * 원본 maStore.ts writeMulti() 동형:
 *   - mkdirSync recursive: 중간 디렉토리 자동 생성
 *   - try-catch: 쓰기 실패 → 무시 (best-effort, 크래시 0)
 */
export function writeMulti(filePath: string, data: PersistedMultiState): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data))
  } catch {
    /* ignore — best-effort */
  }
}

/**
 * panel.cwd를 신뢰경계에 따라 재검증한다.
 *
 * CRITICAL(신뢰경계 B2):
 *   - blob은 renderer untrusted 입력(또는 hand-edit) — cwd를 무확인 사용 금지.
 *   - isAbsolute: 절대경로만 허용 (상대경로 → undefined).
 *   - existsSync: 실제 존재 확인 (없는 경로 → undefined).
 *   - statSync.isDirectory: 디렉토리만 허용 (파일 → undefined).
 *
 * resolveSafe 미사용 근거:
 *   resolveSafe(root, p)는 루트 하위경로 containment 용이고,
 *   panel.cwd는 자체 루트인 독립 절대경로라 containment 검증 불필요.
 *   동일 패턴: WORKSPACE_OPEN index.ts L316 / ConversationRecord.cwd 자동복원 L799.
 *
 * @param cwd 검증할 경로 (undefined 포함)
 * @returns 유효한 절대 디렉토리 경로 또는 undefined
 */
export function validatePanelCwd(cwd: string | undefined): string | undefined {
  if (!cwd || typeof cwd !== 'string') return undefined
  try {
    if (!path.isAbsolute(cwd)) return undefined
    if (!fs.existsSync(cwd)) return undefined
    if (!fs.statSync(cwd).isDirectory()) return undefined
    return cwd
  } catch {
    return undefined
  }
}

/**
 * multiStore 기본 파일 경로 계산 헬퍼.
 * main/index.ts가 app.getPath('userData')를 전달해 경로를 초기화할 때 사용.
 *
 * @param userData app.getPath('userData') 결과
 * @returns multi-agent.json 절대경로
 */
export function getMultiStorePath(userData: string): string {
  return path.join(userData, 'multi-agent.json')
}

// ── 병합 함수 5종 (ADR-031, RMW1-P03) ──────────────────────────────────────
//
// renderer 분산 RMW(read-modify-write, 읽고-고치고-쓰기)를 main 단일 기록자로
// 이관하는 핵심. 아래 5개 함수는 순수(pure) — fs를 만지지 않고 입력 state를
// 절대 변이(mutate)하지 않으며, 항상 새 state 객체를 반환한다.
// 순수하게 분리해두면 fs mock 없이 단위 테스트가 가능하고, 의미론(누가 이기는지
// 규칙) 변경이 이 파일 안에서만 국소적으로 일어난다.
//
// IPC 핸들러(00_ipc/handlers/multi.ts)는 이 함수들을
// `readMulti → 병합함수 → (ok일 때만) writeMulti` 동기 블록으로 감싸
// "읽기~쓰기 사이 인터리브(끼어들기) 불가"라는 run-to-completion 원자성을 얻는다.

/** 병합 함수 5종의 공통 반환 형태. ok:false는 항상 no-op(상태 불변)을 의미한다. */
export interface MergeResult {
  /** 병합 성공 여부. false면 state는 입력과 동등(no-op) */
  ok: boolean
  /** 병합 후 상태(성공 시) 또는 입력과 동등한 상태(no-op 시) */
  state: PersistedMultiState
}

/**
 * 활성 세션 스냅샷을 upsert(id 일치 시 교체)한다.
 *
 * CRITICAL(의미론 — ADR-031 게이트 확정, phase 문서의 "없으면 추가"를 override):
 *   - **미지 id는 no-op + ok:false** — 삭제된 세션에 대한 뒤늦은(stale) autosave가
 *     세션을 되살리는 것을 차단한다. 정상 경로의 id는 항상 createSession이 발급하므로
 *     매칭 안 되는 id는 stale로 간주해도 안전하다.
 *   - title은 upsert 인자(`Omit<PersistedMultiSession, 'title'>`)에 없다 — 기존 title을
 *     그대로 보존한다. rename만이 title을 바꾼다.
 *   - activeSessionId는 upsert 대상과 무관하게 절대 변경하지 않는다(소유는 create/select
 *     전용 — 저장마다 active를 덮어쓰던 과거 오염 재발 방지).
 *
 * @param state 현재 권위 상태
 * @param session upsert할 세션 스냅샷(title 제외 — count/panels만)
 */
export function upsertSession(
  state: PersistedMultiState,
  session: Omit<PersistedMultiSession, 'title'>
): MergeResult {
  const idx = state.sessions.findIndex((s) => s.id === session.id)
  if (idx === -1) {
    return { ok: false, state }
  }
  const existing = state.sessions[idx]
  const merged: PersistedMultiSession = { ...existing, ...session, title: existing.title }
  const sessions = state.sessions.map((s, i) => (i === idx ? merged : s))
  return { ok: true, state: { ...state, sessions } }
}

/**
 * 새 세션을 append하고 즉시 활성화한다.
 *
 * id 생성은 이 함수의 책임이 아니다 — 호출자(IPC 핸들러)가 crypto.randomUUID 등으로
 * 미리 생성한 완전한 PersistedMultiSession을 전달한다(순수 함수는 비결정 요소를 갖지 않는다).
 *
 * @param state 현재 권위 상태
 * @param newSession append할 완전한 세션 레코드
 */
export function createSession(
  state: PersistedMultiState,
  newSession: PersistedMultiSession
): MergeResult {
  return {
    ok: true,
    state: {
      ...state,
      sessions: [...state.sessions, newSession],
      activeSessionId: newSession.id,
    },
  }
}

/**
 * 세션을 영구 삭제하고 필요 시 활성 세션을 재계산한다.
 *
 * 의미론(현 renderer deleteMultiSession 로직 미러 — 여기서 조용히 바꾸면 P04에서 UI 회귀):
 *   - 미지 id → no-op + ok:false (makeFresh 호출 안 됨).
 *   - 삭제 후 remaining이 비면(마지막 세션 삭제) makeFresh()로 새 세션을 만들어
 *     유일한 세션이자 활성으로 채운다.
 *   - 삭제 대상이 active였다면 remaining[0](남은 첫 세션)이 승계한다("인접" 세션이 아니라
 *     항상 배열의 첫 번째).
 *   - 삭제 대상이 non-active였다면 activeSessionId는 그대로 유지된다.
 *
 * @param state 현재 권위 상태
 * @param id 삭제할 세션 id
 * @param makeFresh remaining이 빌 때 새 세션을 만드는 콜백(id 생성 등 비결정 요소를
 *   외부에서 주입 — 이 함수 자체는 순수하게 유지된다)
 */
export function deleteSession(
  state: PersistedMultiState,
  id: string,
  makeFresh: () => PersistedMultiSession
): MergeResult {
  const exists = state.sessions.some((s) => s.id === id)
  if (!exists) {
    return { ok: false, state }
  }
  const remaining = state.sessions.filter((s) => s.id !== id)
  if (remaining.length === 0) {
    const fresh = makeFresh()
    return { ok: true, state: { ...state, sessions: [fresh], activeSessionId: fresh.id } }
  }
  const activeSessionId = state.activeSessionId === id ? remaining[0].id : state.activeSessionId
  return { ok: true, state: { ...state, sessions: remaining, activeSessionId } }
}

/** rename 시 title 최대 길이(cap) — 초과분은 잘라낸다. */
const RENAME_TITLE_MAX_LENGTH = 200

/**
 * 세션 제목을 변경한다.
 *
 * title은 trim(앞뒤 공백 제거) 후 200자로 cap된다. 미지 id는 no-op + ok:false.
 * "빈 이름 rename" 같은 의미 판단은 거부하지 않는다 — 형태 불량(타입 아님)만 IPC
 * 핸들러 계층에서 걸러지고, 이 함수는 기존 renderer renameMultiSession()의 sanitize
 * 규칙(trim+cap)만 그대로 따른다.
 *
 * @param state 현재 권위 상태
 * @param id 이름 변경할 세션 id
 * @param title 새 제목(trim+cap 적용 전 원본)
 */
export function renameSession(state: PersistedMultiState, id: string, title: string): MergeResult {
  const idx = state.sessions.findIndex((s) => s.id === id)
  if (idx === -1) {
    return { ok: false, state }
  }
  const sanitized = title.trim().slice(0, RENAME_TITLE_MAX_LENGTH)
  const sessions = state.sessions.map((s, i) => (i === idx ? { ...s, title: sanitized } : s))
  return { ok: true, state: { ...state, sessions } }
}

/**
 * 활성 세션을 전환한다.
 *
 * 미지 id는 no-op + ok:false — 존재하지 않는 세션을 활성으로 만들 수 없다.
 *
 * @param state 현재 권위 상태
 * @param id 활성화할 세션 id
 */
export function selectSession(state: PersistedMultiState, id: string): MergeResult {
  const exists = state.sessions.some((s) => s.id === id)
  if (!exists) {
    return { ok: false, state }
  }
  return { ok: true, state: { ...state, activeSessionId: id } }
}
