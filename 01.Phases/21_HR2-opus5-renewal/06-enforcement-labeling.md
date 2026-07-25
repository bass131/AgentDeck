---
owner: 영호
milestone: HR2
phase: 06
title: 검증 구조 3분류 재편 + 강제 출처 라벨링 + CORE-13
status: done
grade: 대규모
risk: harness
loop_track: human-gate
estimated: 5~7h
domain: cross
summary: 공식 가이드가 "검증 서브에이전트 지시를 제거하라"고 권고한다 — 자기검증 독려는 삭제, 컨텍스트 밖 실측과 규율 축은 유지하되 근거를 재서술하고, 각 규칙에 강제 출처를 라벨링한다. 실측 결과 ①자기검증 독려는 공집합이었고, 하네스 규칙 대부분이 문서 규범임이 드러났다.
---

# Phase 06: 검증 구조 3분류 재편 + 강제 출처 라벨링 + CORE-13

> **상태**: done
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness)
> **담당**: 메인 직접

---

## 🎯 목표

하네스의 각 규칙이 **무엇으로 강제되는지**를 문서에 명시한다. 끝나면 "이 줄을 지우면 무엇이 사라지는가"를 읽는 사람이 즉시 안다.

**왜 삭제가 아니라 라벨링인가**: 초안은 "Opus 5는 자가 검증하니 비용 축 독려 문구를 지워도 안전"이었으나 적대 검증에서 **REFUTED**됐다. 실측:
- `plan-auditor`는 `.claude/hooks/**` 참조 **0건** — 순전히 문서 문구
- `reviewer-auto-trigger.sh:3-4`는 스스로 *"차단/자동호출 아님"* advisory 선언
- 회귀 게이트 **실행**을 강제하는 훅 없음(Stop 훅 부재). `supervisor-guard.sh:112-117`은 "메인이 돌리지 마라"만 강제 — **비대칭**
- 실제 기계 강제는 **TDD 하나**(+복잡 이상 `-DONE.md`의 AC 증적)
- → "규율 축을 보존한다" = "그 문구를 보존한다"와 동의어. 어휘상 '검증 독려 문구'와 구분 불가
- → 순수 비용 축은 **3줄뿐**(`work-plan/SKILL.md:126`·`review-tiering.md:15`·`main-process.md:38`). 이득 3줄 vs 오삭제 위험 20곳 이상

---

## 🔀 검증 구조 3분류 재편 (영호 2026-07-25 — 공식 가이드 실측 후 추가)

### 공식 권고 원문

**[출처]** `platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5`

> **Task scope and over-verification**
> *"Claude Opus 5 verifies its own work without being told to. If your prompt contains explicit verification instructions ('include a final verification step for any non-trivial task,' **'use a subagent to verify'**), remove them: instructions like these cause over-verification on Claude Opus 5, and removing them reduces wasted tokens with no loss in quality. **The same applies to legacy harness scaffolding that adds separate verification steps.**"*

> **Controlling subagent spawning** (권장 프롬프트 예시)
> *"… **Do not use subagents to verify or double-check your own work.** If one subagent can complete the task, use one rather than several, and keep spawn counts low."*

> **Self-correction**
> *"Avoid instructing re-checks it already performs ('double-check your answer,' 're-verify before responding'); like verification instructions, these compound with the model's own behavior and add cost without improving results."*

**우리 하네스가 바로 그 "legacy harness scaffolding"이다.** 그러나 같은 문서는 반대편도 명시한다:

> **Multi-agent coordination**: *"Claude Opus 5 coordinates teams of subagents well, with **effective writer-verifier patterns** …"*

모순이 아니라 **구분**이다 — 금지된 것은 *"자기 작업을 자기가 서브 띄워 재확인"*이고, *"쓰는 역할과 보는 역할이 애초에 분리된 파이프라인"*은 유효하다고 적혀 있다.

### 실측 반례 (2026-07-25, 이 마일스톤 자체에서 발생)

