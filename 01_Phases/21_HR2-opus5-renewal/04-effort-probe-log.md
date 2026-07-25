# P04 effort 프로브 원장

> **성격**: 이 문서는 *결과 보고서*가 아니라 **원장**이다. 판정 기준을 프로브 실행 **전에** 적고, 그 다음에 결과를 아래에 덧붙인다. 순서가 곧 정당성이다 — 사후에 기준을 정하면 어떤 결과든 정당화되고, 이 저장소가 effort를 다섯 번 뒤집은 메커니즘이 정확히 그것이었다.
>
> **작성 시점**: 2026-07-25, 프로브 실행 **전**.

---

## A. 실행 전 확정 사실 (스폰 0회로 얻은 것)

### A-1. 설정 지점 — `/doctor` 진단 중 실측 (P04 선결)

| 항목 | 실측값 | 의미 |
|---|---|---|
| `~/.claude/settings.json` → `effortLevel` | **`"xhigh"`** | 메인 세션 설정 지점. 영호 결정("메인 xhigh")은 **이미 충족** |
| `.claude/settings.json`(project) → `effortLevel` | 부재 | 프로젝트가 덮어쓰지 않음 |
| `.claude/settings.local.json` | 파일 자체 부재 | — |
| `CLAUDE_CODE_EFFORT` / `CLAUDE_CODE_EFFORT_LEVEL` | **미설정** | 초안이 우려한 그 변수명들은 존재하지 않는다 |
| `CLAUDE_EFFORT` | `"xhigh"` (프로세스 env) | ↓ A-2에서 정체 확정 |
| `HKCU\Environment` · `HKLM\...\Environment` | CLAUDE/ANTHROPIC 변수 **0건** | 영호가 심은 영구 변수가 아니다 |
| `.claude/**` frontmatter의 `effort:` 키 | **0건** | 2026-07-17 최종 제거 상태 그대로 |

### A-2. ⭐ `CLAUDE_EFFORT`의 정체 확정 — 추정이 아니라 **런타임 코드**

P01~P03 시점에는 *"파생 신호일 가능성이 높다"* 는 **추정**이었다. CLI 바이너리(`claude.exe`, 265MB) 문자열 검색으로 **확정**했다:

```js
if (e.effortLevel !== void 0) t.CLAUDE_EFFORT = e.effortLevel;
```

그리고 같은 바이너리의 훅 payload 스키마 설명:

> *"Active effort level for the current turn (e.g., `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"max"`), **after any silent downgrade for the selected model**. Also exposed to hook commands and Bash as the **`CLAUDE_EFFORT`** env var."*

**따라서 `CLAUDE_EFFORT`는 런타임이 현재 턴의 실효 effort를 써 넣는 공식 판독구다.** 입력이 아니라 출력이며, **모델이 요청 effort를 지원하지 않아 조용히 강등된 경우 그 강등 후 값**이 실린다. 이건 모델의 자기보고가 아니라 **기계 값**이므로 메모리 「수정은 실측으로 검증」의 요구를 충족한다.

> 📌 **부수 발견 (P05/P06 재료)** — 훅 payload에 `effort.level`이 실린다. *"Present for hooks that fire within a tool-use context (PreToolUse, PostToolUse, Stop, **SubagentStop**) … when the hook fires from within a subagent (**alongside `agent_id`**)"*. 즉 `parse-payload.js`에 effort 추출을 한 줄 추가하면 **모든 서브에이전트의 실제 effort가 원장에 자동 기록**된다. 일회성 프로브보다 강한 상시 관측이다. → P05 "무방비 훅 테스트 신설" 항목과 함께 검토.

### A-3. frontmatter `effort` 키의 유효성 — **"no-op" 박제는 현 버전에서 부정확하다**

메모리 `claude-code-effort-precedence.md`는 *"frontmatter effort는 무효(no-op)"*(2026-07-03 실측)로 박제돼 있다. 현 버전(v2.1.220) 바이너리 실측은 다르다:

```js
let E = r.effort, A = (E !== void 0) ? S5(E) : void 0;
if (E !== void 0 && A === void 0)
  w(`Agent file ${e} has invalid effort '${E}'. Valid options: ${CD.join(", ")} or an integer`);
```
- `.claude/agents/*.md` 파서가 `effort`를 **읽고 `S5()`로 검증**한다. 유효값 = `low`·`medium`·`high`·`xhigh` **또는 정수**.
- ⭐ 같은 함수의 **plugin agent 분기**는 *"sets `${G}`, which is **ignored for plugin agents**. Use `.claude/agents/` for this level of control."* 경고를 `permissionMode`·`hooks`·`mcpServers` **3개에만** 낸다. **`effort`는 그 무시 목록에 없다** — plugin에서도 무시되지 않는다는 뜻.

⚠️ **다만 "파싱·검증된다" ≠ "적용된다".** 최소 결론은 *"2026-07-03의 no-op 박제를 현 버전의 근거로 쓸 수 없다"* 까지다. 적용 여부는 아래 프로브가 판정한다.

### A-4. 상속에 대한 1차 문헌 — `Workflow` 도구 계약

메인 세션에 상주하는 `Workflow` 도구 설명이 명시한다:

