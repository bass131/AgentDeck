---
name: work-run
description: 정의된 미착수 Phase(01.Phases/**/NN-*.md 의 status:pending)를 loop-driven으로 자율 실행한다 — 의존성 정렬 → 도메인 Worker 위임 → reviewer 무조건(깃발) → 회귀 게이트(typecheck/test/build) → Phase별 commit. 버킷 (c)비가역·설계분기·trust-boundary + (b)ui-visual 육안에서만 멈춘다. 사용자가 "남은 Phase 진행 / 이어서 작업 / 미완 Phase 실행 / 트랙 계속 / 다음 phase 가자" 등을 요청하거나, work-pin에 미착수 Phase가 남아 진행을 이어갈 때 사용. /work-plan(분해)의 실행 짝.
argument-hint: "[phase-id 또는 milestone-slug] — 생략 시 현재 work-pin 트랙의 미착수 Phase 전체를 의존성 순서로"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Edit
  - Write
  - Agent
  - Bash(git status*)
  - Bash(git add*)
  - Bash(git commit*)
  - Bash(git log*)
  - Bash(git diff*)
  - Bash(npm run typecheck*)
  - Bash(npm run test*)
  - Bash(npm run lint*)
  - Bash(npm run build*)
---

> **Skill 노트**: `/work-plan`의 *실행 짝*. work-plan이 큰 목표를 Phase로 *분해*(생성)한다면, work-run은 그 미착수 Phase를 loop-driven으로 *실행*(소비)한다. **자동발화 허용**(`disable-model-invocation` 미설정) — 미착수 Phase가 남아 "이어서 진행" 류 요청이 오면 모델이 자동 인지한다. 단 **Step 0 방향 1회 확인** 게이트로 실행 전 멈춘다. push/PR/배포/hook·`.claude` 변경은 `allowed-tools` 미포함 — 도구 레벨에서도 영호 게이트 보존.

loop-driven 운영([`loop-driver.md`](../../policies/loop-driver.md))의 **Phase 실행 프리셋**이다. `refactor-sweep`가 "refactor 프리셋"이듯, work-run은 "Phase 실행 프리셋". 헌법 "운영 모드" + [`work-judge.md`](../../policies/work-judge.md) 3버킷을 그대로 따른다.

> **왜 이 Skill인가**: Phase 정의(목표·완료조건·게이트)는 `/work-plan`에서 이미 모호함을 해결해 둔다. 그런데 그걸 *실행으로 잇는 표준 절차*가 없으면 매번 즉흥적으로 굴러가고, "자율 진행"을 놓쳐 매 스텝 되묻게 된다. 본 Skill이 그 실행 루프를 박제한다.

---

### Step 0. 진입 게이트 — 미착수 Phase 스캔 + 방향 1회 확인

1. `01.Phases/**/*.md` 스캔 → frontmatter `status: pending` Phase 수집. (argument로 특정 phase/milestone 지정 시 그 범위만.)
2. 각 Phase frontmatter에서 `phase`·`grade`·`risk`·`loop_track`·`domain` + 본문 `⏪ 사전 조건` 파싱.
3. 사용자에게 **실행 계획 1회 제시**:
   - 미착수 Phase 목록 (순서 + 등급 + 위험 깃발 + 담당 도메인)
   - 의존성 그래프 (독립=병렬 후보 / 의존=순차)
   - 정지 예정 게이트 (어느 Phase가 (c)/(b)라 멈출지 미리)
4. **"이 순서로 진행할까요?"** — 방향 GO를 받으면 loop 진입. 그 후엔 게이트 전까지 매 스텝 되묻지 않는다.

> work-pin "현재 작업"이 비었거나 `01.Phases/`에 pending이 없으면 → "실행할 Phase가 없어요. `/work-plan`으로 먼저 분해할까요?" 안내 후 종료.

### Step 1. 의존성 정렬 (DAG)

- 각 Phase `⏪ 사전 조건` → 위상 정렬.
- **독립 Phase = 병렬** Worker / **의존 Phase = 순차**. ⚠️ **병렬은 서로 다른 도메인만** — 같은 도메인(예: renderer 2개)을 동시 편집하면 충돌 위험.
- 병렬 시 working tree가 섞이므로, typecheck/test는 각 Worker 완료 후 **전체 합본**으로 재확인(Step 4).

### Step 2. Worker 위임 (도메인별)

각 Phase를 `domain` frontmatter에 맞는 Worker에 위임 ([`subagent-routing.md`](../../policies/subagent-routing.md)): shared-ipc / main-process / agent-backend / renderer / qa.

