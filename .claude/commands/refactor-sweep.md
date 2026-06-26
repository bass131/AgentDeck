---
description: 무인 자동 리팩토링 스윕 — SOLID/거대파일/중복 진단 + 안전 범위 자동 수정 + typecheck/test/lint 회귀 게이트 통과분만 전용 브랜치 atomic commit (push/PR 없음). 자기 전 호출, 다음날 선별 검토.
argument-hint: "[--dry-run] [--max=N] [--domains=shared,main,backend,renderer,qa] - 기본: 전체 무인 / renderer 시각=제안만 / max=8"
---

AgentDeck production 코드(테스트 제외)의 SOLID/거대파일/중복 부합도를 *자는 동안* 진단하고, 안전 게이트를 통과한 리팩토링만 **전용 브랜치에 commit까지** 해두는 슬래시. 다음날 사용자가 commit 이력을 보고 살림/재논의/폐기로 선별. (ClaudeDev `/refactor-sweep`의 AgentDeck/TypeScript 적응.) 진단 백로그 원천 = `docs/HARNESS_GAP.md`·거대파일 서베이.

모드/범위: **$ARGUMENTS** (없으면 `--domains=shared,main,backend,renderer,qa --max=8`, commit 모드)

> ⚠️ **이 슬래시는 코드를 *수정하고 commit*한다** (`/review`는 읽기 전용). 무인 commit의 안전은 **로컬 commit까지만 + 회귀 게이트 + 전용 브랜치 + 다음날 선별 revert**에 달려 있다. push/PR은 *언제나* 사람 명시 GO(헌법 비가역 게이트).

---

### 핵심 안전 철학 (맨 위에 박는다)
- 무인은 **로컬 commit까지만**. push/`gh pr create`/merge/배포는 *절대* 자동 X (G4).
- **회귀 green인 것만** commit (G1) — `npm run typecheck`(node+web) + `npm run test`(baseline 비감소·신규 fail 0) + `npm run lint`. 통과 못 하면 자동 롤백.
- **전용 브랜치만** 건드림 (G2). 현재 브랜치·main 미접촉.
- **신뢰경계 + ADR-003 엔진 추상화는 영원히 무인 제외** (G7). renderer 시각/CSS는 *육안 검증 불가*라 제안만 (G3).

**언제 호출**: 자기 전 / 리팩토링 백로그가 쌓였을 때 / 마일스톤 사이 정비.
**언제 호출 X**: 코드 변경 후 자동 리뷰 = reviewer(Tier 2-A) / 구조·ADR 점검 = `/review`.

---

### Scope (도메인별 처리)

| 도메인 | 경로 | 무인 commit | Worker |
|---|---|---|---|
| `shared` | `src/shared/**` (단 trust-boundary 계약은 거동 불변만) | ✅ + 🔶 | shared-ipc |
| `main` | `src/main/**` (단 `src/main/00_ipc/**` = ⛔ G7) | ✅ + 🔶 | main-process |
| `backend` | `src/main/01_agents/**` (ADR-003 엔진 경계 신중 — 어댑터 내부 리터럴 이동 X) | ✅ + 🔶 | agent-backend |
| `renderer` | `src/renderer/**` 로직(store/hooks/util) | ✅ + 🔶 / **시각·CSS·JSX 레이아웃 = 📋 제안만(G3)** | renderer |
| `qa` | `tests/**` (테스트 구조 정리·중복 제거) | ✅ + 🔶 | qa |
| **항상 제외** | `src/preload/**`·`src/main/00_ipc/**`·`canUseTool`/권한 경로·`*.config.*`·`*.d.ts`·`.env*`·생성물 | ⛔ | — |

---

### 작업 흐름

#### Step 0. 전제 게이트 + 전용 브랜치 (G2)
메인이 `Bash`로:
1. `git status --porcelain` — **dirty면 즉시 중단**(미커밋 변경 위 작업 금지).
2. 현재 브랜치 기록(`git rev-parse --abbrev-ref HEAD`) — 복귀 좌표.
3. `git checkout -b refactor/auto-YYYYMMDD`(이미 있으면 `-NN` suffix). **이후 모든 commit은 이 브랜치에만**.
4. **baseline 회귀 1회**(아래 "회귀 게이트" 전체) → 빨강이면 *시작 자체 중단*(깨진 baseline 위 리팩 금지). 측정한 `Tests passed` 수를 **baseline**으로 박음.

