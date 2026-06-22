# Phase 04: main-ipc-persistence

## 목표
main 프로세스가 IPC 핸들러를 구현하여 워크스페이스 열기/트리, 에이전트 실행 브릿지(스트리밍), 파일변경 감지+diff, 대화 영속화(sqlite 최소)를 제공한다.

## 담당 도메인 / 에이전트
main-process. 등급: 복잡~대규모 (**대규모면 coordinator 분해 필수** — ipc/persistence/fs+diff 4영역).

## 의존 Phase
02 (계약), 03 (AgentBackend).

## 위험 깃발
**trust-boundary** (renderer 입력 = untrusted **+ API 키 평문 저장 금지 / ADR-008·CLAUDE.md CRITICAL** — persistence가 시크릿을 sqlite/로그에 평문 박지 않는지 reviewer 집중 점검) → reviewer 무조건.

## 변경 대상
- `src/main/ipc/` — Phase 02 계약 채널 핸들러 구현
- `src/main/persistence/` — better-sqlite3: 대화/메시지 저장·복구(최소 스키마) + 마이그레이션
- `src/main/fs/` — 워크스페이스 트리 + watcher + diff(작업트리 vs 스냅샷)
- `tests/main/` — 핸들러 단위 테스트(happy/invalid/권한)

## 작업 단계
1. `workspace.open`/`workspace.tree` 핸들러: 경로 정규화 + 탈출 방지(untrusted). 트리 반환.
2. `agent.run`/`agent.abort`: registry로 백엔드 선택 → `AgentBackend.start()` → `AgentEvent`를 `agent.event` 채널로 renderer에 스트리밍. abort 연결.
3. `fs.diff`: 변경 파일 diff 계산. 에이전트 `file_changed` 이벤트와 대조해 "AI가 건드린 파일" 표시 데이터.
4. persistence: 대화/메시지 테이블(최소). `conversation.save`/`conversation.load`. API 키 등 시크릿 저장 금지.
5. TDD: 핸들러별 happy/invalid input/권한 위반 테스트.

## 완료조건 (AC)
- [ ] `npm run typecheck` green.
- [ ] 핸들러 단위 테스트 PASS (각 핸들러 invalid 입력 케이스 포함).
- [ ] 채널명은 shared에서 import(하드코딩 0).
- [ ] sqlite에 시크릿 평문 저장 없음.
- [ ] 경로 탈출(`../`) 입력이 거부됨 — 테스트.

## 참조
docs/ARCHITECTURE.md(데이터흐름·신뢰경계 표) · ADR-006/007/008 · CLAUDE.md(신뢰경계·키·IPC CRITICAL).