plan-auditor가 Phase 정의 12개에서 **결함 8건**을 잡았고, 그중 2건은 실행 시 **세션이 자기 권한을 잠가 창 안에서 못 빠져나오는** 사고였다(`settings.json` 파생물 오인 / `GATE_FLAG` 일원화). 메인은 Opus 5였고 자기 검증으로 못 잡았다.

**왜 못 잡았나** — 그 결함들은 메인이 **읽지 않은 파일**(`OPEN-GATE.bat`·`ADR-028`·`execution-owner.md`의 [예외] 절)에 있던 사실이었다. **자기 검증은 자기가 아는 것 안에서만 작동한다.** 컨텍스트 밖 재료를 긁어오는 것은 검증이 아니라 별개의 작업이다.

### 3분류 판정 규칙

| 분류 | 정의 | 예 | 처리 |
|---|---|---|---|
| **① 자기검증 독려** | 모델에게 *자기* 작업을 다시 보라고 시키는 문구 | "마지막에 검증 단계를 넣어라", "다시 확인해라", "재검토 후 응답" | **삭제** — 공식 권고 직접 적용. 과잉 검증 + 토큰 낭비 |
| **② 컨텍스트 밖 실측** | 메인이 안 읽은 재료를 가져오는 에이전트 | plan-auditor(전 파일 대조)·Explore·secretary 실측 심부름 | **유지** — 자기 검증으로 대체 불가(위 반례) |
| **③ 규율 축** | 작성자≠승인자를 강제하는 구조 | reviewer 호출·self-pass 금지·게이트 출력 박제 | **유지 + 근거 재서술** |

### ③의 근거 재서술이 이 절의 핵심

현재 문서들은 규율 축의 근거를 **"모델이 실수하니까"**로 적어 뒀다. 그 근거는 공식 권고와 정면 충돌하며, 이제 약하다. **"이해충돌 방지(작성자≠승인자) + 컨텍스트 밖 실측"**으로 바꿔야 충돌 없이 살아남는다.

- [ ] 대표 사례 — `subagent-routing.md:120` *"상향 모델도 실수 0을 보장하지 않으므로 검증을 생략하지 않습니다"*
  → 근거가 "능력 부족"이라 공식 권고에 직격당한다. **"검증자는 능력이 아니라 위치가 다르다 — 작성자는 자기 전제를 의심하지 못하고, 자기가 읽지 않은 파일을 알지 못한다"**로 재서술
- [ ] 삭제 금지 목록(아래 §)의 각 항목에 대해 ①②③ 중 무엇인지 **판정을 붙인다**. ①로 판정된 것이 있으면 그건 삭제 대상으로 옮긴다

---

## 🗺️ 강제 출처 전수 지도 (실측 2026-07-25 — 정책 12개 범례가 참조하는 정본)

### 층 1 — 차단(`exit 2`)하는 훅은 **4종뿐**

| 훅 | 무엇을 차단하나 | 근거 |
|---|---|---|
| `supervisor-guard` | ① 하네스 봉인(Edit/Write + Bash 우회 쓰기) ② 실행 경계(02.Source·tests 편집 / git add·commit / 회귀 게이트) ③ OpenGate 실행 | `exit 2` 3곳 |
| `dangerous-cmd-guard` | 파괴 명령(rm -rf·git reset --hard·force push·clean·포맷) | `exit 2` 5곳 |
| `tdd-guard` | 실패 테스트 없는 구현 편집 | `exit 2` 3곳 |
| `phase-gate-validator` | `gate_version: 1` 완료 보고의 엄격 검증 | `exit 2` 2곳 |

### 층 2 — 알림만(`exit 0`) 하는 훅은 **5종**

`pin-injector`(work-pin 주입) · `risk-detector`(깃발 환기) · `circuit-breaker`(변이 폭주 경고 — ⚠️ Edit|Write만 감시) · `reviewer-auto-trigger`(**스스로 "차단/자동호출 아님" 선언**) · `convention-size-guard`(코드 800줄 God class 경고 — **`.md` 문서는 대상 아님**)