> `opts.effort` — overrides the reasoning effort for this agent call … **omit to inherit the session effort**

**서브는 세션 effort를 상속한다**는 런타임 계약이다. 세션이 `xhigh`이므로, 이 문장이 `Agent` 도구 경로에도 적용된다면 **9역할은 이미 전부 xhigh로 돌고 있고 영호 결정("나머지는 기본 high")은 이미 깨져 있다**.

⚠️ 단 이 문장은 `Workflow`의 `agent()` 계약이고 `Agent` 도구 / frontmatter 경로와 **같은 기계인지가 문면상 확정되지 않는다.** 그래서 프로브 ⓪를 생략하지 않는다.

---

## B. 판정 기준 — **실행 전 확정** (사후 변경 금지)

### B-1. 프로브 ⓪ (상속 — 선행·필수)

- **질문**: 서브에이전트는 세션 effort(`xhigh`)를 상속받는가?
- **방법**: 임의 SubAgent 1회 스폰 → `node -e "console.log(process.env.CLAUDE_EFFORT)"` 1회 실행 → 출력 회수.
- **왜 이 방법인가**: A-2에서 이 변수가 **런타임이 쓰는 공식 판독구**임이 확정됐다. 모델에게 "네 effort가 뭐냐"고 묻는 자기보고와 **다르다**.
- **판정**:
  - 출력이 `xhigh` → **상속 있음**. 이 Phase의 일이 뒤집힌다 — "xhigh를 주는 것"이 아니라 **"9역할을 high로 낮출 수 있는가"** 가 된다.
  - 출력이 `high` → **상속 없음**. 배분은 의도대로이고 남은 일은 `chief-tech-operator` frontmatter 한 줄.
  - 출력이 빈 값/`undefined` → 판독 불가. 대안으로 서브의 세션 헤더 표기를 회수한다.

### B-2. 프로브 ① (frontmatter 적용 — ⓪ 결과와 무관하게 유용)

- **질문**: `.claude/agents/*.md`의 `effort:` 키가 실제로 적용되는가? (A-3의 미결 지점)
- **방법**: 임시 에이전트 정의 1개에 세션과 **다른** 값을 넣고(`effort: low`) 스폰 → `CLAUDE_EFFORT` 회수.
- **판정**: `low` → **적용됨**(메모리 박제 폐기, 도입 수단 확보) / `xhigh` → **미적용**(frontmatter로는 낮출 수 없음).
- ⚠️ 이 프로브가 **B-1이 "상속 있음"일 때 특히 중요**하다 — 낮출 수단이 없으면 "9역할 high"는 달성 불가능한 결정이 되고, 그 사실을 영호에게 보고해야 한다.

### B-3. 프로브 ② (품질 A/B — **판정의 본체**)

- ⚠️ **B-1·B-2가 끝나기 전엔 돌리지 않는다.** 대조군 A의 정체를 모르는 A/B는 *"xhigh vs xhigh"* 일 수 있고, 그때 나오는 "차이 없음"은 **effort가 무효라는 증거가 아니라 실험이 무효라는 증거**다.
- **측정량 3종**:
  - ⓐ `CLAUDE_EFFORT` 판독값 — *effort가 전달됐는가*
  - ⓑ thinking 토큰 수 — *effort가 동작했는가*
  - ⓒ **동일 과제 산출물의 결함 지적 수** — *effort가 값을 했는가* ← **판정의 본체**
- **표본**: 동일 프롬프트·동일 역할로 `high` vs `xhigh` 각 1회. 과제는 **결함을 셀 수 있는 것** — 의도적 결함을 심은 Phase 문서 초안을 주고 지적 수를 센다.
- **판정선**: ⓐ가 갈리고 **동시에** ⓒ에서 xhigh가 **더 낫거나 최소한 동등** → 도입. **더 나쁘거나 차이 없으면 → 드롭**(비용만 늘기 때문).
- ⚠️ **ⓐ·ⓑ만으로 도입을 결정하지 않는다.** 공식 문서 출처 A②가 못박듯 effort는 사고량을 바꿀 뿐 출력 길이를 바꾸지 않으므로, **토큰이 갈리는 것은 "동작한다"의 증거일 뿐 "좋아진다"의 증거가 아니다.** 1차 초안의 *"thinking 토큰 2배 차이 → 도입"* 은 이 점에서 틀린 판정선이었다.

### B-4. 무효 조건

- ~~`CLAUDE_CODE_EFFORT_LEVEL` 존재~~ → **부재 확인 완료**(A-1).
- **남은 무효 조건**: B-1이 미확정인 상태에서 B-3를 돌리는 것. 그 결과는 채택하지 않는다.

---

## C. 프로브 결과 (2026-07-25 실행 — 영호 승인 4회 스폰)

### C-1. 원문 출력

**⓪ 상속** — `secretary` 스폰(정의에 `effort` 키 **없음**):
```
CLAUDE_EFFORT=xhigh
CLAUDE_CODE_CHILD_SESSION=1
AI_AGENT=claude-code_2-1-220_agent
```

