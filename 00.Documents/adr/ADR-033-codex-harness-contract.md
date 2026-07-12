### ADR-033: Codex Harness 실행 계약 — 권한 프로필·모델 비용 계층·검증 가능한 Hook 유지보수 ⭐

**결정(영호 승인 2026-07-10)**: Claude Harness를 정본으로 보존하면서 Codex 호환 레이어에 다음 실행 계약을 추가한다.

1. **권한 프로필** — root Supervisor는 `:danger-full-access`를 기본으로 사용하고, 점검 역할은 `agentdeck-readonly`, 구현 Worker는 역할별 `agentdeck-main-process`·`agentdeck-agent-backend`·`agentdeck-renderer`·`agentdeck-shared-ipc`·`agentdeck-qa`, secretary는 운영 경로 중심 `agentdeck-operations`를 사용한다. 초기 공통 `agentdeck-workspace`는 역할별 경계를 강제하지 못해 2026-07-11 supersede했다. SubAgent profile은 공통 read-only 기반에서 자기 도메인만 write로 열고 `.env*`와 `secrets/**` 읽기를 거부한다. Secretary는 제품 코드를 read-only로 유지하고 gate 실행에 필요한 `out/**`·`artifacts/**`·`test-results/**`만 산출물 쓰기로 연다. Full Access root의 비밀 파일 금지는 헌법·Hook·execpolicy·사람 게이트로 유지한다. Codex 보호 경로인 `.codex/state/**`는 operations profile에 write 승격하지 않고 secretary가 갱신안을 반환하면 root가 반영한다.
2. **비가역 명령** — project execpolicy rules가 push/PR/merge/release/package/publish를 `prompt`, curl/wget/Invoke-WebRequest를 `forbidden`으로 분류한다. Hook은 이 권한 경계를 대신하지 않는다.
3. **모델 비용 계층** — Codex의 복잡한 판단 역할(coordinator/reviewer/plan-auditor)은 Sol high, 일반 구현과 QA는 Terra medium/high, 명확한 운영 secretary는 Luna low를 기본값으로 둔다. Claude의 Opus/Sonnet 모델명은 그대로 유지하고 정책에는 기본/상향 티어의 의미만 공유한다.
4. **입력 명확성** — `UserPromptSubmit`은 충분→진행, 실측 가능→읽기 전용 확인, 사용자 결정 누락→한 가지 질문의 3분기 reminder만 주입한다. prompt 길이로 차단하거나 원문을 로그에 남기지 않는다.
5. **유지보수와 trust** — Harness는 기본 봉인하되 사용자 승인 세션을 부모 환경 `AGENTDECK_HARNESS_MAINTENANCE=1`로 시작한 경우에만 편집을 허용한다. Hook script SHA-256을 `hooks.json` 명령 인자로 박아 본문 변경이 Hook 정의 변경과 `/hooks` 재신뢰로 이어지게 한다. 누락·불일치 digest는 fail-open no-op하여 신뢰 전환 중 반복 실패 배너를 만들지 않고 doctor가 불일치를 차단한다.
6. **정적/실행 검증 분리** — `harness-doctor`의 role/model/permission/digest/bridge 정적 PASS는 파일 정합만 뜻한다. live canary는 실제 profile 7개 초기화와 저장소·`:tmpdir` 밖 격리 workspace root의 역할별 allow/deny 경계 16개를 검사한다. custom agent 실제 모델·권한 label 적용은 trusted 새 세션의 live acceptance 전까지 PENDING이다.

**이유**: 기존 Codex Hook은 사용자 승인 여부와 root/subagent를 구분하지 못하면서 모든 Harness 편집을 막아 유지보수 자체가 불가능했다. 반대로 Hook만 믿으면 unified exec·web 등 우회 경로를 포괄하지 못한다. permission profile·approval·execpolicy·문서 규율을 겹치고 Hook은 실수 방지에 집중하는 편이 공식 실행 모델과 맞다. 모든 역할을 Sol로 고정하는 대신 판단 난도에 따라 Terra와 Luna를 사용하면 품질이 필요한 축을 보존하면서 토큰 비용을 줄일 수 있다.

**트레이드오프**: root Full Access는 Windows sandbox 초기화 마찰과 Harness 유지보수 전환 비용을 없애지만 OS 수준 deny-read 보호를 포기한다. 이 보호는 SubAgent 최소 권한에 집중하고 root는 문서 규율·Hook·execpolicy·사람 게이트를 따른다. project trust와 새 세션 전에는 permission/rules/model profile이 적용되지 않는다. 현재 호출 표면이 custom agent 타입을 노출하지 않으면 역할별 모델 강제는 degraded mode로 남으며, 이를 성공으로 가장하지 않는다.

**완료조건**: Hook/contract 회귀 전체 PASS, `harness-doctor` STATIC PASS와 LIVE-CANARY PASS(permission profile 7·역할 경계 16·Hook launcher 4·model 3), execpolicy canary(`git push=prompt`, `curl=forbidden`, `git status=no match`), root Full Access live 확인, 새 세션 `/hooks` 재신뢰와 실제 SubAgent model/permission label 확인.

**위험도**: [H] — Harness 권한·모델·Hook 신뢰 계약 변경. 제품 코드·IPC·LR4 P02 변경 없음.

