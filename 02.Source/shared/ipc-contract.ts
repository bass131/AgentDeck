/**
 * ipc-contract.ts — IPC 채널명 상수 + 요청/응답 타입 (단일 진실 공급원, 배럴)
 *
 * CRITICAL (헌법): 채널명 문자열은 이 파일(또는 ipc/ 하위 도메인 파일)에만 존재.
 * main(ipcMain.handle) · renderer(api.*) 모두 여기서 import.
 *
 * 구조:
 *   - 도메인별 계약은 `02.Source/shared/ipc/<도메인>.ts` 에 정의
 *   - 이 파일(배럴)이 모두 re-export → 소비처(121곳) import 경로 변경 0
 *   - IPC_CHANNELS 는 도메인 채널 객체들의 spread 합성 → IpcChannel union 보존
 *
 * 채널 종류:
 *   invoke형 — renderer가 main에 요청, main이 응답 (ipcRenderer.invoke).
 *   event형  — main이 renderer로 단방향 push (ipcMain.emit → ipcRenderer.on).
 *
 * 구현 위치: src/main/00_ipc/ (Phase 04, main-process 에이전트 담당).
 * 이 파일은 *정의/재export*만 — 핸들러 로직 없음.
 */

// ── 외부 타입 re-export (하위 호환 — 소비처가 이 경로로 import) ────────────────
import type { AgentEvent, TokenUsage } from './agent-events'
import type { DiffLine } from './diff-types'

// DiffLine 하위 호환 re-export — 기존 소비처(main/renderer)가 ipc-contract에서
// import하는 경로를 변경하지 않아도 된다.
export type { DiffLine }

// AgentEvent · TokenUsage 하위 호환 re-export
export type { AgentEvent, TokenUsage }

// ── 공통(common) re-export ────────────────────────────────────────────────────
export { BACKEND_LABELS, WORKSPACE_ROOT_ID } from './ipc/common'
export type { BackendId } from './ipc/common'

// ── 도메인별 채널 그룹 import (IPC_CHANNELS 합성용) ──────────────────────────
import { WORKSPACE_CHANNELS } from './ipc/workspace'
import { AGENT_CHANNELS } from './ipc/agent'
import { FS_CHANNELS } from './ipc/fs'
import { CONVERSATION_CHANNELS } from './ipc/conversation'
import { REFERENCE_CHANNELS } from './ipc/reference'
import { GIT_CHANNELS } from './ipc/git'
import { LSP_CHANNELS } from './ipc/lsp'
import { ENGINE_CHANNELS } from './ipc/engine'
import { SETTINGS_CHANNELS } from './ipc/settings'
import { WINDOW_CHANNELS } from './ipc/window'
import { MULTI_CHANNELS } from './ipc/multi'
import { PERSONALIZATION_CHANNELS } from './ipc/personalization'

// ── 도메인별 타입/값 re-export ─────────────────────────────────────────────────
export * from './ipc/workspace'
export * from './ipc/agent'
export * from './ipc/fs'
export * from './ipc/conversation'
export * from './ipc/reference'
export * from './ipc/git'
export * from './ipc/lsp'
export * from './ipc/engine'
export * from './ipc/settings'
export * from './ipc/window'
export * from './ipc/multi'
export * from './ipc/personalization'

// ── IPC_CHANNELS — 도메인 채널 spread 합성 (단일 union 보존) ─────────────────
/**
 * IPC 채널명 상수.
 * preload · main 핸들러 · (필요 시) 테스트가 이 객체에서 import.
 * 문자열 리터럴 직접 사용 금지 — 오타 방지 + 리팩터 안전.
 *
 * as const + spread → 각 채널명이 리터럴 타입으로 보존되어 IpcChannel union이
 * 모든 채널 문자열 리터럴을 포함한다. typecheck로 항상 검증할 것.
 */
export const IPC_CHANNELS = {
  ...WORKSPACE_CHANNELS,
  ...AGENT_CHANNELS,
  ...FS_CHANNELS,
  ...CONVERSATION_CHANNELS,
  ...REFERENCE_CHANNELS,
  ...GIT_CHANNELS,
  ...LSP_CHANNELS,
  ...ENGINE_CHANNELS,
  ...SETTINGS_CHANNELS,
  ...WINDOW_CHANNELS,
  ...MULTI_CHANNELS,
  ...PERSONALIZATION_CHANNELS,
} as const

/** 채널명 리터럴 유니온 타입 (핸들러 등록 타입 안전 보조용) */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
