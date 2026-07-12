### ADR-006: 영속화 — better-sqlite3
**결정**: 대화/diff/draft는 better-sqlite3(동기 API, main 프로세스).
**이유**: 임베디드·트랜잭션·쿼리 가능, 파일 한 개. AgentCodeGUI의 "대화/변경 영속화" 요구 충족.
**트레이드오프**: 네이티브 모듈이라 electron-rebuild/abi 관리 필요. JSON 파일 대비 운영비용 ↑이나 쿼리·복구 능력이 그만한 값.
**현황(2026-06-26, superseded)**: 약점보강 트랙에서 **better-sqlite3 전면 제거 → JSON 파일 fan-out 영속화로 통일**(원본 AgentCodeGUI `maStore.ts`/`chats.ts` 1:1, Claude Code도 per-session JSONL — 둘 다 DB 미사용). 근거: sqlite가 이 규모엔 과하고 네이티브 ABI 마찰(rebuild·잠금)만 유발. 현재 `src/main/persistence/store.ts` + `multiStore.ts`(JSON), package.json·src에서 better-sqlite3 0. ADR-006의 'better-sqlite3' 결정은 superseded(원천 기록으로 보존). ABI 관리 명령(rebuild:native 등)·predev/pretest rebuild 훅도 소멸.