### 층 3 — `permissions` (settings.SEALED.json)

`deny` **16줄**(하네스 봉인 10 + 시크릿 3 + 네트워크 2 + CLAUDE.md 1) · `ask` **6줄**(push·PR create/merge·release·package·publish) · `allow` 24줄.

### ⇒ 결론: 하네스 규칙의 **대부분이 문서 규범**이다

| 규칙 | 강제 출처 |
|---|---|
| 하네스 봉인 | `[기계]` settings deny + supervisor-guard ① |
| 실행 경계(코드·테스트·커밋·게이트) | `[기계]` supervisor-guard ② |
| 파괴 명령 금지 | `[기계]` dangerous-cmd-guard |
| TDD 선행 | `[기계]` tdd-guard |
| `-DONE.md` 완료 보고 형식 | `[기계]` phase-gate-validator |
| 비가역(push·PR·merge·release) | `[기계]` settings ask |
| **reviewer 무조건 호출** | ⚠️ `[문서 규범]` (+ 알림 1종) |
| **plan-auditor 호출** | ⚠️ `[문서 규범]` — **훅 참조 0건** |
| **회귀 게이트 *실행*** | ⚠️ `[문서 규범]` — Stop 훅 부재 |
| **등급 상향 기재** | ⚠️ `[문서 규범]` (+ risk-detector 알림) — 하류 게이트의 **상류 스위치** |
| **문서 220/350줄 세분화** | ⚠️ `[문서 규범]` — 재는 훅 없음(800줄 훅은 코드 대상) |
| **판단형 버킷 (c)** (설계분기·IPC bump·스키마 마이그) | ⚠️ `[문서 규범]` — attended 전제가 유일 |
| **졸업 불가 목록** | ⚠️ `[문서 규범]` |
| **5단계 보고 구조·조판** | ⚠️ `[문서 규범]` (그릇만 기계) |
| **스폰 규범 상한** | ⚠️ `[문서 규범]` — ultracode 세션은 런타임 동시 한도 면제라 **유일 브레이크** |

**비대칭이 이 Phase의 핵심 발견이다.** 기계는 *하지 말 것*(봉인·파괴·비가역)을 잘 막지만, *해야 할 것*(리뷰 호출·게이트 실행·등급 기재)은 거의 강제하지 않는다. 그래서 후자를 서술한 문장들이 곧 방어선이다.

---

## 🔀 3분류 판정 결과

| 분류 | 판정 | 처리 |
|---|---|---|
| **① 자기검증 독려** | ⭐ **0건 — 공집합** | 삭제할 것이 없었다 |
| **② 컨텍스트 밖 실측** | plan-auditor · Explore · secretary 실측 심부름 | 존치 |
| **③ 규율 축** | reviewer 무조건 호출 · self-pass 금지 · 게이트 출력 박제 · attended 전제 · 졸업 불가 · 등급 상향 기재 | 존치 + **근거 재서술 1건** |

**① 공집합의 근거**: 공식 권고가 지우라는 것은 *"최종 검증 단계를 넣어라"*·*"검증용 서브를 띄워라"*·*"다시 확인해라"* 류의 **일반적 자기검증 독려**다. 전수 grep(`다시 확인|재확인하|재검토 후|double-check|스스로 검증|자기 검증|한 번 더 확인|최종 검증 단계|검증 단계를 넣|verify|재점검|self-check|셀프체크`)에서 걸린 것은 셋뿐이었고 **셋 다 ①이 아니었다**:

- `CLAUDE.md`의 *"Phase에서 이미 해결된 건 **재확인하지 않는다**"* — 오히려 **반대 방향**(공식 권고와 같은 편)
- `execution-owner.md`의 *"검증은 게이트·셀프체크가 소유"* — 축 분리를 설명하는 **구조 서술**
- `execution-owner.md`의 *"커밋 전 `git status` 셀프체크"* — 일반 독려가 아니라 **구체적 절차**이고 `git add .` 금지(CORE-07)의 짝