#### Step 1. 진단 fan-out (병렬) — reviewer×N
도메인별로 `reviewer`를 **병렬 호출**(R-only라 충돌 0 — Agent 동시 호출). reviewer 입력 4항목:
- `range` = `refactor-sweep-YYYYMMDD-{domain}`
- `files` = 그 도메인 production 파일 목록(Glob + 위 "항상 제외" 필터)
- `diff_summary` = `"리팩토링 전 진단 — 변경 없음. SOLID·거대파일·중복·네이밍 부합도 측정. CRITICAL(신뢰경계/ADR-003) 위반 후보도."`
- `grade` = `보통`

결과를 합쳐 **개선 백로그** 생성 + 아래 위험도표로 `✅/🔶/⛔/📋` 라벨 + 우선순위. (백로그 시드 = `phases/RF1-cleanup/` 트랙 C 거대파일·중복.)

#### Step 2. 리팩 위임 — Worker 도메인 직렬
`--dry-run`이면 **스킵 → Step 5**(진단+제안 리포트만).
아니면 **✅ + 🔶** 항목을 `shared` → `main` → `backend` → `renderer` → `qa` 순차로 도메인 Worker에 위임(병렬 X — "어느 변경이 무엇을 깼나" 추적). 위임 입력:
- 작업: 해당 위반 해소 (구체 `file:line`)
- 완료조건: **거동 불변 + 공개 시그니처·IPC 계약 불변 + typecheck green**
- 제외 명시: **⛔ 신뢰경계(preload/ipc handler/canUseTool) + ADR-003 엔진 리터럴 + 📋 renderer 시각 절대 손대지 말 것**
- 🔶 고위험은 **"한 리팩토링 = 한 commit" 단위**
- 출력: commit 메시지 후보(무엇을/파일/왜)

> Worker는 *수정만*. commit은 메인이 Step 3에서(헌법 "Worker commit 금지" 정합).

#### Step 3. 회귀 게이트 + atomic commit (G1·G6)
도메인 한 묶음이 모이면:
1. **회귀 게이트** 1회. **green(typecheck 양쪽 + test baseline 비감소·신규 fail 0 + lint)**이면 **항목별 atomic commit**:
   - 메시지: `refactor(scope): <한 줄> [auto-sweep]`
   - 본문: `무엇 / 파일:줄 / 왜(어떤 위반 해소)` — **다음날 선별·재논의의 입력**이므로 의도 충분히.
2. **red면 이분 격리**: 변경을 반씩 적용→게이트 반복으로 범인 특정 → 통과분만 commit, 범인은 `git restore`(미적용) + 리포트 "실패로 미적용".

#### Step 4. 검증 fan-out (병렬) — reviewer 재점검
변경된 도메인만 reviewer **병렬 재호출**(`diff_summary`=Step 3 commit 요약). "거동 불변 / 새 위반(특히 CRITICAL) 유발 X" 확인.
- **🔶 고위험 변경은 재검증 필수**.
- reviewer 🔴 → 그 commit을 **revert 후보** 표시 + 리포트 강조(우선검토).

#### Step 5. 종합 + 산출물 (commit까지만, G4)
`docs/reviews/YYYY-MM-DD-refactor-sweep.md` Write(아래 스키마). **push/PR 안 함** — "사람 GO 시 push/PR" 명시. 사용자 보고(아래).

---

### 위험도 분류표 (AgentDeck)

> **모든 항목 진단·발견은 함.** 처리 4분류:
> - **✅ 무인 (저위험)** — 거동 불변·가역·국소.
> - **🔶 무인 (고위험)** — 구조 변경. 회귀 게이트 **+ Step 4 reviewer 재검증 필수** + 리포트 강조.
> - **⛔ 영구 제외 (보안/엔진)** — 신뢰경계·ADR-003. 테스트로 못 잡는 구멍 → 영원히 사람 트랙. 제안만.
> - **📋 제안만 (검증 불가)** — renderer 시각/CSS/레이아웃(UI.md 육안). 진단·제안 diff까지.

