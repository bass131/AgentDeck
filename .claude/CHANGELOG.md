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
| 2026-06-27 | **ADR-027 박제 — 디렉토리 번호접두 컨벤션 `NN_name` (RF1 P04)** — 일부 하위폴더에 언더바 번호접두 도입(구분자=`_`·촘촘 `00,01,02`·논리/데이터흐름 순). 범위=`components/`+`src/main` 내부 모듈+`docs/`, **최상위 `src/{main,preload,renderer,shared}` 제외**(electron-vite 진입점·alias 고정). 불변: agent 글롭 `/**`·alias·신뢰경계. ⚠️ hook 리터럴(`risk-detector` `*src/main/ipc/*`)은 글롭과 달리 rename에 안 안전 → P07 동반 갱신. 영호 GO. 구현=트랙 B(P05~08). 브랜치 `chore/rf1-restructure`. | [L] |
| 2026-06-27 | **RF1-cleanup 정리 마일스톤 시작 + REPL docs-drift 정정 (Phase 15)** — `/work:plan`으로 RF1-cleanup(위생·번호접두 구조·거대파일 14+1 Phase, 독립 RF 트랙) 생성 + plan-auditor 봉합. **Phase 15: ADR-024(지속세션 REPL) status 드리프트 정정** — 헤더가 "제안·미승인"인데 *본문*(line 208 "✅승인(사용자 GO)")·*코드*(`appStore.ts:576 replMode:true` 기본활성)·*커밋*(`46ae0a4` "사용자 결정: REPL 기본 모드"·`d62fc88` watchdog 드롭)이 전부 "채택·구현" → stale 헤더/status를 ✅채택·구현으로 정합(`ADR-024`·`CLAUDE.md` 문서지도·`REPL_TRANSITION.md` 헤더 3곳). **결정 자체 불변 — stale 헤더만 보정**(거버넌스 갭 아님; 4 서브에이전트 실측+커밋으로 승인 확인). 트랙 A: P01(lock gitignore 추적해제)·P02(프로브 14개 실측→전부 STALE→삭제, gitignored 무영향). 브랜치 `chore/rf1-hygiene`(미push — 인간 게이트). | [M] |
| 2026-06-27 | **하네스 정식 이식 (ClaudeDev→AgentDeck, ADR-026) — ADR-025 policies 스킵 개정** — `docs/HARNESS_PORT_MANIFEST.md`(외부 무편향 재결정) 단일 진실원, `HARNESS_GAP.md`(자기편향 진단) supersede→삭제. ① **`.claude/policies/` 10개 신설**(ADR-025 H5 "스킵" 개정 — 헌법 슬림 350임계 + INDEX 카탈로그, `_routing`=빠른 매핑/policies=상세 정책 분담): reporting-format·pin-and-done·doc-thresholds·grade-and-risk·subagent-routing·review-tiering·pr-and-merge-gate·loop-driver·work-judge·review-throughput. ② 훅 8종(`pin-injector`·`convention-size-guard` 신규 + settings 배선). ③ 위험깃발 +`backend-contract`·`shared-contract`·`ui-visual`(risk-detector가 옛 shared-discipline 흡수). ④ Phase 시스템 `/work:plan`+템플릿 3(done-md·pin·phase) — `scripts/execute.py` 폐기. ⑤ 커맨드 session/{start,end,review}·harness-review·`_escalation` 신규, `/harness` work:plan 정합. ⑥ 솔로 정합(§5.5: 팀언어 제거·admin-bypass 휴면·unity-bridge N/A). ⑦ 곁(C-동결 해제, 영호 지시): phases 37개 이력 삭제·`UI_GUIDE`+`UI_FIDELITY`→`docs/UI.md`(실측 Clay HEX)·docs 드리프트(sqlite→JSON)·baseline(CustomGUI_Agent→AgentDeck) 수정. 스킵(D): knowledge·`/engine:goal`·`/cross-review`·setup. 회귀 green(typecheck+test 3619). 브랜치 `chore/harness-port`(미push — 인간 게이트). | [H] |
| 2026-06-26 | **자율 루프 반복 #1 — 하네스/docs 드리프트 정정 + lint 게이트 복구 + README 정리** — ① 에이전트 정의(main-process·agent-backend·_routing·reviewer·shared-ipc)·FEATURE_MAP의 구식 표현 정정: sqlite→JSON 영속(ADR-006)·`claude -p` CLI→SDK query()(ADR-016)·LSP 예정→완료(ADR-017)·깨진 `REPLICA_GAP` 링크→archive·settings.json $comment(6훅 명시·"deny 차단"→규범 게이트)·CLAUDE.md 문서지도 CHANGELOG 포인터·backend-contract ADR-003 참조강화. ② lint: `eslint-plugin-react-hooks` devDep 복구(코드가 이미 disable 주석으로 가정하던 룰 — 신규 스택 결정 아닌 *복구*) → 36 errors→0(거동불변·3619 green, Opus 2 독립검수 통과). ③ README: AgentCodeGUI 언급·링크·"완전 복제" 클론 프레이밍 제거(단독 서술, 사용자 디렉티브). 보류: settings allow 확대(refactor-sweep용 `git checkout -b`/`restore`)=권한 확대라 사용자 게이트. | [L] |
| 2026-06-26 | **ADR-025 하네스 보강 박제 + H4/H6 적용** — UltraCode 심층감사(4 병렬+합성) 후: ADR-025 신설(보강 결정·port/skip 근거) + `phase-gate-validator` 훅(완료보고 5단계, advisory, H4) + work-judge 3버킷(기계/육안/비가역 → `_routing.md`, H6). **H5 별도 정책파일 스킵**(_routing.md가 이미 단일정의 — 중복 방지). settings.json 훅 6종. deny 작업 후 복원. | [L] |
| 2026-06-26 | **대규모 정리 STAGE0 + 거대파일 감사** — `out/`·`*.tsbuildinfo`·`artifacts/*.html\|png` 삭제(git 미추적, ~10M+). 합성이 정리 오판 정정: `composerSampleData`·`f14SampleData`·`run-args.ts`=keep(실측 참조). 거대파일은 refactor-sweep 진단 보류. 드라이버=`docs/HARNESS_GAP.md`. | [L] |
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
