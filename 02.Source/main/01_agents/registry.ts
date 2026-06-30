/**
 * registry.ts — 백엔드 탐지·선택·전환
 *
 * 엔진 분기는 이 파일에서만 수행한다.
 * 호출부(IPC 핸들러 등)는 getBackend()만 호출하며 구체 엔진 클래스를 모른다.
 *
 * 원칙 (ADR-003):
 *   - 모든 if (id === 'claude-code') 식 분기는 이 파일 안에서만.
 *   - 호출부에 구체 엔진 타입이 노출되지 않는다.
 *   - 새 엔진 추가 시 여기에만 등록하면 된다.
 */

import type { AgentBackend } from './AgentBackend'
import type { BackendId } from '../../shared/ipc-contract'
import { ClaudeCodeBackend } from './ClaudeCodeBackend'
import { CodexBackend } from './CodexBackend'
import { echoBackend } from './EchoBackend'

// ── 싱글턴 인스턴스 ────────────────────────────────────────────────────────────
// 어댑터는 상태가 없으므로(각 run이 독립적) 싱글턴으로 관리.
// 테스트 격리가 필요하면 getBackend()에서 새 인스턴스를 만들도록 변경 가능.

const _backends: Record<BackendId, AgentBackend> = {
  'claude-code': new ClaudeCodeBackend(),
  'codex': new CodexBackend()
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * 백엔드 ID로 AgentBackend 인스턴스를 반환한다.
 *
 * @param id 사용할 백엔드 ID. 미지정 또는 알 수 없는 ID면 'claude-code' 폴백.
 * @returns AgentBackend 인터페이스 구현체 (구체 클래스는 노출하지 않음)
 *
 * 엔진 분기는 이 함수 안에서만 발생한다 (ADR-003).
 */
export function getBackend(id?: BackendId): AgentBackend {
  // e2e 결정론 모드: 환경변수(하네스만 설정, renderer 설정 불가)일 때 echo 백엔드로 대체.
  // 프로덕션 경로엔 영향 없음.
  if (process.env.AGENTDECK_E2E === '1') {
    return echoBackend
  }
  // 엔진 분기: registry 밖에서는 절대 id 비교 금지
  if (id && id in _backends) {
    return _backends[id]
  }
  // 기본 백엔드: claude-code (Track 1 유일 실동작 엔진)
  return _backends['claude-code']
}

/**
 * 등록된 모든 백엔드 목록 반환.
 * 탐지 여부와 관계없이 등록된 모든 어댑터를 반환한다.
 * isAvailable() 호출은 호출부에서 필요 시 직접 수행.
 *
 * @returns AgentBackend 배열 (등록 순서)
 */
export function listBackends(): AgentBackend[] {
  return Object.values(_backends)
}