| 위반 | 처리 |
|---|---|
| 죽은 코드·미사용 export/import·superseded 잔재 제거 | ✅ 무인 |
| 네이밍 일관성·자명 주석 제거·작은 순수 헬퍼 추출(3회+ 중복, 시그니처 동일) | ✅ 무인 |
| RMW/보일러 헬퍼 추출(거동 불변) | ✅ 무인 |
| 거대파일 분할(ipc-contract 도메인 barrel·appStore multi 추출·reducer event-handler 분리·컴포넌트 훅 추출) | 🔶 무인 (재검증 필수) |
| 평행 구현 통합(AppState↔panelSession·applyAgentEvent wrapper·makeInitialState) | 🔶 무인 (재검증 필수) |
| **위치: `src/preload/**`·`src/main/00_ipc/**`·`canUseTool`/권한 경로** | ⛔ 영구 제외 (신뢰경계 G7) |
| **ADR-003: 엔진 고유 리터럴(resume/Cron/Workflow/SDKUserMessage)을 어댑터 밖으로 이동** | ⛔ 영구 제외 (G7) |
| **위치: renderer 시각(.css·JSX 레이아웃·애니메이션)** | 📋 제안만 (UI.md 육안, G3) |

**판정 순서(위치 우선)**: (1) 신뢰경계/ADR-003 위치 → ⛔ (2) renderer 시각 → 📋 (3) 구조변경 → 🔶 무인+재검증 (4) 저위험 → ✅ (5) reviewer 🟡 *진짜 모호* → 📋(다음 라운드).

---

### 회귀 게이트 (실측 baseline)
Bash(Git Bash)에서 한 묶음:
```
1) typecheck: npm run typecheck            # node+web 양쪽 green
2) test:      npm run test                 # Vitest. baseline 비감소 + 신규 fail 0
3) lint:      npm run lint                 # ESLint 0 error
```
- **baseline = 하드코딩 아님**. Step 0가 측정한 `Tests passed`(예: 3619) 기준 **"비감소 + 신규 fail 0"**으로 판정(숫자 drift 견고).
- typecheck는 **양쪽(node+web) 모두** green이어야 통과.

---

### 다음날 검토 — 선별 처리 (핵심 운영 정신)
사용자가 리포트 + `git log refactor/auto-YYYYMMDD`(각 commit에 무엇/파일/왜)를 보고 **3분기 선별**. **commit 이력=변경점 단일 진실, atomic commit=선별 단위.**

| 판단 | 처리 |
|---|---|
| **전체 OK** | 살림 → push/PR은 사람 명시 GO (G4) |
| **전체 NG** | `git checkout <원브랜치> && git branch -D refactor/auto-YYYYMMDD` |
| **일부 NG** ★ | 버리지 말고 선별: OK는 살리고 / 방향 맞고 방식 별로면 *재논의*(commit 메시지가 의도 보존) / 의도 틀림만 `git revert <hash>` |

→ "전체 날림"은 *전체 NG일 때만*.

---

### 산출물 스키마 (`docs/reviews/YYYY-MM-DD-refactor-sweep.md`)
```markdown
# 무인 리팩토링 스윕 — YYYY-MM-DD
## TL;DR
- 브랜치: refactor/auto-YYYYMMDD (출발: <원 브랜치>)
- baseline: test <N>/0 → <M>/0 (비감소 ✅/❌) · typecheck <green> · lint <0>
- 적용: <K> commit (✅<a> / 🔶<b>) / 제안만: <J> / 실패 미적용: <F>
- ⚠️ reviewer 재검증 🔴: <r>건 (우선검토)
## 1. 부합도 (도메인별 🔴N🟡M)
## 2. 적용 commit (# | hash | 도메인 | ✅/🔶 | 한 줄 | 게이트)
## 3. 🔶 고위험 — 우선검토 (commit + 무엇을 어떻게 + reviewer 재검증)
## 4. 제안만 (⛔신뢰경계/ADR-003 · 📋 renderer 시각 — 파일:줄 | 제안 diff | 왜 제외)
## 5. 테스트 (baseline→최종 · typecheck · lint · reviewer 재검증)
## 6. 실패 미적용 (항목 | 사유 | 롤백)
## 7. 선별 가이드 (전체폐기 / 부분 git revert <hash>)
```

---

