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
import type { PersistedMultiState } from '../shared/ipc-contract'

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