---

### 개정 1 (2026-07-12, HR1 P05 — 영호 승인): 풀 드라이버 전제 철회 → 전담 보조 계약

**철회(supersede)**: 원 결정의 다음 전제를 철회한다 — ① root Supervisor 오케스트레이션과 워커 위임 조직 ② 역할별 Worker permission profile 7종(worker-base·main-process·agent-backend·renderer·shared-ipc·qa·operations) ③ Sol/Terra/Luna 모델 비용 계층(워커 함대 전제). Codex는 **전담 보조**(리뷰·진단·rescue·세컨드 오피니언)로 재정의된다 — ADR-034 3층 구조의 Codex 어댑터. **존치**: execpolicy prompt/forbidden 분류(2항) · Hook digest 재신뢰 체계(5항) · 정적/실행 검증 분리 원칙(6항).

**신규 계약**:

1. **최소권한 root** — root 기본 = `agentdeck-assistant`(`:read-only` + `:tmpdir` write). 개별 쓰기는 승인 승격. rescue는 `agentdeck-rescue`(`02.Source/**`·`99.Others/tests/**` 한정 쓰기 — full-access 아님, 영호 결정)로 명시 기동. 하네스 유지보수 세션은 `AGENTDECK_HARNESS_MAINTENANCE=1` + full-access 명시 기동 — 환경 변수는 훅 봉인만 해제할 뿐 쓰기 권한을 주지 않으므로 권한 전환이 별도로 필요하다 (Sol adversarial 차단 #1 봉합, AGENTS.md §5에 명문화 + 계약 테스트 고정).
2. **시크릿 기계 차단의 실태와 보상 통제** — 실측(2026-07-12, codex-cli 0.144.0, native Windows 11): permission profile의 읽기 deny는 **강제되지 않는다**(쓰기 경계만 강제 — 격리 canary workspace의 synthetic `.env`가 그대로 읽힘). 보상 통제로 훅 pre-tool에 `.env*`·`secrets/` **직접 참조 차단**을 신설한다(유지보수 모드에서도 미해제). **한계 명시(과장 금지)**: 변수 조립·인코딩·경로 간접화·대체 도구·훅 비신뢰(digest 불일치 no-op) 상태로 우회 가능하며, 셸을 거치지 않는 호스트 제공 도구(`view_image` 등)는 PreToolUse 커버리지 밖이다. 0.144.0의 텍스트 읽기는 Bash 경유임을 소스로 확인했고, 도구 표면은 버전에 따라 바뀌므로 버전 변경 시 재실측한다. 따라서 CORE-03의 Codex 검증은 "기계적 예방 가드레일 — 부분 보장"으로만 선언한다(보안 보증 아님).
3. **doctor 3축 보고 + baseline 고정** — `HOOK-GUARD`(차단 canary) / `OS-READ-BOUNDARY: UNENFORCED_EXPECTED`(격리 synthetic marker 재확인) / `LIVE-CONFORMANCE: ACCEPTED_WITH_LIMITATION`. UNENFORCED 판정은 baseline 튜플(cli·platform·rootProfile)에 묶이고, CLI 버전 불일치 시 결과가 같아도 exit 3(`REVALIDATION_REQUIRED`) — 읽기 deny가 강제되기 시작하는 좋은 방향의 드리프트도 계약 재검토를 강제한다 (Sol adversarial 차단 #2 봉합). baseline은 '측정값 기록'이므로 봉인 밖 `00.Documents/harness/codex-baseline.json`이 소유하고 판정 규칙은 doctor(봉인)가 소유한다 — 재실측·갱신은 attended 세션 절차(재실측 → 기록+이력 갱신 → secretary 커밋)로 봉인 해제 없이 수행한다(패치 churn 대처, 2026-07-13).
4. **기계장치 경량화** — custom agent 9→2(reviewer·plan-auditor, 읽기 전용 점검), skill bridge 8→2(agentdeck-review·harness-review), `[agents]` max_depth 2→1·max_threads 6→2. stash 브리지 5종(449줄)은 patch 아카이브(`99.Others/_archive/`) 후 OID(`99704c1b`) 일치 재검증 drop 완료.

**검토 절차**: Codex(Sol) 3턴 설계 논의(2026-07-12) — 합의 설계 채택 + 차단급 2건 지적 → 본 개정에 봉합 반영 후 조건부 ship 판정.

**baseline 재실측 이력**:
- 2026-07-13, codex-cli **0.144.1** — 도입 당일 CLI 패치 업그레이드로 doctor `REVALIDATION_REQUIRED`(exit 3) 첫 실전 발화(설계 의도대로). 격리 canary 재실측 결과 0.144.0과 동일: 읽기 deny **UNENFORCED** 유지 · 쓰기 경계 차단 정상. → baseline 기록 0.144.1 갱신 + 기록을 `codex-baseline.json`으로 외부화(봉인 밖 — 패치 버전 churn 시 봉인 해제 마찰 제거, 영호 결정), 계약 내용 무변경.

**관련**: ADR-034(하네스 3층 구조) · `00.Documents/harness/CORE.md`(CORE-03·11·12) · `core-manifest.json`(CORE-03 codex 항목 동기 갱신) · `00.Documents/reports/HR1-P05-전담보조-최종구성안.html`.