**① frontmatter 적용** — `qa` 스폰(정의에 `effort: low` 주입):
```
CLAUDE_EFFORT=xhigh
CLAUDE_CODE_CHILD_SESSION=1
AI_AGENT=claude-code_2-1-220_agent
```

**정의 신선도 프로브** (①의 교란 요인 제거용, 계획 외 신설) — `qa` 본문 최상단에 마커 삽입 후 스폰, 2회:
```
1차 (HTML 주석 `<!-- FRESHNESS-MARKER: ZQX7-HR2P04-9K3M -->`):  MARKER: ABSENT / CLAUDE_EFFORT=xhigh
2차 (평문 `FRESHNESS-MARKER: ZQX7-HR2P04-9K3M`):                MARKER: ABSENT / CLAUDE_EFFORT=xhigh
```
> 1차는 **내 설계 실수**였다 — HTML 주석은 시스템 프롬프트 구성 시 제거될 수 있어 "캐시됨"과 구별되지 않는다. 그래서 평문으로 2차를 돌렸고 결과는 같았다.

### C-2. 판정

| 프로브 | 판정 | 근거 |
|---|---|---|
| **⓪ 상속** | ✅ **상속 있음 — 확정** | `secretary`는 정의에 effort 키가 없는데 `xhigh`가 나왔다. 세션 `effortLevel`이 유일한 출처다. `AI_AGENT`가 `claude-code_2-1-220_agent`로 찍힌 것이 중요하다 — env가 메인에서 흘러온 게 아니라 `source==="agent"` 분기로 **서브용으로 새로 구성**됐고(A-2의 코드), 그 안의 값이 `xhigh`다 |
| **① frontmatter 적용** | ⚠️ **무효 — 판정 불가** → **§E-4에서 「무효」로 최종 확정** | `effort: low`를 넣었는데 `xhigh`가 나왔다. 그런데 정의 신선도 프로브가 마커를 못 찾았으므로 **`low`가 애초에 전달되지 않았을 가능성**을 배제할 수 없다. "적용 안 됨"과 "전달 안 됨"이 구별되지 않는다 → **§E-4가 「전달 안 됨」임을 기계 증거로 확정**했다. 이 프로브는 effort에 대해 **아무것도 말하지 않는다** |
| **정의 신선도** | ⚠️ 캐시 시사 — 단 결정적이지 않음 → ✅ **§E-4에서 캐시 확정** | 평문 마커 2회 모두 ABSENT. 다만 이건 **모델의 자기 시스템 프롬프트 관찰**에 의존하는 측정이라, 「수정은 실측으로 검증」의 기준으로는 `CLAUDE_EFFORT` 같은 기계 값보다 한 단계 약하다 → **§E-4가 `model` frontmatter × 트랜스크립트 판독으로 기계 확정**. 유보 판단은 옳았고 결론도 같은 방향이었다 |
| **② 품질 A/B** | 🔁 **재개** — 영호가 `Workflow` 사용을 허용(2026-07-25) | 아래 C-3 → C-4 |

### C-3. ⭐ ②를 돌릴 수 없는 이유 — 이것이 P04의 실제 답이다

A/B를 하려면 **서브 하나를 `high`로, 하나를 `xhigh`로** 띄울 수단이 있어야 한다. 실측한 표면 셋:

| 경로 | effort 제어 | 실측 |
|---|---|---|
| **`Agent` 도구 파라미터** | **없음** | 스키마에 `description`·`prompt`·`subagent_type`·`model`·`isolation`·`run_in_background`뿐. **effort 파라미터가 아예 없다** |
| **frontmatter `effort:`** | 파싱·검증은 됨 | 적용 여부 미결(①). 설령 적용돼도 정의 캐시가 사실이면 **세션 중 변경 불가** |
| **`Workflow`의 `agent(prompt, {effort})`** | **있음** | 도구 계약에 `opts.effort: 'low'\|'medium'\|'high'\|'xhigh'\|'max'` 명시. ⚠️ 단 이 세션은 workflow 사용이 금지돼 있다 |

**⇒ 서브별 effort 오버라이드는 런타임에 존재하지만 `Workflow` 경로에만 노출된다.** `Agent` 도구 + frontmatter 경로로는 도달할 수 없다.

### C-4. ② 품질 A/B — 채점 정답지 ⚠️ **결과 도착 전에 작성** (2026-07-25)

영호가 이 세션의 workflow 사용을 허용해 ②를 재개했다. `Workflow`의 `agent(prompt, {effort})`로 두 arm을 띄운다 — **프롬프트·과제·스키마가 완전히 동일하고 `effort`만 다르다.**

> ⚠️ **이 정답지는 두 arm의 출력이 도착하기 *전에* 적는다.** 결과를 보고 정답지를 만들면 어느 쪽이든 이긴 것처럼 채점할 수 있다 — 이 원장의 존재 이유가 그 차단이다.

**과제**: 의도적 결함을 심은 Phase 초안 1건(프롬프트에 인라인 — 파일 접근 불필요, 두 arm이 바이트 단위로 같은 입력을 받게).

**심은 결함 9개 (정답지)**:

