# 하네스 자체 점검 — 2026-07-11 — scope=all

## TL;DR

- 점검 시점: `HEAD 9bfa55e`, Harness 기준선 34/34 PASS.
- 판정: 🔴 즉시 결함 3개(H1·H2·H4), 🟡 후순위 드리프트 1개(H3), 핵심 정합 축 통과.
- 조치: H1·H2·H4를 테스트 우선으로 봉합했고 Harness 회귀 38/38 및 doctor live를 통과했다.
- 범위 보호: LR4 P02/P03, 제품 코드, `stash@{0}`, `stash@{1}`은 변경하지 않았다.

## reviewer 결과

### H1 — Codex 역할별 실제 쓰기 경계 부재 — 🔴 높음 → 봉합

- 증거: 기존 `.codex/config.toml`은 구현 Worker 5개에 같은 `agentdeck-workspace`를 배정했고, `.codex/harness-doctor.mjs`는 profile 초기화만 검사했다.
- Claude 영향: 공용 역할표가 선언하는 도메인 경계와 Codex 실행 권한의 의미가 달랐다.
- Codex 영향: Worker가 자기 도메인 밖 제품 파일을 쓸 수 있었고 Secretary의 gate·commit 책임도 권한으로 검증되지 않았다.
- 조치: 역할별 permission profile 5개와 공통 read-only 기반을 만들었다. Secretary에는 build/E2E 산출물 `out`·`artifacts`·`test-results`만 추가 허용했다. doctor는 profile 7개 초기화와 저장소·`:tmpdir` 밖 격리 workspace root의 allow/deny 경계 16개를 검사한다.

### H2 — Claude coordinator 위임 도구 누락 — 🔴 높음 → 봉합

- 증거: `.claude/agents/coordinator.md`는 Worker·reviewer 호출을 책임으로 두면서 frontmatter `tools`에 `Agent`가 없었다.
- Claude 영향: coordinator의 핵심 위임 책임을 실행할 수 없었다.
- Codex 영향: Codex coordinator는 별도 custom agent 경로라 직접 장애는 없었지만 정본 대칭이 깨졌다.
- 조치: coordinator에만 `Agent`를 추가하고 구현 Worker 5개에는 `Agent`가 없다는 계약 테스트를 추가했다.

### H4 — Claude 내장 파일 API의 Harness 봉인 우회 — 🔴 높음 → 봉합

- 증거: `.claude/hooks/_lib/shell-policy.mjs`는 알려진 shell 쓰기 명령이나 redirection이 없으면 조기 반환해 `node -e`의 `writeFileSync`·`renameSync`를 놓쳤다.
- Claude 영향: 유지보수 모드 없이 Harness 파일을 바꿀 수 있는 우회가 남았다.
- Codex 영향: Codex adapter에는 이미 유사 방어가 있어 두 엔진의 공용 정책 의미가 달랐다.
- 조치: 실제 node·Deno·PowerShell 실행 segment에서만 embedded write API와 PowerShell cmdlet을 판정한다. Reviewer가 찾은 `createWriteStream`·`truncateSync`, Node `-p/--print`·할당형 옵션, 중첩 `Set-Content`·`Remove-Item`과 `ri/sc` 별칭 우회를 추가 봉합했고, `echo node ...` 설명 텍스트 오탐은 허용했다. 읽기 명령, Claude state, CHANGELOG 예외도 유지했다.

### H3 — Supervisor·Secretary 절차 문서 드리프트 — 🟡 중간 → 후순위

- `CLAUDE.md`와 `AGENTS.md`는 gate·commit을 Secretary 책임으로 두지만 `work-run`, `refactor-sweep`, 일부 Worker 출력과 ADR-010에는 메인 또는 Worker commit 흐름이 남아 있다.
- 우선순위가 명확해 즉시 권한 우회는 아니지만, 실제 workflow가 중간에 차단될 수 있다.
- 다음 Harness 동기화 묶음에서 skill·command·role·ADR을 한 번에 정리한다.

## plan-auditor 결과

- 우선 3건은 H1·H2·H4로 수렴했다. H1은 `permission-boundary`, H4는 Harness 봉인, H2는 역할 실행 가능성 결함이다.
- 수정 범위는 Harness 정본과 Codex adapter로 제한했으며 제품 코드·IPC·backend-contract에는 진입하지 않았다.
- H1은 정적 TOML 검사만으로 완료하지 않고 격리 canary에서 자기 영역 write와 타 영역 deny를 실제 실행하는 조건을 붙였다.
- H3는 유효하지만 범위가 넓어 별도 동기화 작업으로 분리했다.

## 양식 비용 평가

감사 산출물 생성 전 기준으로 측정했다.

- Codex work-pin: 7줄.
- 기존 DONE: 11개, 평균 69줄, 최소 41줄, 최대 165줄.
- 정확한 `## 5단계 보고` 제목: 2개.
- 판정: 대규모 Harness 변경에는 복구 가치가 있으나 작은 작업에 같은 형식을 확장하면 비용이 커진다. 기존 문서는 소급 변환하지 않는다.

## 검증 결과

```text
$ node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs .claude/hooks/_lib/shell-policy.test.mjs .claude/hooks/_lib/done-report-policy.test.mjs
tests 38, pass 38, fail 0

$ node .codex/harness-doctor.mjs --live
STATIC: PASS
LIVE-CANARY: PASS — permission profiles 7/7, boundaries 16/16, hooks 4/4, models 3/3

$ bash -n <각 .claude/hooks/*.sh>
SH_SYNTAX_PASS=10
```

## 결정 권유

- H1·H2·H4: 최종 Reviewer 재현까지 PASS했다. 새 세션에서 실제 custom profile label, Secretary git 동작, Claude coordinator → reviewer smoke를 확인한다.
- H3: 다음 Harness 정합 작업의 첫 항목으로 유지한다.
- push·PR·merge는 별도 사용자 GO 전 실행하지 않는다.
