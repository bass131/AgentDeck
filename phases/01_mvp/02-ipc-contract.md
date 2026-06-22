# Phase 02: ipc-contract

## 목표
main↔renderer 공유 계약(채널명·타입)과 공통 `AgentEvent` 타입이 `src/shared`에 단일 정의되고, preload가 화이트리스트 API만 노출한다. 이후 모든 IPC의 토대.

## 담당 도메인 / 에이전트
shared-ipc. 등급: 보통~복잡.

## 의존 Phase
01.

## 위험 깃발
**trust-boundary** (preload 노출) → reviewer 무조건.

## 변경 대상
- `src/shared/ipc-contract.ts` — 채널명 상수 + 요청/응답 타입
- `src/shared/agent-events.ts` — `AgentEvent` discriminated union (text/tool_call/tool_result/file_changed/done/error)
- `src/preload/index.ts` — `contextBridge.exposeInMainWorld('api', …)` 화이트리스트

## 작업 단계
1. MVP에 필요한 채널 정의: `workspace.open`, `workspace.tree`, `agent.run`(스트리밍 시작), `agent.abort`, `agent.event`(main→renderer 이벤트), `fs.diff`, `conversation.load`, `conversation.save`.
2. `AgentEvent` union을 ARCHITECTURE.md 정의대로 타입화(`any` 금지).
3. preload에서 위 채널만 *필요 최소* 노출(이벤트 구독 helper 포함). `ipcRenderer` 통째 노출 금지.
4. 채널명/타입은 export → main·renderer가 import할 단일 진실 공급원.

## 완료조건 (AC)
- [ ] `npm run typecheck` green (main·renderer 양쪽).
- [ ] 채널명 문자열이 `src/shared`에만 존재(다른 곳 하드코딩 0 — grep 확인).
- [ ] preload가 `ipcRenderer`를 통째 노출하지 않음(화이트리스트만).
- [ ] `AgentEvent`에 `any` 없음.

## 참조
docs/ARCHITECTURE.md(신뢰경계 표·AgentEvent) · CLAUDE.md(IPC 계약 단일화·신뢰경계 CRITICAL) · ADR-003/007.