⇒ *"legacy harness scaffolding을 제거하라"* 는 권고는 이 하네스에 **적용할 대상이 없었다**. 초안이 "삭제"로 출발했다가 영호 결정으로 "라벨링"으로 튼 것이 실측으로 지지된 셈이다.

**③ 근거 재서술 (1건)** — `subagent-routing.md` §5.5:
- 옛 근거: *"상향 모델도 **실수 0을 보장하지 않으므로** 검증을 생략하지 않습니다"* → 공식 권고에 직격당하고, 모델이 좋아질수록 약해진다.
- 새 근거: *"검증자가 필요한 이유는 더 똑똑해서가 아니라 **작성자는 자기 전제를 의심하지 못하고 자기가 읽지 않은 파일을 알지 못하기** 때문"* → 모델 성능과 **독립**.
- 실증 2건을 같은 창에서 확보: (a) P05 reviewer가 잡은 🔴 4건 중 하나는 **작성자가 그 창에서 직접 만든 회귀**였고 작성자 시야에선 *"오탐 해소 ✅"* 로만 보였다. (b) plan-auditor가 잡은 결함 2건은 메인이 **읽지 않은 파일**에 있었다 — 검증이 아니라 별개의 실측 작업.

> 나머지 "실수" 표현 전수 확인: `grade-and-risk.md`의 *"한 줄 실수가 renderer에 Node 권한 누수"* 는 **위험 설명**, 각 `agents/*.md`의 `## 자주 하는 실수` 는 **역할별 함정 목록**이다. 둘 다 "모델이 실수하니 검증한다" 취지가 아니므로 재서술 대상이 아니다.

---

## 🖥️ 응대 규범 — 시스템 프롬프트 대조 결과 (착수 시 수행)

| 규범 | 런타임 시스템 프롬프트 | 조치 |
|---|---|---|
| 범위 규율("조용히 좁히거나 넓히지 않는다") | **있음** (거의 동일 문장) | **기재 안 함** |
| 정정 절제("판단을 바꾸지 않는 오류는 정정 선언 안 함") | **있음** | **기재 안 함** |
| 반복 제거("확립된 사실 재유도·미추구 선택지 나열 금지") | **있음** | **기재 안 함** |
| 멘토링(친절·용어 풀어쓰기·trade-off·완성 문장) | 없음 | CORE-13 ①~④ **존치** |
| 응대 톤(Pair Programmer 반말체) | 없음 | CORE-13 **⑤로 신설**(v2) |

⇒ **중복 기재 0건.** 넣으려던 3건이 이미 런타임에 있었다 — 적었다면 상주 예산만 먹고 *"Then: Repeat yourself"* 안티패턴이 됐다.

---

## ⏪ 사전 조건

- [x] P03 완료 (역할 재편이 끝나야 라벨 대상이 확정)
- [x] OpenGate 개방

---

## 📝 작업 내용

