# SubAgent Routing — 10개 역할 라우팅 + 자동 호출 + 에스컬레이션

> **헌법 참조**: 본 정책은 헌법(`../../CLAUDE.md`) "SubAgent 풀" 섹션에서 링크됩니다.
> 충돌 시 헌법이 이깁니다.

> **강제 출처 범례** (HR2 P06, 2026-07-25) — 규칙 옆 라벨은 **무엇이 그 규칙을 지키게 하는가**를 뜻합니다.
> `[기계: X]` = X가 **차단**한다(훅 `exit 2` 또는 `permissions`의 deny/ask) ·
> `[알림: X]` = X가 **환기만** 한다(advisory `exit 0` — 무시해도 그대로 진행된다) ·
> `[문서 규범]` = 훅에도 `permissions`에도 **없다**.
> ⚠️ `[문서 규범]`은 "기계가 안 받쳐주니 지워도 되는 문구"가 아니라 **그것이 유일한 방어선**이라는 뜻입니다.
> 전수 지도·판정 근거 = [`06-enforcement-labeling.md`](../../01_Phases/21_HR2-opus5-renewal/06-enforcement-labeling.md).

본 문서는 10개 역할의 *라우팅 룰*과 *자동 호출 트리거*, *에스컬레이션*(기본 티어 2회 실패 → 상향 티어 → 사용자)을 정의합니다. SubAgent 정의 자체는 [`../agents/<name>.md`](../agents/). 진입 주체 = 메인 세션 또는 루프 드라이버; 작업 → 버킷(a/b/c) 분류는 [`work-judge.md`](work-judge.md), 엔진은 [`loop-driver.md`](loop-driver.md). 빠른 매핑은 [`../agents/_routing.md`](../agents/_routing.md).

---

## 1. SubAgent 10개 역할 (요약)

> **모델 정본은 여기가 아니다** — 티어 4층과 full ID는 **ADR-010 개정 1**(2026-07-25)이 소유하고, 실제 값은 각 `../agents/<name>.md`의 frontmatter가 정본이며 `99_Others/tests/agents/agent-model-canon.test.ts`가 기계 고정한다. 아래 모델 열은 *읽는 사람을 위한 사본*이다.
> ⚠️ **별칭 금지** — `model: opus`는 `claude-opus-4-8`로 스폰된다(2026-07-24 실측). full ID로만 적는다.

| # | 이름 | 역할 | 모델 | 권한 |
|---|---|---|---|---|
| 1 | `main-process` | `02_Source/main/**` Electron 메인 (라이프사이클·IPC 핸들러·JSON 영속·fs/diff·git·lsp) | `claude-sonnet-5` | `02_Source/main/**` R/W (01_agents 제외) |
| 2 | `agent-backend` | `02_Source/main/01_agents/**` 엔진 추상화 (Claude/Codex 어댑터·registry·AgentEvent 정규화) | `claude-sonnet-5` | `02_Source/main/01_agents/**` R/W |
| 3 | `renderer` | `02_Source/renderer/**` React UI (셸·컴포넌트·Zustand·테마) | `claude-sonnet-5` | `02_Source/renderer/**` R/W |
| 4 | `shared-ipc` | `02_Source/shared/**` + `02_Source/preload/**` IPC 계약·공통 AgentEvent·contextBridge | `claude-sonnet-5` | `02_Source/shared/**`·`02_Source/preload/**` R/W |
| 5 | `qa` | `99_Others/tests/**` 단위·e2e·픽스처·회귀 안전망 | `claude-opus-5` | `99_Others/tests/**` R/W, 앱 코드 R only |
| 6 | `secretary` | 게이트·명시 파일 commit·work-pin·Phase 운영 — **존재 근거 = 컨텍스트 격리**(큰 입출력을 메인 밖에서) | `claude-opus-5` | 운영 파일만 제한 R/W |
| 7 | `reviewer` | Tier 2 자동 리뷰 (헌법/ADR/도메인 패턴 점검) | `claude-opus-5` | 전체 R only |
| 8 | `plan-auditor` | Phase 정의 사전 검증 | `claude-opus-5` | 전체 R only |
| 9 | `coordinator` | **경계 코드 정합 검증**(IPC 채널↔shared↔preload·AgentEvent·테스트 정합) — 분해·위임은 반납 | `claude-opus-5` | 전체 R only, **위임 권한 없음** |
| 10 | `chief-tech-operator` | 설계 분기 자문(선택지 비교·ADR 초안) + 막힌 문제 진단(에스컬레이션 최종단) | `claude-fable-5` | 전체 R only, ⚠️ **영호 승인 후에만 호출** |