| # | 위치 | 결함 | 위반 |
|---|---|---|---|
| 1 | 사전 조건 | Phase 07이 **P08**(뒤 번호) 산출물을 요구 — 의존성 순서 역전 | 의존성 정합 |
| 2 | 작업 1 | `renderer` Worker가 `02.Source/main/preview-handler.ts`도 작성 | 도메인 경계 |
| 3 | 작업 2 | `PreviewPanel.tsx`에서 `fs.readFileSync` 직접 호출 | **CORE-01** 신뢰 경계 |
| 4 | 작업 3 | renderer가 `ClaudeCodeBackend`를 직접 import | **CORE-02** 엔진 추상화 |
| 5 | 작업 4 | 채널명 `'preview:read'`를 renderer·main에 **각각 하드코딩** | **CORE-04** IPC 단일 정의 |
| 6 | 작업 5 | 새 최상위 폴더 `03.Cache/`를 ADR 없이 신설 | **CORE-08** |
| 7 | 작업 6 | 구현 먼저 → 나중에 테스트 | **CORE-05** TDD |
| 8 | 완료 조건 | *"동작이 자연스럽고 사용감이 좋으면 완료"* — 측정 불가 | 완료 조건 측정가능성 |
| 9 | 완료 조건 | CI가 **자동으로** `git push origin master` | **CORE-06** 비가역 무인 |

**채점 규칙 (사전 확정)**:
- **적중** = 위 9개 중 하나를 지적한 것. 표현이 달라도 *같은 지점의 같은 문제*를 짚으면 적중이다. 규칙 번호(CORE-NN)를 못 붙여도 적중으로 센다 — 재는 것은 *결함 발견력*이지 규칙 암기가 아니다.
- **중복** = 같은 결함을 두 항목으로 쪼갠 경우 1회로 합산.
- **보너스** = 정답지에 없는데 **실제로 타당한** 지적(예: `master` 직접 push라는 브랜치 정책 위반, frontmatter `status` 필드 누락). **별도 집계**하고 주 판정선에는 넣지 않는다 — 정답지가 사후에 늘어나면 채점이 다시 자의적이 되기 때문이다.
- **오탐** = 결함이 아닌 것을 결함이라 한 것. 별도 집계.
- ⚠️ **채점은 메인이 두 출력을 나란히 놓고 한다.** 서브에게 자기 채점을 시키지 않는다.

**판정선** (B-3에서 이미 고정, 여기 재확인):
- ⓐ 두 arm의 `claude_effort_env`가 **서로 달라야** 한다(`high` vs `xhigh`). 같으면 **실험 무효** — `Workflow`의 `opts.effort`조차 안 먹는다는 뜻이고, 그건 그것대로 큰 발견이다.
- ⓒ xhigh 적중 수가 high보다 **많거나 같으면** 도입 방향 지지 / **적으면** 드롭 지지.
- ⚠️ **n=1씩이므로 이 결과 하나로 단정하지 않는다.** 방향 신호로만 쓰고, 그 한계를 D에 명시한다.

---

## C-5. ② 품질 A/B 결과 (2026-07-25 실행 — `Workflow` `opts.effort`)

### ⓐ effort 전달 검증 — ⭐ **`Workflow`의 `opts.effort`는 작동한다**

| arm | `opts.effort` | 서브가 보고한 `CLAUDE_EFFORT` |
|---|---|---|
| A | `high` | **`high`** |
| B | `xhigh` | **`xhigh`** |

**갈렸다.** 이건 C-3 표를 실측으로 확정한다 — 서브별 effort 오버라이드는 **`Workflow` 경로에서 실제로 발효**된다(`Agent` 도구·frontmatter는 안 됨). 대조군의 정체를 모른 채 비교하는 B-4 무효 조건도 해소됐다.

### ⓑ 비용

| arm | 토큰 | 도구 호출 | 소요 |
|---|---|---|---|
| A (high) | 34,954 | 4 | 85.0s |
| B (xhigh) | 35,561 | 5 | 110.7s |

토큰 **+1.7%**, 시간 **+30%**. ⚠️ 출처 A②의 예고대로 **출력 길이는 거의 안 늘었다** — effort는 사고량을 바꾸지 응답 길이를 바꾸지 않는다.

### ⓒ 정답지 채점 — **주 판정선**

| # | 심은 결함 | A (high) | B (xhigh) |
|---|---|---|---|
| 1 | 의존성 순서 역전(P08) | ✅ | ✅ |
| 2 | 도메인 경계(renderer가 main 작성) | ✅ | ✅ |
| 3 | CORE-01 renderer 직접 fs | ✅ | ✅ |
| 4 | CORE-02 어댑터 직접 import | ✅ | ✅ |
| 5 | CORE-04 채널명 이중 정의 | ✅ | ✅ |
| 6 | CORE-08 새 최상위 폴더 | ✅ | ✅ |
| 7 | CORE-05 TDD 역순 | ✅ | ✅ |
| 8 | 완료 조건 측정 불가 | ✅ | ✅ |
| 9 | CORE-06 자동 push | ✅ | ✅ |
| | **적중** | **9/9** | **9/9** |

### 보너스·질적 차이 (별도 집계 — 주 판정선 밖)

총 지적 수 **22 vs 26**, 정답지 밖 타당 지적 **13 vs 17**.