- [x] **강제 출처 판정 절차 확립** — 각 규칙 문구에 대해 ① `.claude/hooks/**` grep ② `settings.json` permissions 매처, 두 곳 중 하나라도 걸리면 "기계 강제", 둘 다 0건이면 **"문서 규범 전용"**
- [x] 판정 결과를 각 정책 문서에 **라벨로 표기**(예: `[기계: supervisor-guard]` / `[문서 규범 전용]`)
- [x] **라벨 대상 = `.claude/policies/*.md` 전수**(현 12개) — "주요 문서"처럼 모호하게 두면 완료 판정이 불가능하다. 각 파일에 **최상단 범례 1개 + 규칙 단위 라벨 ≥1개**를 최소 기준으로 한다
- [x] ⚠️ **인용은 행 번호가 아니라 앵커 문구로** — 아래 `execution-owner.md:16,63`·삭제 금지 목록의 행 번호는 P02·P03이 같은 파일을 재편한 뒤 **이미 밀려 있다**. 실행 시 문자열 grep으로 재확인할 것
- [x] ⚠️ **`execution-owner.md:16,63` 오분류 정정** — plan-auditor·reviewer를 "역할 무관 기계 게이트"로 표기하고 있다. 이 표를 지도 삼아 삭제 범위를 정하면 **반드시 오삭제**하므로 표 자체가 정정 대상
- [x] **삭제 금지 목록 명시** (기계 강제 0건 + 유일 방어선) — **9항 전부 ③(규율 축)으로 판정, 전량 존치**. ①로 재분류된 항목은 **없다**. 각 항목 옆 괄호가 판정 근거:
  - `loop-driver.md:63` · `work-run/SKILL.md:72` (게이트 출력 트랜스크립트 박제 — 단순·보통 등급에서 게이트가 실제로 돌게 만드는 유일 장치)
  - `work-judge.md:43-44` + `CLAUDE.md:93` (attended 전제 = 버킷 (c) 물리 강제의 근거)
  - `grade-and-risk.md:59,67-69` (등급 상향 수동 기재 — `phase-gate-validator` 발화의 상류 스위치)
  - `CLAUDE.md:56` (claude-api 미참조 금지)
  - `grade-and-risk.md:52`·`CLAUDE.md:50` (양쪽 typecheck green — 어떤 훅도 typecheck를 실행하지 않음)
  - `review-tiering.md:32,47-50,77` · `subagent-routing.md:79-83,136` (reviewer·plan-auditor 무조건 호출 + 키 누락 시 종료)
  - `work-run/SKILL.md:98,107` (reviewer self-pass 금지)
  - `review-throughput.md:20-27` §2 (졸업 불가 목록) · `:54` (자기평가 편향 실측 전례)
  - `subagent-routing.md:120` (**"상향 모델도 실수 0을 보장하지 않으므로 검증을 생략하지 않습니다"** — 하네스가 이번 주장을 이미 선제 기각해 둔 문장)
- [x] (선택) 순수 비용 축 3줄 처리 — 삭제해도 무방하나 이득이 작다. 라벨링만으로 종료 가능
- [x] **spawn cap = 런타임 한도 사실 등재** — "신설"이 아니다. 런타임에 이미 3중(세션 200 / 동시 20 / 중첩 0). 기존 등급표의 "Worker 3~4"를 **규범 상한으로 승격**. ⚠️ **ultracode 세션은 동시 한도 면제** → 그땐 규범 상한이 유일 브레이크임을 명시
- [x] **응대 규범 — ⚠️ 넣기 전에 "이미 있는가"부터 확인한다**
  - 🔴 **실측(2026-07-25): 넣으려던 규범 상당수가 Claude Code 시스템 프롬프트에 *이미* 들어와 있다.** 공식 가이드가 권하는 문구 — *"Deliver what was asked, at the scope intended … rather than quietly narrowing, widening, or transforming it"*(범위 규율), *"Only correct an earlier statement when the error would change the user's code, conclusions, or decisions"*(정정 절제) — 가 현 세션 시스템 프롬프트에 거의 같은 문장으로 존재한다
  - → CLAUDE.md에 또 쓰면 블로그가 지적한 **"Then: Repeat yourself"** 안티패턴에 우리가 걸린다. **중복 항목은 넣지 않는다**
  - [x] 착수 시 시스템 프롬프트를 먼저 확인하고, **거기 없는 것만** CLAUDE.md/CORE-13에 남긴다
  - ⚠️ **"짧게 써라"로 쓰지 않는다** — 기존 "완성된 한국어 문장·함축/전보체 금지"와 정면 충돌. *"서론·중복 요약·이미 말한 것의 재진술을 넣지 않는다"*로 표현해 **문장 완성도는 유지하고 반복만 걷어낸다**