각 SubAgent 디테일(입력/출력/툴 권한) = [`../agents/<name>.md`](../agents/).

### Codex 짝은 더 이상 1:1이 아니다 (2026-07-25 정정)

이 표에는 한때 `Claude / Codex` 짝 열(Sol high · Terra medium · Luna low)이 있었다. **그 짝은 성립하지 않는다** — **ADR-033 개정 1**(2026-07-12)이 Codex의 워커 함대 전제와 Sol/Terra/Luna 비용 계층을 철회하고 Codex를 **전담 보조**(리뷰·진단·rescue·세컨드 오피니언)로 재정의했다. 현재 Codex custom agent는 **`reviewer`·`plan-auditor` 2종뿐**이고, `main-process`·`renderer` 같은 도메인 Worker는 Codex 쪽에 **존재하지 않는다**. 두 엔진이 공유하는 것은 정책의 *의미*지 모델명이 아니다(CORE-12).

---

## 2. 라우팅 — 도메인 → SubAgent

| 도메인 / 작업 | 위임 대상 | 비고 |
|---|---|---|
| Electron 라이프사이클 / BrowserWindow / IPC 핸들러 등록 / 영속화(JSON) / fs watch·diff / git / lsp 호스트 | `main-process` | `02_Source/main/**` (어댑터 제외) |
| 코딩 엔진 어댑터(Claude/Codex) / 백엔드 registry / AgentEvent 정규화 | `agent-backend` | `02_Source/main/01_agents/**` |
| React UI / 3-pane 레이아웃 / 컴포넌트 / Zustand / 테마 | `renderer` | `02_Source/renderer/**` |
| IPC 계약(채널·타입) / 공통 AgentEvent 타입 / preload contextBridge | `shared-ipc` | `02_Source/shared/**` + `02_Source/preload/**` |
| 단위/e2e 테스트 / 픽스처 / 회귀 안전망 | `qa` | `99_Others/tests/**` (앱 코드 R only) |
| 회귀 게이트 실행·명시 파일 commit *실행*·대량 정리·새 재료 실측 | `secretary` | 운영 파일만, 제품 코드·테스트 편집 금지. pin·CHANGELOG·Phase 문서·커밋 메시지 *문구*는 메인 직접([`execution-owner.md`](execution-owner.md)) |
| MCP 도구 사용 (claude-in-chrome / Notion 등) | 메인 세션 직접 | MCP = 메인 세션 전용 (위임 불가) |
| 헌법 / ADR / docs / `.claude` 하네스 자체 | (위임 X, 영호 단독) | |

### 여러 도메인 작업 (2026-07-25 재편 — 분해는 메인이 한다)

2 도메인 이상 = **복잡 등급** 이상. 진행 순서:

1. **메인 세션이 Phase를 분해**한다. 분해가 갈리면 `chief-tech-operator` 자문을 *제안*하고 영호 승인 후 호출한다. 표준 분해형(IPC 기능·백엔드 어댑터·3-pane UI)은 [`../agents/chief-tech-operator.md`](../agents/chief-tech-operator.md) "분해 패턴 카탈로그".
2. 메인이 도메인별 Worker에 위임한다 (1단계만).
3. 메인이 Worker 결과를 수집·통합한다.
4. 경계가 걸린 변경이면 `coordinator`에게 **경계 정합 검증**을 돌린다(위임이 아니라 대조).
5. (조건 충족 시) `reviewer` 자동 호출.

