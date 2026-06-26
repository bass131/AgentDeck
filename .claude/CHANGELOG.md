# CHANGELOG — 헌법·ADR·하네스·공유계약 변경 이력

> **역할**: 헌법(`CLAUDE.md`)/ADR/하네스(`.claude/**`)/공유계약(`src/shared/**`)을 바꿀 때마다
> 한 줄 박제. **compact·세션 경계에서 "옛 결정 기반으로 작업하는 사고"를 예방**(솔로+AI 맥락 —
> ClaudeDev의 "팀원 매일 열람"을 세션 기억으로 적응). 코드 기능 변경은 git log가 진실원 — 여기엔
> **결정/계약/하네스** 변경만.
>
> **갱신 규칙**:
> - 변경 commit 직후 한 줄 추가(최신이 위).
> - 형식: `YYYY-MM-DD — 한 줄 요약 (영향 범위 / 위험도)`
> - 위험도: `[L]` 저위험(추가만) / `[M]` 중간(행동·계약 변경) / `[H]` 고위험(결정 뒤집기·헌법 수정)
> - `[H]`는 별도 사용자 확인 권장.

## 위험도 짧게
- **[L]** — 새 커맨드·새 서브에이전트·새 ADR 박제(기존 결정 불변)·새 공유 *추가* 필드(옵셔널).
- **[M]** — 커맨드 동작 변경·기존 ADR 보강·공유 계약 *행동* 변경·하네스 게이트 변경.
- **[H]** — 헌법 절대 원칙 수정·기존 ADR 뒤집기·권한/영역 경계 변경.

---

## 이력 (최신이 위)

| 날짜 | 변경 | 위험도 |
|------|------|--------|
| 2026-06-26 | **하네스 보강 H1+H2 적용 (ClaudeDev 참고)** — CHANGELOG 신설 + risk-detector(PreToolUse 4깃발 검출)/reviewer-auto-trigger(PostToolUse 경계파일) 훅 등록(H1) + `/refactor-sweep` 커맨드 — TS 적응, 신뢰경계/ADR-003 영구제외·회귀 baseline·push금지·v0 dry-run(H2). `.claude/**` deny는 작업 후 **복원**. 드라이버=`docs/HARNESS_GAP.md`. H3(5단계 DONE)은 보류. | [L] |
| 2026-06-26 | **ADR-024 (4) 분리·확정** — (4a) app-close `closeAll`(끄면 세션 사망, 좀비0) 구현 + **(4b) watchdog auto-revive 드롭**(사용자: "끄면 죽어야". 복원=다음 프롬프트 resume). `before-quit→disposeAllRuns→RunManager.closeAll`. | [M] |
| 2026-06-26 | **컨텍스트 게이지 영속 + 마지막 대화 자동복원 + 텍스트 선택** — 단일챗 `ConversationRecord`에 `lastContextWindow`/`lastUsage` 추가(공유 계약 *추가*). `conversation.lastActiveId` pref로 재시작 시 자동복원. `setPref` 방어 가드. body `user-select:none` 위 채팅 본문 재활성화. | [L] |
| 2026-06-26 | **ADR-024 지속세션(REPL) self-re-arm + watchdog 승인·구현** — query()-per-message → held-open streaming-input 세션. `persistent`/`sessionKey` 공유 계약 추가. 내장 `/loop` 크론 자율 발동. 단발 경로 옵트인 회귀0. (3)interrupt IPC·(5)렌더러 UI 포함. | [M] |
| 2026-06-26 | **ADR-023 Phase 1·1.5 맥락 resume** — system/init `session_id` 캡처 → 중립 `session` 이벤트 → 영속(`ConversationRecord.sessionId`) → 다음 턴 `resume` 옵션. 앱 재시작 후 맥락 복원. `resume` 리터럴은 어댑터 내부(ADR-003). | [M] |
| 2026-06-26 | **ADR-021 오케스트레이션 결과복귀 + 진행표면화 + 인라인 서브에이전트** — Workflow fire-and-watch 결과가 메인 복귀(run 생명주기 done 병합). `task_*` → 중립 `orchestration_progress`. 채팅 인라인 서브에이전트 카드. | [M] |
| 2026-06-24 | **ADR-017 LSP 채택·구현(M2-LSP)** — typescript-language-server + pyright 번들, hover/definition/semanticTokens. 자식프로세스=main 단독(신뢰경계). | [M] |
| 2026-06-24 | **ADR-016 엔진 SDK 전환 완료(Phase 21)** — `claude -p` CLI spawn/taskkill 전면 제거 → `@anthropic-ai/claude-agent-sdk` `query()` 단일. 폴백 없음(SDK 하드 의존). 엔진 고유 리터럴은 `ClaudeCodeBackend`/`claude-stream` 내부(ADR-003). | [H] |
| 2026-06-24 | **ADR-006 supersede — sqlite 제거, JSON 파일 영속** — better-sqlite3 → `src/main/persistence`+`multiStore`(원본 maStore 미러). 네이티브 ABI 마찰 0. | [M] |
| 2026-06-22 | **하네스 v1 — 8 서브에이전트 + 3 훅(ADR-010)** — coordinator/reviewer/plan-auditor + 5 worker(main-process/agent-backend/renderer/shared-ipc/qa). 훅: dangerous-cmd-guard·tdd-guard·circuit-breaker. 등급(단순/보통/복잡/대규모) + 깃발. | [M] |
