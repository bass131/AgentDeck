# Architecture Decision Records — AgentDeck (인덱스)

> *왜 이렇게 만드는지*. 각 결정 = 뭘 골랐고 / 왜 / 뭘 포기했는지 3줄. **트레이드오프가 핵심** — AI가 나중에 "X로 바꿀까요?" 제안을 못 하게 못박는다.
>
> **구조(2026-07-12 분리, HR1 P01)**: ADR 본문은 `adr/ADR-NNN-*.md` **1결정 = 1파일**로 분리됐다(개정이 개별 diff로 리뷰되게). 본 파일은 인덱스. 분리 이전 통합본 이력은 git의 본 파일(ADR.md) 이력에 보존. **새 ADR = `adr/`에 파일 추가 + 아래 표에 행 추가.** 제목 뒤 ⭐ = 구조적 중요 결정.

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 001 | 셸 — Electron (Tauri 아님) | ✅ 활성 | [ADR-001-electron-shell.md](adr/ADR-001-electron-shell.md) |
| 002 | UI — React + TypeScript | ✅ 활성 | [ADR-002-react-typescript.md](adr/ADR-002-react-typescript.md) |
| 003 | 엔진 추상화 — Adapter 패턴 (`AgentBackend`) ⭐ | ✅ 활성 | [ADR-003-agent-backend-adapter.md](adr/ADR-003-agent-backend-adapter.md) |
| 004 | Claude Code 연동 — Agent SDK 우선, `claude -p` 폴백 | ⚠️ 부분 superseded — CLI 폴백 무효(ADR-016) | [ADR-004-claude-sdk-first.md](adr/ADR-004-claude-sdk-first.md) |
| 005 | 상태관리 — Zustand | ✅ 활성 | [ADR-005-zustand.md](adr/ADR-005-zustand.md) |
| 006 | 영속화 — better-sqlite3 | ❌ superseded — JSON 파일 영속으로 대체 | [ADR-006-persistence-better-sqlite3.md](adr/ADR-006-persistence-better-sqlite3.md) |
| 007 | 보안 — main 단독 권한 + contextIsolation | ✅ 활성 | [ADR-007-main-only-security.md](adr/ADR-007-main-only-security.md) |
| 008 | API 키 저장 — OS 자격증명 / `.env`(git-ignored) | ✅ 활성 | [ADR-008-api-key-storage.md](adr/ADR-008-api-key-storage.md) |
| 009 | 패키징 — electron-builder(NSIS) + electron-updater | ✅ 활성 | [ADR-009-packaging-electron-builder.md](adr/ADR-009-packaging-electron-builder.md) |
| 010 | 멀티에이전트 개발 분담 — ClaudeDev식 coordinator/worker | ✅ 활성 | [ADR-010-multiagent-coordinator-worker.md](adr/ADR-010-multiagent-coordinator-worker.md) |
| 011 | Phase 실행 — `scripts/execute.py` 헤드리스 순차 **(superseded 2026-06-26: /work:plan + 세션/루프로 대체)** | ❌ superseded — /work:plan + 세션/루프로 대체 | [ADR-011-phase-execution-execute-py.md](adr/ADR-011-phase-execution-execute-py.md) |
| 012 | 코드 인텔리전스 스택 — CodeMirror 6 + react-markdown (M2) | ✅ 활성 | [ADR-012-code-intelligence-stack.md](adr/ADR-012-code-intelligence-stack.md) |
| 013 | 스택 버전 — 원본 AgentCodeGUI와 동일 업그레이드 ⭐ | ✅ 활성 | [ADR-013-stack-versions-upstream-parity.md](adr/ADR-013-stack-versions-upstream-parity.md) |
| 014 | 충실도 1:1 복제 방식 — 원본 클론 레퍼런스 + OKLCH 디자인시스템 ⭐ **(superseded: UI.md Clay HEX로 진화)** | ❌ superseded — UI.md Clay HEX로 진화 | [ADR-014-fidelity-clone-reference.md](adr/ADR-014-fidelity-clone-reference.md) |
| 015 | M3 Git 백엔드 — git CLI `execFile` 직접 (라이브러리 0) ⭐ | ✅ 활성 | [ADR-015-git-cli-execfile.md](adr/ADR-015-git-cli-execfile.md) |
| 016 | Agent SDK 채택 — `claude -p` CLI에서 `@anthropic-ai/claude-agent-sdk`로 전환 ⭐ | ✅ 활성 | [ADR-016-agent-sdk-adoption.md](adr/ADR-016-agent-sdk-adoption.md) |
| 017 | LSP 클라이언트 통합 — typescript-language-server + pyright (번들) + JSON-RPC StdioRpc (M2-LSP) ⭐ | ✅ 활성 | [ADR-017-lsp-integration.md](adr/ADR-017-lsp-integration.md) |
| 018 | 런타임 멀티버전 SDK 설치 + 동적 로드 (엔진 인-앱 업데이트) ⭐ | ✅ 활성 | [ADR-018-sdk-multiversion-dynamic-load.md](adr/ADR-018-sdk-multiversion-dynamic-load.md) |
| 019 | 슬래시 커맨드 동적 캡처 — SDK supportedCommands() 하이브리드 ⭐ | ✅ 활성 | [ADR-019-slash-command-capture.md](adr/ADR-019-slash-command-capture.md) |
| 020 | 대화별 작업폴더(cwd) 앵커링 — 대화가 자기 워크스페이스를 기억 ⭐ | ✅ 활성 | [ADR-020-conversation-cwd-anchoring.md](adr/ADR-020-conversation-cwd-anchoring.md) |
| 021 | 오케스트레이션 결과 복귀 + 진행 표면화 + 채팅 인라인 서브에이전트 ⭐ | ✅ 활성 | [ADR-021-orchestration-result-progress.md](adr/ADR-021-orchestration-result-progress.md) |
| 022 | 앱 레벨 `/loop` — 클라이언트 인터셉트 + renderer 주도 재호출 ⭐ | ✅ 활성 | [ADR-022-app-level-loop.md](adr/ADR-022-app-level-loop.md) |
| 023 | 턴 간 맥락 복구 — `resume` (ADR-016 개정, REPL 전환 Phase 1) ⭐ | ✅ 활성 | [ADR-023-resume-context.md](adr/ADR-023-resume-context.md) |
| 024 | 지속 세션(REPL) — self-re-arm 라이브 세션 + watchdog (내장 `/loop`·크론 자기제어) ✅채택·구현 (기본값 재고 2026-07-01 → 재재고 2026-07-03: replMode 기본 ON·AUTO 세션 수명 → 스코프 이관 2026-07-12: replMode 세션별) | ✅ 활성 | [ADR-024-repl-persistent-session.md](adr/ADR-024-repl-persistent-session.md) |
| 025 | 하네스 보강 (ClaudeDev 참고) — CHANGELOG · advisory 훅 · /refactor-sweep · phase-gate · work-judge 3버킷 ⭐ | 🔄 개정 — ADR-026이 policies 스킵 개정 | [ADR-025-harness-reinforcement.md](adr/ADR-025-harness-reinforcement.md) |
| 026 | 하네스 정식 이식 (ClaudeDev → AgentDeck) — ADR-025 부분 보강을 정식 포트로 확장 ⭐ | ✅ 활성 | [ADR-026-harness-formal-port.md](adr/ADR-026-harness-formal-port.md) |
| 027 | 디렉토리 번호접두 컨벤션 (`NN_name`) — 큰 분류 시각적 순서화 | ✅ 활성 | [ADR-027-dir-number-prefix.md](adr/ADR-027-dir-number-prefix.md) |
| 028 | 루트 디렉토리 재구성 — 번호접두 *최상위* 카테고리 (`00.Documents`·`01.Phases`·`02.Source`·`99.Others`) | ✅ 활성 | [ADR-028-root-restructure.md](adr/ADR-028-root-restructure.md) |
| 029 | 대화 기억 신뢰성 — resume 우선 + transcript 폴백 (모델 컨텍스트 ↔ 채팅 기록 분리) ⭐ | ✅ 활성 | [ADR-029-memory-reliability-fallback.md](adr/ADR-029-memory-reliability-fallback.md) |
| 030 | 권한 요청 UX — 중앙 모달 → 컴포저 위 인라인 카드 (Track-1 충실도 의도적 이탈) ⭐ | ✅ 활성 | [ADR-030-permission-inline-card.md](adr/ADR-030-permission-inline-card.md) |
| 031 | 멀티세션 영속 동시성 — renderer 분산 RMW 폐기, main 명령 기반 이관 (lost-update 구조적 제거) ⭐ | ✅ 활성 | [ADR-031-multi-session-single-writer.md](adr/ADR-031-multi-session-single-writer.md) |
| 032 | UltraCode 상호작용 재설계 — 단발성 폐기(지속 토글) + 키워드 트리거 + Workflow 상시노출·턴별 동적 게이트 | ✅ 활성 | [ADR-032-ultracode-redesign.md](adr/ADR-032-ultracode-redesign.md) |
| 033 | Codex Harness 실행 계약 — 권한 프로필·모델 비용 계층·검증 가능한 Hook 유지보수 ⭐ | ✅ 활성 (개정 예정 — HR1 P05 전담 보조 전환) | [ADR-033-codex-harness-contract.md](adr/ADR-033-codex-harness-contract.md) |
| 034 | 하네스 3층 구조 — 엔진 중립 코어 + 어댑터 + conformance 게이트 ⭐ | ✅ 활성 | [ADR-034-harness-three-layer.md](adr/ADR-034-harness-three-layer.md) |
| 035 | SDK 메시지 → 공통 AgentEvent 정규화 taxonomy (probe-first) ⭐ | ✅ 활성 | [ADR-035-agent-event-taxonomy.md](adr/ADR-035-agent-event-taxonomy.md) |
| 036 | 백그라운드 태스크 tail — 스트림 생명주기 권위 + main 증분 폴링 하이브리드 | ✅ 활성 | [ADR-036-bg-task-tail-hybrid.md](adr/ADR-036-bg-task-tail-hybrid.md) |
| 037 | 하네스 기술 봉인 확장 — 의미 정본 층(harness 코어·ADR) 봉인 | ✅ 활성 | [ADR-037-harness-seal-extension.md](adr/ADR-037-harness-seal-extension.md) |