**xhigh만 잡은 것** — 문서를 *교차 대조*해야 나오는 종류:
- ⭐ **작업 2 vs 작업 4 자기모순** — renderer가 직접 `fs`로 읽는다면서 같은 목적의 `preview:read` IPC 채널도 정의한다 → 하나는 죽은 코드. **내가 심지도 않은 초안의 진짜 결함**이고 high는 놓쳤다.
- **초안이 제시한 근거를 반박** — *"IPC 왕복이 없어 빠르다"* 에 대해 *"동기 `readFileSync`는 UI 스레드를 블로킹해 오히려 느리다"*.
- `fs.read 단일채널`(M2/ADR-012) 위반 · preload·shared 담당자 부재 · 테스트 범위 미정.

**high만 잡은 것** — *하네스 절차 축*:
- `master` 직접 push(브랜치/PR 게이트 우회) · 회귀 게이트 항목 부재 · `trust-boundary` 깃발 미표기 · 등급↔역할 배정 불일치(복잡인데 coordinator·reviewer 없음).

**오탐·라벨 정확도**: xhigh가 도메인 경계 위반과 main 레이아웃 위반에 `CORE-08`을 붙였다(오적용 — CORE-08은 새 최상위 폴더/의존성 조항). 채점 규칙상 적중은 유효하나 **규칙 라벨 정확도는 high가 나았다.**

### C-5 판정

- **주 판정선(ⓒ): 동등(9 vs 9).** 판정선 문구("많거나 같으면 도입 방향 지지")상 형식적으로는 지지지만, **차이가 0이다.**
- 이는 공식 근거 ③(*"Code review 정확도는 낮은 effort 설정에서도 유지된다"*)과 **정확히 일치한다** — 우리 워크로드에서 그 문장이 재현됐다.
- 보너스에서 xhigh가 앞섰지만 **n=1이라 4건 차이는 노이즈와 구별되지 않는다.** 단정하지 않는다.
- ⚠️ **그리고 이 우위는 적용할 데가 없다** — 제어가 `Workflow` 경로에만 있어 일상 운용(`Agent` 도구 위임)에서는 쓸 수 없다.

---

## D. ~~최종~~ 1차 판정 — ⚠️ **D-1·D-2는 §E에서 무효화됐다**

> ⚠️ **이 절은 역사 기록으로만 읽어라.** 아래 D-1·D-2는 *"정의 캐시 여부가 미결"* 이라는 전제 위에 세워졌고, §E가 그 전제를 **기계 증거로 뒤집었다**. 소급 삭제하지 않고 남기는 이유는, 판정 기준을 사전 고정한 이 원장의 가치가 *"무엇을 언제 알았는가"* 의 추적 가능성이기 때문이다. **살아 있는 판정은 §E다.**

### D-1. ~~영호 결정("메인 xhigh + 나머지 9역할 기본 high")은 **현 도구 표면에서 달성 불가능하다**~~ ❌ 무효

effort의 유일한 실효 손잡이는 `~/.claude/settings.json`의 `effortLevel` 하나이고, 서브는 그것을 **상속**한다. 따라서 가능한 조합은 둘뿐이다:

| 조합 | 메인 | 서브 9역할 | 비고 |
|---|---|---|---|
| **현행** (`effortLevel: xhigh`) | xhigh ✅ | **xhigh** ❌(결정과 다름) | 영호 결정의 **후반부**가 깨져 있다 |
| **하향** (`effortLevel: high`) | **high** ❌ | high ✅ | 영호 결정의 **전반부**가 깨진다 |

**"메인만 높고 서브는 낮게"는 이 손잡이로 표현할 수 없다.** 이건 우리 하네스의 결함이 아니라 **도구 표면의 성질**이다.

### D-2. ~~effort **도입 드롭** — frontmatter에 effort 키를 넣지 않는다~~ ❌ 무효 (§E-6이 대체)

- 근거 ①: 넣어도 세션 상속을 이기지 못한다(①이 무효라도, 이길 수 있다는 증거는 **어느 쪽에서도 나오지 않았다**).
- 근거 ②: 정의 캐시가 사실이라면 세션 중 변경조차 안 되므로 운용 수단으로서 쓸모가 없다.
- 근거 ③: 2026-07-03 A/B 실측(토큰 동급, 양방향)과 **모순되지 않는다** — 그때의 "no-op" 관찰은 여전히 반증되지 않았다.
- ⇒ **이번 창에서도 effort frontmatter는 0건으로 유지한다.** 이것이 **여섯 번째 도입 시도의 정상 종료**다.

### D-3. 정정 — 내가 이 원장 §A-3에서 한 서술은 과했다

§A-3은 바이너리에 파싱·검증 코드가 있다는 이유로 *"'no-op' 박제를 현 버전 근거로 인용하지 말 것"*이라고 적었다. **프로브는 그 방향을 지지하지 않았다.** 정확한 현재 상태는 이렇다:

> **파서는 `effort`를 읽고 검증한다(바이너리 사실). 그러나 서브의 실효 effort는 세션 상속값이었다(프로브 사실). 실질적으로 no-op이다.**