⚠️ **왜 coordinator가 분해를 안 하나** — Claude Code v2.1.220 + `SPAWN_DEPTH` 미설정 = **서브에이전트 중첩 OFF**. 서브에이전트 런타임에 `Agent` 도구가 아예 없어서 `main → coordinator → Worker` 2단 위임은 **이미 실행 불가능**했다(2026-07-24 직접 관측). ADR-010 개정 1로 문서를 실태에 맞췄다.

**재귀 차단**: Worker가 다른 Worker를 *직접 호출 X*. 지금은 문서 규범이 아니라 **런타임이 막는다**(도구 부재). ⚠️ 중첩이 다시 켜지는 버전이 오면 재검토 대상.

---

## 3. 등급 → 처리 패턴 (재확인)

[`grade-and-risk.md`](grade-and-risk.md) 등급 정의에서 처리 패턴이 결정됩니다:

| 등급 | 처리 패턴 |
|---|---|
| **단순** | 판정표([`execution-owner.md`](execution-owner.md), 잡무 기준 v1 — 영호 2026-07-24, 구 Supervisor 전임 대체) — 판단이 살아 있는 문서 산출물(Phase·pin·CHANGELOG·조판·DONE)은 **메인 직접**, 기계 실행(커밋·게이트)·새 재료 실측은 `secretary`, 코드 1줄 수정도 해당 도메인 Worker. 하네스 `.claude/**`·헌법·ADR은 영호 단독 통제 대행으로 메인 직접 |
| **보통** | 도메인 Worker 1개에 위임 |
| **복잡** | 메인 분해 + Worker 1~2개 + `coordinator` 경계 검증(경계 걸릴 때) + `reviewer`(조건부) |
| **대규모** | 메인 분해 + Worker 3~4개 + `plan-auditor`(사전) + `coordinator` 경계 검증 + `reviewer`(통합) + 5단계 보고 MD/HTML |

---

## 4. 자동 호출 트리거

### 4-1. `reviewer` (Tier 2-A 자동 리뷰)

도메인 Worker 코드 변경 후 메인 세션이 평가:

- **무조건 호출**: `02_Source/shared/**`(IPC 계약) 변경 / `AgentBackend`·`AgentEvent` 변경(backend-contract) / preload 노출 변경 / 위험 깃발 발동 / 사용자 "리뷰 돌려줘"
- **조건부 호출**: 실질 변경 ≥10줄 + 등급 ≥ 보통 → 호출
- **무조건 스킵**: 테스트 파일만 / 주석·rename만 / 사용자 "리뷰 스킵 + 사유"

트리거 디테일 = [`review-tiering.md`](review-tiering.md).

### 4-2. `plan-auditor` (Tier 2-B Phase 정의 사전 검증)

- `01_Phases/**/NN-{slug}.md` (Phase 정의) Write/Edit → 자동 호출
- `_milestone-plan.md` Write/Edit → 자동 호출
- 출력: 결함 발견 시 사용자에게 리스트 + 옵션 A(즉시 봉합) / 옵션 B(진행)

### 4-3. `coordinator` (경계 정합 검증 — 통합 직후)

- **무조건**: `02_Source/shared/**` 계약이 움직였고 그 채널을 쓰는 `main`·`preload`·`renderer`가 **같은 작업에서 함께** 바뀐 경우 — 타입이 안 잡는 불일치가 나는 자리다.
- **권장**: 도메인 2개 이상이 한 Phase에서 합쳐졌을 때.
- **스킵**: 단일 도메인 / 경계 무관 변경 — coordinator 스스로도 "검증 불필요"로 즉시 반환한다.
- ⚠️ **등급 결정 직후가 아니라 *통합 직후***다. 분해 시점의 자동 호출은 폐지됐다(ADR-010 개정 1).

### 4-4. `chief-tech-operator` (⚠️ 자동 호출 없음)