### 사용자 보고
```
─────────────────────────────────────────
🧹 무인 리팩토링 스윕 완료 — YYYY-MM-DD
─────────────────────────────────────────
브랜치: refactor/auto-YYYYMMDD (출발: <원 브랜치>)
baseline: test <N> → <M> (비감소 ✅) · typecheck green · lint 0
산출물: docs/reviews/YYYY-MM-DD-refactor-sweep.md

✅ 저위험: <a> commit
🔶 고위험: <b> commit  ← 우선 검토 권장
📋 제안만(신뢰경계·ADR-003·renderer 시각): <J>건
❌ 실패 미적용: <F>건
⚠️ reviewer 재검증 🔴: <r>건 (revert 후보)

➡️ 선별: 전체 OK→push(사람 GO) / 일부 NG→git revert <hash> 또는 재논의 / 전체 NG→checkout+branch -D
```

---

### Hard rules (G1~G9)
1. **회귀 green만 commit (G1)** — typecheck 양쪽 + test baseline 비감소·신규 fail 0 + lint. 실패는 항목 롤백 + 리포트.
2. **전용 브랜치만 (G2)** — `refactor/auto-YYYYMMDD`. 현재 브랜치·main 절대 미접촉.
3. **renderer 시각 제안만 (G3)** — UI.md 육안 검증 불가. commit X, 제안 diff까지.
4. **push/PR/배포 절대 금지 (G4)** — 무인은 로컬 commit까지만. 사람 명시 GO.
5. **고위험 무인 시도하되 재검증 필수 (G5)** — 🔶는 Step 4 reviewer 재검증 + 리포트 강조.
6. **atomic commit + 리포트 (G6)** — 항목별 commit(무엇/파일/왜) + 선별 리포트.
7. **신뢰경계 + ADR-003 영구 제외 (G7)** — `src/preload`·`src/main/00_ipc`·`canUseTool`·엔진 리터럴 이동 = 영원히 사람 트랙.
8. **Worker는 수정만, commit은 메인 (G8)** — 헌법 정합.
9. **거동 불변 + 공개 계약(시그니처·IPC·AgentEvent) 불변 (G9)** — 동작·계약 바꾸면 리팩토링 아님(별도 Phase).

---

### 함정
- **TDD 정합** — 리팩토링은 거동 불변이라 *기존 테스트가 안전망*. 테스트 약한 영역(예: reducer 분리·MultiWorkspace)의 큰 리팩토링은 미묘 버그 가능 → 리포트 강조 + 다음날 우선검토 2차망. 필요 시 리팩 *전* characterization 테스트 추가(qa 위임).
- **신뢰경계 우회 금지** — Worker가 ⛔ 영역(preload/ipc/canUseTool)을 "정리"하려 들면 즉시 중단. 신뢰경계는 테스트로 못 잡는 구멍.
- **ADR-003 누수** — 거대 `ClaudeCodeBackend.ts` 분할 시 엔진 리터럴(resume/Cron/streamInput/SDKUserMessage)이 어댑터 밖(shared/공용)으로 새면 위반. 분할은 어댑터 *내부* 모듈로만.
- **self-assessment bias = 고위험 cross-check** — reviewer가 *자기 슬래시로 자기 진단*을 후하게 볼 수 있음. **🔶 고위험 commit 모드 *첫 회차*는 2차 reviewer(또는 Opus) cross-check 1회 권장** — 단독 진단을 무인 commit 유일 게이트로 삼지 말 것.
- **commit 폭주** — `--max=N`(기본 8) 상한. 한 번에 다 갈아엎지 않음.
- **★진단 힌트는 진단 대상 브랜치에서 실측** — Step 0 브랜치 확정 *후* 그 트리에서만 줄수·좌표 측정.

---

### 첫 도입 → 확장 로드맵
| 단계 | 범위 | 무인 commit |
|---|---|---|
| **v0** (권장 첫 1~2회) | `--dry-run`: 전체 진단 + 🔶 제안 diff까지 리포트만 → 사용자가 "AI가 거대파일을 *이렇게* 분리하려는구나" 품질·라벨 육안 확인 | ❌ |
| **v1** | ✅ 저위험만 무인 commit(🔶는 여전히 제안) | ✅ 저위험 |
| **v2** | ✅ + 🔶(재검증 필수). 신뢰경계/ADR-003/renderer 시각은 영구 제안만 | ✅ + 🔶 |