§A-3에 *"파싱·검증 ≠ 적용. '적용된다'고 단정하지 말 것"*을 미리 적어 둔 것이 이 과잉 해석을 걸러냈다. **판정 기준을 프로브 전에 고정한 것이 실제로 값을 했다** — 이 원장의 존재 이유가 그것이다.

### D-2b. ⭐ 새로 확정된 사실 — `Workflow`에서는 서브별 effort 제어가 **된다**

C-5 ⓐ가 실측했다. 이건 드롭 판정과 **모순되지 않는다** — 드롭 대상은 *frontmatter `effort:` 키*이고, `Workflow` `opts.effort`는 별개 표면이다. 정책에 등재할 값이 있다:

- **일상 위임(`Agent` 도구)**: effort 제어 **불가**. 세션 `effortLevel`이 전부에 적용된다.
- **`Workflow` 사용 시**: `agent(prompt, {effort})`로 스테이지별 제어 **가능**. 값싼 기계 단계는 `low`, 어려운 판정 단계만 `xhigh` 같은 배분이 실제로 발효된다.
- ⚠️ 단 A/B가 보인 바로는 **결함 탐지 정확도는 high에서도 유지**되므로, `xhigh`는 *교차 대조가 필요한 판정 단계*에 한해 쓰고 기본은 `high`로 두는 것이 근거에 맞다.

### D-4. 미결로 남기는 것 (정직 선언)

- **에이전트 정의가 세션 중 편집을 반영하는가** — 마커 프로브는 ABSENT를 2회 냈지만 모델 자기관찰 기반이라 기계 증거가 아니다. **결정적 판별법 = `model` frontmatter를 바꾸고 서브 트랜스크립트(`~/.claude/projects/<proj>/<session>/subagents/agent-*.jsonl`의 `"model"` 필드)를 확인하는 것.** 이건 스폰 예산 밖이라 다음 창으로 넘긴다.
  - ⚠️ **이게 미결이면 P02·P03이 방금 고친 frontmatter(모델 full ID·`disallowedTools`·`maxTurns`·`color`·CTO 신설)가 이 세션에 반영됐는지도 미확정**이다. 다음 세션에서는 확실히 반영된다.
  - ⚠️ 메모리 「Claude Code effort 실측」은 *"model frontmatter는 spawn마다 즉시 반영·세션 재시작 불필요"*(2026-07-03)라고 적고 있어 **이번 마커 결과와 긴장 관계**다. 둘 중 하나가 버전 변화이거나, 마커 프로브가 틀렸다.
- **품질 A/B(②)** — 수단이 `Workflow`에만 있어 이 세션에서는 불가. 돌리려면 영호가 workflow 사용을 허용해야 한다. → 허용받아 **C-5에서 실행 완료**(이 줄은 작성 시점 기준의 stale이다).

---

## E. 공식 문서 실측 + 결정적 판별 — ⭐ **1차 판정이 뒤집혔다** (2026-07-25, 영호 지시)

### E-1. 계기

영호: *"아니면 우리가 놓친게 있는지 공식문서 찾아서 실측해볼래?"*

§D를 마감하기 직전이었다. 실제로 **놓친 것이 있었고, 그것이 판정을 뒤집었다.**

### E-2. 공식 문서가 말하는 것 (2차 요약 아님 — 원문 직접 확인)