- **자동 발화 금지.** 메인이 *"여기는 CTO 자리"* 라고 **제안**하고 **영호가 승인**한 뒤에만 호출한다(Fable 5 단가 — 혼합 방식, 영호 결정 2026-07-25).
- 제안 시점: ① 설계 선택지가 둘 이상이고 어느 쪽도 명백히 낫지 않을 때 ② `reviewer`/Worker가 3차까지 실패했을 때(§5 에스컬레이션 최종단).

---

## 5. 에스컬레이션 룰

Worker가 2번 실패하면 *엔진별 상향 티어*로 올립니다:

```
[Worker 1차 — 기본 티어 claude-sonnet-5] → 실패(빌드 깨짐/테스트 0건/명세 미달)
  → [2차 — 기본 티어, 같은 SubAgent·입력 보강] → 실패
    → [3차 — 상향 티어 claude-opus-5, 같은 역할 또는 메인이 분해 재검토] → 실패
      → [4차 — chief-tech-operator 진단 제안 → 영호 승인 후 호출] → 여전히 막히면
        → 사용자에게 escalate
```

각 상향은 work-pin에 "에스컬레이션: 기본 티어 2회 / 상향 티어"를 박아 비용을 가시화합니다.

### 사용자 escalate 양식

```
⚠️ Worker 에스컬레이션 — 3차 시도 후에도 실패
  SubAgent: <name> / 작업: <한 줄> / 실패 사유: <마지막 에러>
  옵션: 1) 본인이 직접 / 2) 다른 SubAgent 재위임 / 3) Phase 분해 재검토
```

---

## 5.5 선택적 상향 티어 — 복잡도/위험 기반 Worker 모델 상향

**원칙**: 구현 Worker는 §1의 엔진별 기본 모델을 따르되, **작업 위험도가 높으면 상향 티어를 선택**합니다.

- **트리거**: `복잡 + trust-boundary`(또는 `backend-contract`) 또는 `대규모` Phase → 구현 Worker를 `claude-opus-5`로 상향합니다.
- **그 외**: 역할 frontmatter의 기본값(`claude-sonnet-5`)을 사용합니다. ⚠️ Codex 구현 Worker는 **존재하지 않습니다**(ADR-033 개정 1 — §1 하단 참조).
- **불변 (핵심)** `[문서 규범]`: 메인 `file:line` 실측 게이트는 **모델 무관 유지**. 근거는 능력이 아니라 **위치**입니다 — 검증자가 필요한 이유는 그가 더 똑똑해서가 아니라, **작성자는 자기 전제를 의심하지 못하고 자기가 읽지 않은 파일을 알지 못하기** 때문입니다. 모델을 올려도 이 비대칭은 사라지지 않습니다.
  > **왜 이렇게 다시 썼나 (HR2 P06)**: 종전 근거는 *"상향 모델도 실수 0을 보장하지 않으므로"* 였습니다. 그 논거는 공식 권고(*"Claude Opus 5는 시키지 않아도 자기 작업을 검증한다 — 명시적 검증 지시는 제거하라"*)에 **정면으로 반박당하며**, 모델이 좋아질수록 약해집니다. 위 재서술은 모델 성능과 **독립**입니다.
  >
  > **실증(2026-07-25, HR2 P05)**: reviewer가 잡은 🔴 4건 중 하나는 **작성자가 같은 창에서 직접 만든 회귀**였는데, 작성자 시야에서는 완료 조건의 *"sed 읽기 오탐 해소 ✅"* 로만 보였습니다. 능력 문제가 아니라 **자기가 세운 판정 기준 안에서는 그 구멍이 보이지 않는** 문제입니다. 같은 창의 plan-auditor 사례도 동형입니다 — 메인이 **읽지 않은 파일**(`OPEN-GATE.bat`·`ADR-028`)에 있던 결함 2건을 잡았고, 그건 검증이 아니라 **별개의 실측 작업**이었습니다.
- **런타임 한계**: 현재 호출 표면이 역할별 model override를 노출하지 않으면 강제 적용이라고 주장하지 않고, doctor에서 live PENDING으로 남긴 뒤 더 작은 Phase 분해와 사람 게이트로 보완합니다.

