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