⚠️ 이 절의 앞 단계에서 `WebSearch` 요약이 *"effort는 지원되는 frontmatter 필드"* 라고 단정했는데, 출처를 열어 보니 **전부 FEATURE REQUEST 이슈**였다(#31536 · #65598 · #43083 · #39220 · #64033). 요약은 "요청됐다"를 "지원된다"로 뭉갠 것이다. 그래서 **문서 원문을 받아 파일로 저장한 뒤 grep** 하는 방식으로 전환했다. 아래는 그 원문 기준이다.

| # | 사실 | 출처 |
|---|---|---|
| ① | `effort`는 서브에이전트의 **정식 frontmatter 필드**다. 값은 `low`·`medium`·`high`·`xhigh`·`max`. 기본은 세션 상속 | `sub-agents` 문서 프론트매터 표 |
| ② | ⭐ **frontmatter effort는 그 서브가 활성인 동안 세션 레벨을 오버라이드한다.** 다만 **환경변수는 못 이긴다** | `model-config` §Set the effort level |
| ③ | ⭐ 우선순위 = **환경변수 `CLAUDE_CODE_EFFORT_LEVEL` > frontmatter > 설정 `effortLevel` > 모델 기본** | 〃 |
| ④ | Opus 5·Sonnet 5·Opus 4.8·4.7·Fable 5는 `low`~`max` **전 단계 지원**. Opus 4.6·Sonnet 4.6은 `xhigh` 없음(→ `high`로 강등) | `model-config` 모델×레벨 표 |
| ⑤ | **기본 effort는 모든 지원 모델에서 `high`** (예외: Opus 4.7만 `xhigh`) | 〃 |
| ⑥ | `--agents` 플래그 JSON도 같은 필드 세트를 받으며 `effort` 포함 | `sub-agents` §CLI |
| ⑦ | **에이전트 정의 워처** — `.claude/agents/`·`~/.claude/agents/`의 파일 추가·편집은 수 초 내 감지되어 *다음 위임부터* 반영, 재시작 불필요. 재시작이 필요한 경우는 둘: **(a) 세션 시작 시점에 없던 `agents` 디렉토리**, (b) `--disable-slash-commands`로 시작한 세션 | `sub-agents` §frontmatter 노트 |
| ⑧ | 동시 서브 한도 20(`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`로 변경, v2.1.217+). **ultracode 세션은 면제** | `sub-agents` §제한 |
| ⑨ | 모델 해석 순서 = `CLAUDE_CODE_SUBAGENT_MODEL` env → per-invocation `model` → frontmatter `model` → 메인 모델 | `sub-agents` §model |

**⇒ ②·③이 §D의 전제를 정면으로 부순다.** 문서상 frontmatter effort는 **작동해야 한다**.

### E-3. 환경 3층 실측 — 문서대로면 frontmatter가 이겨야 하는 상태였다

| 층 | 실측값 | 문서 우선순위 |
|---|---|---|
| `CLAUDE_CODE_EFFORT_LEVEL` (env) | **비어 있음** | 1위 — 비었으니 무효 |
| frontmatter `effort` | 프로브 ①에서 `low` | **2위 — 세션을 이겨야 함** |
| `~/.claude/settings.json` `effortLevel` | `xhigh` | 3위 |
| 모델 기본 | (Opus 5 → `high`) | 4위 |

> ⚠️ **자기 정정** — 메모리 「Claude Code effort 실측」에 내가 *"`CLAUDE_CODE_EFFORT`·`CLAUDE_CODE_EFFORT_LEVEL`은 존재하지 않는 변수명"* 이라고 박아 뒀는데 **틀렸다**. `CLAUDE_CODE_EFFORT_LEVEL`은 실재하는 공식 변수이고, 심지어 **frontmatter를 포함해 전부를 이기는 최상위 손잡이**다. 우연히 이 환경에 설정돼 있지 않았을 뿐이다. 「~~존재하지 않는다~~」와 「설정돼 있지 않다」는 전혀 다른 진술이고, 나는 후자를 보고 전자를 적었다.

### E-4. ⭐ 결정적 판별 — **이 세션의 정의 워처는 죽어 있다** (기계 증거)

§D-4가 *"결정적 판별법 = `model` frontmatter를 바꾸고 서브 트랜스크립트의 `model` 필드를 확인"* 이라고 예고했다. **그걸 실행했다.**

| 단계 | 조작 | 관측 |
|---|---|---|
| 1 | `qa.md`를 `model: claude-opus-5` → **`claude-sonnet-5`** 로 변경(+ `effort: low` + 평문 마커 `FRESHNESS-TOKEN: KIWI-7731`) | — |
| 2 | `qa` 스폰 (⚠️ 이때 내가 per-invocation `model: sonnet`을 얹어 **모델 신호를 오염시켰다** — 설계 실수) | `txModel=claude-sonnet-5` (판정 불가) · `EFFORT=xhigh` · `TOKEN=ABSENT` |
| 3 | **per-invocation 파라미터 없이** 재스폰 (깨끗한 조건) | ⭐ **`txModel=claude-opus-5`** · `effort="xhigh"` |

**디스크의 frontmatter는 `claude-sonnet-5`인데 실제 스폰은 `claude-opus-5`였다.** per-invocation도, `CLAUDE_CODE_SUBAGENT_MODEL`도 없었으므로 해석 순서(E-2 ⑨)상 frontmatter가 이겨야 했다. 이기지 못했다는 것은 **런타임이 디스크의 새 정의를 읽지 않았다**는 뜻이고, 이건 모델 자기보고가 아니라 **트랜스크립트에 기록된 기계 값**이다.

**⇒ 확정: 이 세션은 에이전트 정의를 세션 시작 시점으로 고정 보유하며, 이후 디스크 편집을 반영하지 않는다.**

부수적으로 이것이 `FRESHNESS-TOKEN` **3회 ABSENT**를 설명한다 — 모델이 자기 시스템 프롬프트를 못 읽은 게 아니라 **정말로 없었다**. 「모델 자기관찰이라 약한 증거」라고 유보했던 판단은 옳았고, 기계 증거가 같은 방향으로 확정해 줬다.

> ⚠️ 원인은 아직 모른다. 문서(E-2 ⑦)가 든 재시작 필요 조건 둘 다 이 세션엔 해당하지 않는다 — `.claude/agents/`는 세션 시작 전부터 존재했고, 슬래시 커맨드도 정상 동작한다. 남은 후보는 **Windows 파일 워처의 한계**, **장수·다중 compact 세션의 상태 유실**, **v2.1.220 버그** 셋이다. 재현 조건을 좁히는 건 다음 창의 일이다.

### E-5. 새 판독구 — 트랜스크립트 `effort` 필드 ⭐

이번에 처음 관측한 것이다. 서브 트랜스크립트의 **모든 `assistant` 줄에 `effort` 필드가 최상위로 기록된다**:

```
~/.claude/projects/<proj>/<session>/subagents/agent-<id>.jsonl   → 각 assistant 줄의 .effort
~/.claude/projects/<proj>/<session>/subagents/agent-<id>.meta.json → {agentType, model(per-invocation), spawnDepth, ...}
```

이로써 effort 판독구가 **셋**이 됐고, 서로 독립적으로 교차 검증된다:

| 판독구 | 성질 | 시점 |
|---|---|---|
| `CLAUDE_EFFORT` env | 런타임이 Bash에 주입 (강등 후 값) | 실행 중 |
| 훅 payload `effort.level` | 훅 컨텍스트 | 도구 이벤트마다 |
| ⭐ **트랜스크립트 `.effort`** | **사후 감사 가능 · 스폰 전수 일괄 조회** | 사후 |

세 번째가 특히 값지다 — **과거 스폰 전부를 소급 조회**할 수 있다. 이번에 이 세션의 서브 6건을 한 번에 훑어 전원 `"xhigh"`임을 확인했다. `meta.json`의 `spawnDepth: 1`도 함께 찍혀 **런타임 중첩 OFF의 기계 증거**로도 쓸 수 있다.

부수 확정: **별칭 `sonnet` → `claude-sonnet-5`로 해석된다**(2단계 meta에서 확인). 별칭 `opus`가 4.8로 풀리는 것([[verify-lens-agents-use-opus]])과 **대칭이 아니다** — 별칭의 해석은 모델 계열마다 다르므로 **full ID 규범은 그대로 유지**한다.

### E-6. ⭐ 최종 판정 (§D-1·D-2를 대체)

**프로브 ①은 무효였다.** `effort: low`는 런타임에 도달한 적이 없다. 따라서:

1. **「frontmatter effort는 세션을 못 이긴다」는 명제는 실측된 바 없다.** §D는 *증거 없음*을 *부재의 증거*로 읽었다.
2. 공식 문서는 **이긴다**고 명시하고(E-2 ②), 환경 3층 실측도 그 조건을 충족한다(E-3). **드롭할 근거가 사라졌다.**
3. **⇒ effort 도입을 원안대로 진행한다** — `reviewer` · `plan-auditor` · `chief-tech-operator`에 `effort: xhigh`.
4. **영호 결정("메인 xhigh + 나머지 기본")은 달성 가능하다.** 손잡이가 `effortLevel` 하나뿐이라던 D-1의 전제가 틀렸다. 실제 구조는 이렇다:

| 원하는 것 | 수단 |
|---|---|
| 메인 xhigh | `~/.claude/settings.json` `effortLevel: xhigh` (현행 유지) |
| 특정 서브만 상향/하향 | **그 역할의 frontmatter `effort`** |
| 워크플로 스테이지별 | `Workflow`의 `agent(prompt, {effort})` (C-5에서 실측 확인) |
| 전 세션 강제(비상 손잡이) | `CLAUDE_CODE_EFFORT_LEVEL` env — **frontmatter까지 무력화**하므로 상시 사용 금지 |

> 영호의 질문 *"이럴거면 main session을 강제로 default 값으로 써야 하는 거잖아"* 에 대한 답: **아니다. 메인을 낮출 필요 없다.** 그 결론은 D-1의 잘못된 전제에서 나온 것이었고, 문서가 설계한 방식은 정확히 그 반대 — **메인은 세션 레벨로, 서브는 각자 frontmatter로** 정한다.

5. ⚠️ **단, 완료 검증은 이 세션에서 할 수 없다**(E-4). 검증은 **새 세션에서** 트랜스크립트 `.effort` 판독으로 한다 → **P11 발화 프로브에 편입**.

### E-7. 파급 — 이 창에서 고친 에이전트 정의는 **전부 다음 세션부터 발효**한다

E-4가 확정한 사실의 사정거리는 effort보다 훨씬 넓다. **이 세션에서 편집한 `.claude/agents/**` 전건이 현 세션에는 미반영이다**:

- P02의 모델 full ID 전환(`opus` 별칭 → `claude-opus-5` 등)
- P03의 `disallowedTools: Agent` · `maxTurns` · `color` 신규 프론트매터
- P03의 `coordinator` Agent 반납 — ⚠️ **현 세션의 coordinator는 여전히 옛 정의로 뜬다**
- (`chief-tech-operator`는 *이전* 세션에서 생성됐으므로 목록에는 정상 등재돼 있다)

**⇒ P11 완료 조건에 반영할 것**: 하네스 에이전트 정의를 건드린 창의 검증은 **반드시 세션을 새로 열고** 수행한다. 같은 세션에서 확인하면 **거짓 음성(고쳤는데 안 고쳐진 것처럼 보임)** 이 나온다. 이건 이번 창에 국한된 사고가 아니라 **상시 절차 규범**이다.

### E-8. 남은 미결 (정직 선언)

- **워처가 죽은 원인** — 재현 조건 미상(E-4 각주). 다음 창.
- **frontmatter effort의 라이브 발효 확인** — 새 세션에서 트랜스크립트 `.effort` 판독. P11.
- **`effort` 프론트매터의 min-version** — `sub-agents` 문서의 해당 행에 min-version 주석이 없어 도입 버전을 특정하지 못했다. v2.1.220에서 파서가 값을 검증한다는 것(§A-3)까지만 확정.