---

## 5.6 스폰 상한 — 런타임 3중 한도 + 규범 상한 `[문서 규범]`

**"신설"이 아니라 사실 등재입니다.** 런타임에는 이미 세 겹의 한도가 있습니다(HR2 착수 조사 2026-07-25):

| 층 | 한도 | 성격 |
|---|---|---|
| 세션 누적 | 200 | 런타임 |
| 동시 실행 | 20 | 런타임 |
| **중첩 깊이** | **0**(서브→서브 불가) | 런타임 — 서브 런타임에 `Agent` 도구가 아예 없음. 트랜스크립트 짝 `.meta.json`의 `spawnDepth`가 기계 증거 |

그 위에 **규범 상한**을 둡니다 — §3 등급표의 *"대규모 = Worker 3~4"* 를 권고가 아니라 **상한**으로 읽습니다. 그 이상이 필요하면 등급이 잘못 잡혔거나 Phase 분해가 덜 된 것입니다.

⚠️ **ultracode 세션은 동시 한도가 면제**됩니다. 그 세션에서는 위 런타임 20이 사라지므로 **규범 상한이 유일한 브레이크**입니다 — 이 절을 지우면 그때 아무것도 남지 않습니다.

📌 **턴 상한(`maxTurns`)은 우리가 정하지 않습니다** — 2026-07-26 영호 결정으로 10개 역할 frontmatter에서 전부 제거했고, SDK 기본값(무제한)에 맡깁니다. 근거는 §5.7.

---

## 5.7 서브 결과 회수 — 절단(truncation) 감지와 재개

**용어**: 여기서 *절단*은 서브에이전트가 **일을 끝내기 전에 런타임이 턴을 끊어** 마지막 사고 조각이 그대로 반환된 상태를 말합니다. 실패와 다릅니다 — 오류도 없고 종료 코드도 정상이라, **읽어 보기 전에는 성공과 구분되지 않습니다.**

### 왜 `maxTurns`를 폐기했나 (2026-07-26, 영호 결정)

`chief-tech-operator`에 HR2 마일스톤 전반 검토를 위임했더니 최종 보고가 아니라 **문장 중간**이 돌아왔습니다(누적 192,843 토큰 / 도구 호출 37회). 원인은 frontmatter의 `maxTurns: 25` 였습니다.

여기서 두 가지가 드러났습니다.

첫째, **그 값들에는 근거가 없었습니다.** 25·40 같은 수는 실측이 아니라 "이 정도면 넉넉하겠지"라는 산술이었고, 실제 작업은 그 한참 위에서 돕니다. 대체값으로 제가 제안한 150·250도 같은 성질의 숫자였고 영호가 그 점을 짚었습니다.

둘째, **막는 방향이 틀렸습니다.** `maxTurns`가 세는 것은 *에이전트 턴*(도구 사용 왕복 1회 = 1턴, 한 턴에 병렬 호출을 여러 개 해도 1턴)이지 *진전 여부*가 아닙니다. 그래서 성실하게 오래 일하는 에이전트를 폭주와 똑같이 자릅니다 — 폭주는 못 막고 정상 작업만 절단하는 게이트였던 셈입니다.

⇒ **턴 수 상한은 걷어내고, 폭주는 "진전이 있나"로 봅니다**(→ [`../hooks/circuit-breaker.sh`](../hooks/circuit-breaker.sh) 대상 축). 관련 문제가 실제로 반복되면 그때 실측을 근거로 다시 정합합니다.

📌 **대상 축에도 구멍이 있었고 세 번째 축으로 메웠습니다**(2026-07-26 CTO 검토 R1). Bash의 대상 키가 *명령 문자열 전체*의 체크섬이라, 명령이 한 글자만 달라도 카운터가 갈라집니다 — 게다가 총량 축은 Bash를 면제하므로 **"매번 조금씩 다른 명령을 시도하는 진전 없는 루프"는 두 축 어디에도 걸리지 않았습니다.** 그래서 **누적 체크포인트 축**(같은 주체의 도구 호출 100회 단위/60분)을 더했습니다. 이 축은 폭주를 *판정하지 않고* 상황만 알립니다 — 총량으로 진전을 판정하려던 시도가 곧 `maxTurns`의 실패였기 때문입니다.