위임 입력:
- Phase 정의(🎯 목표·📝 작업·✅ 완료조건·⚠️ 함정) + 해당 phase doc 경로(필독).
- 제약: **거동 불변 + 공개 계약(시그니처·IPC·AgentEvent) 불변 + 영역 한정 + `.claude/` 금지 + commit/push 금지(typecheck/test까지만)**.
- 라이브 smoke·e2e·육안은 Worker가 하지 말 것(메인이 게이트로).

> Worker는 *수정만*. commit은 메인이 게이트 통과 후 (헌법 "Worker commit 금지" 정합).

### Step 3. reviewer 게이트 (깃발 무조건)

Worker 완료 후, Phase `risk` 깃발이 있으면 **reviewer 무조건** ([`review-tiering.md`](../../policies/review-tiering.md)):
- `shared-contract` / `trust-boundary` / `backend-contract` → reviewer 필수.
- 무깃발 + (≥10줄 ∧ 등급≥보통) → reviewer 권장.
- ⚠️ 병렬 작업 중이면 reviewer에게 **"다른 Phase 도메인의 미완 변경은 범위 밖"** 명시.
- reviewer 🔴 → **멈추고 보고**(commit 안 함). 🟡 → 기록 후 진행. 🟢 → 다음.

### Step 4. 회귀 게이트 (done 판사 = 기계)

병렬 Phase가 모이면 **전체 1회**: `npm run typecheck`(main+renderer) + `npm run test`(baseline 비감소·신규 fail 0) + (해당 시) `npm run build`.
- green = done 증명 / red = 멈추고 원인 격리·보고.
- 게이트 출력이 트랜스크립트에 남게 실행 (loop-driver §4 — "평가는 트랜스크립트만 본다").

### Step 5. Phase별 atomic commit (메인)

green + reviewer GO면 **Phase별 commit**(Worker 아닌 메인):
- 메시지: phase grade·성격에 맞는 conventional type — `refactor(scope): <한 줄> (RF1 PNN)` 등.
- 본문: 무엇 / 핵심 파일 / 검증(typecheck·test green·reviewer 통과 요지).
- **해당 Phase 영역만 `git add` 명시** — 병렬 중인 다른 Phase 변경이 안 섞이게.

### Step 6. 정지 게이트 (버킷 c/b — 사람)

다음에 닿으면 **멈추고 묶음 보고** (work-judge):
- **(c) 비가역·설계분기·trust-boundary 설계 변경** — push/PR/merge/배포 · IPC 계약 *버전 bump* · JSON 영속 스키마 마이그 · hook/`.claude` 변경(영호 단독) · 설계 분기.
- **(b) ui-visual 육안** — `loop_track: human-visual` Phase(renderer 시각·UI). 코드 분해는 진행, **육안 검증은 영호**(앱 실행).
- **라이브 smoke** — 실 엔진 run·e2e 등 사람 확인분.

### Step 7. work-pin 갱신 + 묶음 보고

- work-pin "루프 상태" + "마지막 갱신" 진행 반영(완료 Phase ✅, commit hash).
- 게이트 도달 또는 전체 완료 시 **묶음 보고**: 완료 Phase(+hash) / reviewer 결과 / 게이트 도달 항목(영호 처리 필요) / 🟡 후속 권고.

---

### Hard rules
1. **방향 1회 확인 후 자율** — Step 0 GO 받으면 게이트 전까지 안 되묻는다(loop-driven 핵심).
2. **Worker는 수정만, commit은 메인** (헌법 정합).
3. **reviewer 무조건(깃발) + 회귀 green만 commit** (done 판사 = 기계, 사람 신뢰 아님).
4. **push/PR/배포/hook·`.claude` 변경 = 영호 게이트** — `allowed-tools` 미포함(도구 레벨 보존).
5. **ui-visual = 육안** — 무인 commit X, 코드 분해까지만.
6. **병렬은 다른 도메인만** — 같은 도메인 동시 편집 회피, typecheck는 합본 재확인.
7. **attended only** — 영호 감독 하 자율. 무인 배치 X.

### 함정
- **병렬 typecheck 오판** — 한 Worker가 typecheck 돌릴 때 다른 Worker 중간상태가 섞여 "사전 에러"로 오인 가능 → 전체 합본으로 최종 확정.
- **의존 Phase 조기 착수** — 사전조건 미충족 Phase를 병렬에 넣으면 double churn → DAG 엄수.
- **reviewer self-pass** — 깃발 Phase는 reviewer 무조건, 자기판단으로 스킵 X.
- **work-pin drift** — 여러 Phase 완료 후 work-pin 갱신 누락하면 다음 세션이 stale 좌표로 시작.