- [x] **CORE-13 동기화 — 이미 선반영된 1줄 처리** (영호가 2026-07-25에 CLAUDE.md 직접 편집)
  - CLAUDE.md 응대 원칙에 **"응대 톤 — 같이 작업을 논의하고 수행하는 친근한 친구같은 Pair Programmer이자 Pair Architect Engineer로 응대 (반말체)"** 1줄이 **이미 들어가 있다**
  - 즉 P06의 실제 잔여 작업은 "새 규범 추가"가 아니라 **CORE-13 쪽을 여기에 맞추는 것**이다. 새로 쓰면 중복 서술이 생긴다
  - ⚠️ 의미 정본은 `CLAUDE.md`가 아니라 **`00.Documents/harness/CORE.md`(CORE-13)** → **조항 버전 상향 + `core-manifest.json` + `AGENTS.md` 3점 동기화** 필요(`CORE.md:6` 개정 규칙)

---

## ✅ 완료 조건

- [x] **3분류 판정이 전 항목에 부여됨** — 검증 관련 문구 각각이 ①자기검증 독려 / ②컨텍스트 밖 실측 / ③규율 축 중 무엇인지 표에 기록
- [x] **①로 판정된 문구 = 삭제 완료**, ②③ = 존치
- [x] **③의 근거가 전부 재서술됨** — `grep -rn "실수\|실수 0\|틀릴 수 있"` 결과에 "모델이 실수하니까 검증한다" 취지의 서술 **0건**(대신 "위치가 다르다·컨텍스트가 다르다"로)
- [x] `execution-owner.md:16,63`에 plan-auditor·reviewer가 기계 게이트로 표기된 서술 **0건**
- [x] 삭제 금지 목록 9항이 **3분류 판정을 거친 뒤** 존치 항목은 원문 그대로 존재(diff로 확인)
- [x] 응대 규범 중 **시스템 프롬프트와 중복되는 항목 0건**(착수 시 대조 결과를 기록)
- [x] `.claude/policies/*.md` **전수(12개)**에 범례 1개 + 규칙 라벨 ≥1개 — 미부착 파일 0
- [x] CORE-13 변경 시: 조항 버전 · `core-manifest.json` · `AGENTS.md` 3자 동기 + `npm run test` green(conformance)
- [x] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0

> **게이트 실측 (2026-07-25 마감)** — `typecheck` 0 · `test` **395 files / 5,330 pass**(6 skipped = live probe, conformance 포함 green → CORE-13 v2 3점 동기 검증됨) · `lint` 0 · `test:hooks` **83/83 pass**.
>
> **완료 조건 (3) 판정 근거**: `실수 0|실수하니|틀릴 수 있` 전수 grep 잔존 **1건**은 `subagent-routing.md:148`이며, 이는 *"옛 근거가 이랬는데 왜 바꿨다"*를 설명하는 **경위 인용**이다. "모델이 실수하니까 검증한다" 취지의 **주장**은 0건 — 인용을 남긴 이유는 다음 점검이 같은 논거로 되돌리지 않게 하기 위해서다.

---

## 📚 학습 포인트

- **기계 강제 vs 문서 규범** — 같은 문장이라도 훅이 받쳐주면 게이트, 아니면 권고다. 이 구분 없이 문서를 "정리"하면 안전장치가 사라진다.
- **자기 지도의 오류** — 하네스가 "무엇이 기계 강제인가"를 스스로 잘못 적어 두면, 그 지도를 믿고 한 정리가 그대로 사고가 된다.
- **모델 성능 향상이 규율을 대체하지 못하는 이유** — 규율 축은 "능력"이 아니라 "이해충돌"(작성자≠승인자)을 다룬다. 더 똑똑한 모델도 자기 작업의 심판이 될 수는 없다.

---

## ⚠️ 함정

- **`execution-owner.md` 표를 근거로 삭제 범위 정하기** — 그 표가 틀렸다.
- **"비용 축"처럼 읽히는 문서 제목에 속기** — `review-throughput.md`(처리량=비용)에 자기평가 편향 실측 전례가 들어 있다.
- **응대 규범을 CLAUDE.md에만 고치기** — 의미 정본은 CORE-13. 3점 동기화를 놓치면 conformance가 깨진다.

---

## 담당 SubAgent

**메인 직접**. 강제 출처 grep 전수는 `secretary` 위임 가능(판정은 메인).