### 절단 감지 규범 (메인 세션 책임)

`maxTurns`가 없어도 런타임 사정으로 결과가 잘릴 수 있으므로, **회수 시점에 메인이 형식을 검사**합니다.

- **판정**: 서브 결과가 §6 브리프의 *출력* 항목이 요구한 형식(최종 보고·`-DONE.md`·구조화 목록 등)이 **아니면 절단으로 간주**합니다. 특히 문장이 중간에 끊겼거나, 결론 없이 관찰만 나열됐거나, "이제 …를 확인하겠습니다"로 끝났다면 절단입니다.
- **조치**: 결과를 **채택하지 않고 재개**합니다 — `SendMessage`로 같은 에이전트에 이어서 요청하면 컨텍스트가 보존됩니다(새 `Agent` 호출은 처음부터 다시 하므로 토큰을 두 번 냅니다).
- **재개해도 같은 지점에서 끊기면** 브리프가 한 번에 담기엔 큰 것입니다 — 작업을 쪼개 다시 위임하고, 그 사실을 work-pin에 남깁니다.

⚠️ **절단을 결과로 오해하면 조용히 틀립니다.** 잘린 중간 문장도 그럴듯하게 읽히기 때문에, 형식 검사를 건너뛰고 내용만 보면 "검토 완료"로 착각한 채 다음 단계로 갑니다. 이 검사는 훅이 대신해 주지 않습니다 — 이 문장이 유일한 방어선입니다.

---

## 6. 위임 입력 약속 (필수 5항목)

```
@<worker-name>
작업: <한 줄>
입력 자산: <Phase 정의 / 의존 -DONE.md / 관련 파일 경로 / 관련 docs>
변경 대상: <폴더 또는 파일 목록>
완료 조건: <측정 가능 — 예: typecheck green + 테스트 N PASS>
출력: 진행 보고 + (필요 시) -DONE.md
```

5항목 중 하나라도 누락 시 Worker는 *추측 없이 즉시 종료* + **메인 세션에 입력 부족 알림**.

---

## 7. 위임 경계 — 약속

### 위임자는 메인 세션 단독
- 메인 → SubAgent **1단계만**. SubAgent는 다른 SubAgent를 호출하지 않는다.
- **담보는 문서가 아니라 런타임이다** — 중첩 OFF(v2.1.220 + `SPAWN_DEPTH` 미설정)로 서브에이전트에 `Agent` 도구가 없다. 추가로 전 역할 frontmatter에 `disallowedTools: Agent`를 명시해 이중으로 잠갔다(HR2 P03).
- ⚠️ 중첩이 다시 켜지면 frontmatter만 남는다 — 그때 재검토한다. (advisory 알림 = [`../../.claude/hooks/circuit-breaker.sh`])

### Worker 권한 범위 외 작업
- Worker가 권한 범위 외 파일 수정 시도 → 즉시 거부 + **메인 세션에 보고**. 스스로 재위임하지 않는다(할 수 없다).
- 예: `renderer` Worker가 `02_Source/main/` 수정 시도 → 권한 부재 → "main-process Worker 필요" 보고 → 메인이 재위임.

### Reviewer/plan-auditor R only
- 두 점검 역할은 모델과 무관하게 *읽기만* 합니다. 수정 권고는 메인 세션 또는 도메인 Worker 책임입니다.

---

## 8. 함정 / 주의사항

- ~~단순 = 전부 위임(Supervisor 전임)~~ → **개정(영호 2026-07-24, 잡무 기준 v1)**: 판단이 살아 있는 산출물은 위임하면 대필세(브리프에 내용을 통째로 쓰는 이중 지불)만 남는다 — 메인 직접. 컨텍스트 보존 근거는 *출력·입력이 큰 작업*(게이트·실측·대량 정리)에만 유효 — 그것만 위임. 판정 = [`execution-owner.md`](execution-owner.md).
- ~~여러 도메인 = 무조건 coordinator~~ → **철회(2026-07-25, ADR-010 개정 1)**: 그 위임 경로는 런타임 중첩 OFF로 **이미 실행 불가능**했다. 분해는 메인이 하고, coordinator는 통합 뒤 **경계 정합만 대조**한다.
- **모델 비용 인식** — 상향 티어는 비쌉니다. 에스컬레이션 발동 시 work-pin에 박습니다. ⚠️ `chief-tech-operator`(Fable 5)는 **영호 승인 없이 부르지 않습니다**.
- **MCP = 메인 세션 직접** — claude-in-chrome/Notion 등 MCP 도구는 메인 세션 전용(위임 불가).

---

## 9. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 갱신:

- [`../../CLAUDE.md`](../../CLAUDE.md) "SubAgent 풀" 섹션 (헌법 본문 표와 정합)
- [`../agents/_routing.md`](../agents/_routing.md) (빠른 매핑) + [`../agents/`](../agents/) (SubAgent 정의 10개) + `99_Others/tests/agents/agent-model-canon.test.ts` (모델 기계 고정 — 역할 추가 시 `EXPECTED_MODEL`에 등재하지 않으면 red)
- [`grade-and-risk.md`](grade-and-risk.md) (등급 → 처리 패턴) · [`work-judge.md`](work-judge.md) (등급/깃발 → 버킷) · [`loop-driver.md`](loop-driver.md) (진입 주체)
- [`review-tiering.md`](review-tiering.md) (reviewer 자동 호출 트리거)
- [`../../.claude/hooks/circuit-breaker.sh`](../../.claude/hooks/circuit-breaker.sh) (반복 도구 사용 알림 advisory)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 도메인 정합(server/shared/client→main-process/agent-backend/renderer/shared-ipc, +agent-backend 신규=듀얼 백엔드), knowledge-gc 제거(D1), unity-bridge N/A, MCP=메인 직접, 위험깃발 정합(backend-contract 추가).
- 2026-07-10 — secretary 포함 9역할과 실제 경로를 복원하고, Claude Opus/Sonnet과 Codex Sol/Terra/Luna를 기본/상향 티어 의미로 정합.
- 2026-07-26 — **`maxTurns` 전면 폐기 + §5.7 신설**(영호 결정). 10역할 frontmatter에서 턴 상한을 제거하고 SDK 기본값(무제한)으로 되돌렸다. 발단은 `chief-tech-operator`가 `maxTurns: 25`에 걸려 최종 보고 대신 문장 중간을 반환한 실측(192,843 토큰 / 도구 37회). 값에 실측 근거가 없었고, `maxTurns`는 *턴 수*를 세지 *진전*을 보지 않아 폭주는 못 막고 성실한 장기 작업만 잘랐다. 빈자리는 둘로 메웠다 — ① 폭주 판정을 "얼마나 많이 했나"에서 **"진전이 있나"**(같은 주체·도구·대상 반복)로 넓힌 `circuit-breaker` 대상 축 ② 회수 시점의 **절단 감지 규범**(형식 불일치 = 절단 → `SendMessage`로 재개).
- 2026-07-25 (HR2 P03) — **9역할 → 10역할**. `chief-tech-operator` 신설(Fable 5·영호 승인 발동), `coordinator`는 분해·위임을 반납하고 **경계 정합 검증**으로 축소(런타임 중첩 OFF가 이미 그 경로를 무력화하고 있었음), 분해 주체를 메인 세션으로 이관. 모델은 별칭 금지·full ID로 통일하고 정본을 ADR-010 개정 1 + 회귀 테스트로 이동. **Codex 짝 열 삭제** — ADR-033 개정 1이 워커 함대·Sol/Terra/Luna를 철회했으므로 1:1 대응이 애초에 존재하지 않았다.
