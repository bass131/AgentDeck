---
owner: 영호
milestone: HR2
phase: 04
title: effort 도입 — 메인 세션 + CTO만 xhigh (품질 프로브 게이트)
status: pending
grade: 보통
risk: harness
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: 공식 가이드가 "네 평가로 effort sweep을 다시 돌려라"라고 권고한다 — 토큰 차이가 아니라 품질로 판정하고, xhigh는 메인 세션과 chief-tech-operator에만 준다.
---

# Phase 04: effort 도입 — 메인 세션 + CTO만 xhigh (품질 프로브 게이트)

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 보통 (risk: harness)
> **담당**: 메인 직접

---

## 🎯 목표

`effort`를 **실효가 확인될 때만** 도입한다. 이 Phase는 기능 추가가 아니라 **게이트**다 — 프로브가 실효를 못 보이면 도입을 드롭하고 그 사실을 기록하는 것이 정상 종료다.

**왜 게이트인가**: CHANGELOG 이력상 effort는 도입 → no-op 실측 → 제거 → 재도입 → 2026-07-17 최종 제거를 거친 **다섯 번의 뒤집기** 끝에 지금 0파일이다(실측 2026-07-25: `.claude/**`의 정책·에이전트 문서에 effort **0건**). 문서만 근거로 여섯 번째를 넣으면 다음 점검이 또 "장식"이라며 뺀다.

---

## 📐 배분 결정 (영호 2026-07-25 — 공식 가이드 확인 후 1차 결정 정정)

| 대상 | effort | 근거 |
|---|---|---|
| **메인 세션** | `xhigh` | 판단·조율·위임의 최상단 |
| **`chief-tech-operator`** | `xhigh` | 설계 분기 자문·막힌 문제 진단 = *"demanding … agentic work"* |
| 나머지 9역할 (Worker·판정 렌즈·secretary·qa) | **미지정(기본 `high`)** | 아래 공식 근거 |

⚠️ **1차 결정("판정 렌즈만 xhigh")을 뒤집었다.** 근거는 공식 가이드가 판정 렌즈 계열을 명시적으로 반대 방향으로 안내하기 때문이다 — 아래 §공식 근거 ③.

---

## 📖 공식 근거 (2026-07-25 브라우저 실측 — 2차 요약 아님, 원문 직접 확인)

**[출처 A]** `platform.claude.com/docs/en/build-with-claude/effort` — Recommended effort levels for Claude Opus 5

> ① *"Start with **high, the default**, and adjust based on your evals … use low and medium **liberally** as your primary control for token cost and response time wherever your evals show quality holds, and **step up to xhigh for demanding coding and agentic work**. **If you carried effort settings over from an earlier model, run a fresh effort sweep on your evals rather than reusing them.**"*

> ② *"**Effort controls thinking volume, not visible response length**: on Claude Opus 5, changing effort does not reliably shorten responses, so prompt for length instead."*

**[출처 B]** `platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5` — Capability improvements

> ③ **Code review and bug-finding**: *"… **Accuracy holds at lower effort settings**, which supports a fast pass at review time and a more thorough pass later."*
> → **판정 렌즈(reviewer·plan-auditor)에 xhigh를 주지 않는 직접 근거.**

> ④ *"If your review prompt says 'only report high-severity issues' or 'be conservative,' the model may follow that instruction literally and report less; ask it to report everything and filter in a separate pass instead."*
> → 실측 결과 우리 문서엔 해당 문구 **0건**(reviewer.md·plan-auditor.md·review-tiering.md·review-throughput.md grep). **회귀 감시 대상으로만 등재.**

**[반증된 2차 자료]** 트위터 발 *"Opus 5는 effort를 높이면 코딩 능력이 떨어진다"*(AGIラボ/@ctgptlb, 2026-07-25)는 **근거가 약해 채택하지 않는다**:
- 트윗 본문에 근거 링크·수치 없음
- 출처로 추정되는 FrontierCode v1.1 분석은 **자체 disclosure에서** 방법론·태스크셋·평가 하네스가 독립 검증되지 않았고 공개 저장소·논문이 없다고 밝힘. 점수 대부분이 근사치이고 **high와 medium 차이가 "근사 오차 범위 안"**
- 기술적 오류: 그 글은 *"Anthropic API에서 effort는 thinking의 `budget_tokens`로 제어"*라고 쓰는데 **틀렸다**. effort는 `output_config.effort`이고 `budget_tokens`는 Opus 5에서 **400 에러로 거부**된다
- → 공식 입장은 "높이면 나빠진다"가 아니라 **"low/medium이 효율적이니 네 평가로 재보라"**이다

---

## ⏪ 사전 조건

- [ ] P03 완료 (10역할 확정 — 어느 역할에 넣을지가 정해져 있어야 함)
- [ ] **OpenGate 개방** — 도입 시 `.claude/agents/**` frontmatter를 편집하므로 봉인 대상이다(영호 단독 실행)

---

## 📝 작업 내용

### ⚠️ 선결 실측 — 메인 세션 effort는 어디서 정하는가

**frontmatter는 서브에이전트 전용이다.** 메인 세션을 xhigh로 두려면 다른 지점을 써야 하는데, 그 지점이 아직 미확인이다.

- [ ] 후보 조사: `/effort` 슬래시 명령 · `.claude/settings.json` · 환경변수 `CLAUDE_CODE_EFFORT_LEVEL` · CLI 플래그. 정본 = `code.claude.com/docs/en/model-config`
- [ ] ⚠️ **환경변수는 frontmatter를 이긴다**(우선순위: 환경변수 > frontmatter > 세션 > 모델 기본). 메인을 환경변수로 고정하면 **서브 9역할의 기본 high까지 xhigh로 덮어써질 수 있다** → 배분 자체가 무너진다. 설정 지점을 고르기 전에 **우선순위 실측이 필수**
- [ ] 세션마다 수동 지정이 필요한 방식이면, 그 절차를 `session/start.md`에 1줄로 박아 매 세션 재현되게 한다

### 판정 기준을 **프로브 전에** 고정한다

측정량·표본·판정선을 사후에 정하면 어떤 결과든 정당화된다 — 이 저장소가 effort를 다섯 번 뒤집은 메커니즘이 정확히 그것이다.

- [ ] **① 측정량 3종**
  - ⓐ 세션 헤더의 effort 표기 문자열 — *effort가 전달됐는가*
  - ⓑ thinking 토큰 수 — *effort가 동작했는가*
  - ⓒ **동일 과제 산출물의 결함 수** — *effort가 값을 했는가* ← **판정의 본체**
- [ ] ⚠️ **ⓐ·ⓑ만으로 도입을 결정하지 않는다.** 출처 A②가 못박듯 effort는 사고량을 바꿀 뿐 출력 길이를 바꾸지 않으므로, **토큰이 갈리는 것은 "동작한다"의 증거일 뿐 "좋아진다"의 증거가 아니다.** 1차 초안의 "thinking 토큰 2배 차이 → 도입"은 이 점에서 틀린 판정선이었다
- [ ] **② 표본** — 동일 프롬프트·동일 에이전트로 `high`(기본) vs `xhigh` 각 1회. 과제는 **결함을 셀 수 있는 것**으로 고정(예: 의도적 결함을 심은 Phase 문서 초안을 주고 결함 지적 수를 센다)
- [ ] **③ 판정선** — ⓐ가 갈리고 **동시에** ⓒ에서 xhigh가 **더 낫거나 최소한 동등** → 도입. xhigh가 **더 나쁘거나 차이 없으면 → 드롭**(비용만 늘기 때문)
- [ ] **④ 무효 조건** — `CLAUDE_CODE_EFFORT_LEVEL`이 존재하면 frontmatter를 이기므로 **프로브 자체가 무효**. 실행 전 부재를 확인하고 원장에 기록

### 실행

- [ ] **라이브 A/B 프로브 1회** — 위 ②의 표본대로 실행. 세션 헤더 육안 확인 병행
- [ ] **판정** — ③의 판정선에 대입:
  - 성립 → 도입 진행
  - 불성립 → **도입 드롭** + CHANGELOG에 반전 항목 기록("공식 문서는 지원한다고 하나 우리 워크로드에선 실효 없음 — 재시도 금지 근거")
- [ ] (도입 시) **메인 세션** = xhigh(선결 실측이 정한 지점) · **`chief-tech-operator`** = `effort: xhigh` frontmatter
- [ ] (도입 시) 나머지 9역할은 **effort 키를 아예 쓰지 않는다** — 기본이 high이므로 명시가 불필요하고, 명시하면 다음 모델 세대에서 또 stale이 된다

### 낡은 기록 정정 (도입/드롭 무관하게 수행)

- [ ] `00.Documents/reviews/2026-07-17-harness-review-all.md:92`
- [ ] `00.Documents/reports/next/NEXT-하네스-개선-핸드오프.md:64`
- [ ] **글로벌 메모리 `claude-code-effort-precedence.md`(+`MEMORY.md`)** — "frontmatter effort는 no-op(2026-07-03 실측)"으로 박제돼 있다. 매 세션 주입되므로 stale이면 계속 잘못된 방향으로 유도한다
- [ ] 프로브 결과를 `01.Phases/21_HR2-opus5-renewal/04-effort-probe-log.md`에 원장으로 남긴다

---

## ✅ 완료 조건

- [ ] **메인 세션 effort 설정 지점이 실측으로 확정**되고, 환경변수 우선순위가 서브 배분을 깨지 않음이 확인됨
- [ ] **판정 기준 4항이 프로브 실행 *전에* 원장에 기록됨** — 사후 정당화 차단
- [ ] `CLAUDE_CODE_EFFORT_LEVEL` 부재 확인 기록
- [ ] 프로브 실행 기록이 **트랜스크립트에 남아 있음**(자기보고 아님 — 메모리 「수정은 실측으로 검증」)
- [ ] 판정 결과가 원장에 **헤더 표기 + thinking 토큰 + 결함 수** 3종과 함께 기록
- [ ] 도입 시: 메인 세션 + `chief-tech-operator`만 xhigh. **나머지 9역할에 effort 키 0건**(grep으로 확인)
- [ ] 드롭 시: CHANGELOG 반전 항목 1줄 + 전 역할 frontmatter 무변경
- [ ] 어느 쪽이든 낡은 기록 3곳(reviews·NEXT·글로벌 메모리) 정정 완료
- [ ] 출처 ④ 안티패턴("심각한 것만 보고") **회귀 0건** — 현재 0건이므로 유입 감시만

---

## 📚 학습 포인트

- **effort와 thinking은 다른 손잡이다** — thinking은 "생각 블록을 쓰는가", effort는 "응답 전체에 얼마나 공을 들이는가"다. effort는 도구 호출 수까지 바꾼다. Opus 5에선 xhigh·max에서 thinking을 끌 수 없다(400 에러).
- **"동작한다"와 "좋아진다"는 다른 측정이다** — 토큰이 갈리는 건 전자만 증명한다. 게이트의 판정선은 후자여야 한다.
- **벤치마크를 읽는 법** — 방법론·태스크셋·평가 하네스가 공개되지 않은 수치는 근거가 아니라 주장이다. 이번 FrontierCode 건은 글쓴이가 **스스로 그 한계를 밝혀뒀는데도** 2차 전파에서는 단정형("떨어지는 것이 밝혀졌다")으로 바뀌었다.

---

## ⚠️ 함정

- **프로브 없이 문서만 믿고 넣기** — 이 Phase의 존재 이유가 그것을 막는 것이다.
- **환경변수로 메인을 고정하기** — 서브 배분이 통째로 무너진다. 우선순위 실측 전엔 손대지 않는다.
- **`max` 채택 유혹** — 공식 문서가 *"on most workloads max adds significant cost for relatively small quality gains, and on some structured-output or less intelligence-sensitive tasks it can lead to **overthinking**"*로 경고한다. 영호 결정도 `xhigh`다.
- **2차 자료를 근거로 삼기** — 트윗·요약 매체는 출처 추적 후에만 쓴다. 이번 건은 원문 확인 결과 단정이 과장이었다.
- **앱 코드의 `shared/model-effort.ts`와 혼동** — 그건 AgentDeck이 *만드는 IDE*가 다루는 모델·effort 상수(LM1)이고, 본 Phase는 *우리가 쓰는 하네스*의 effort다. 이름만 같다.
- **글로벌 메모리를 안 고치기** — 저장소만 고치면 다음 세션이 옛 메모리("effort는 no-op")를 주입받아 되돌린다.

---

## 담당 SubAgent

**메인 직접** (프로브 설계·판정). 프로브 실행은 서브 2회 스폰이 필요하므로 동일 과제를 `secretary` 또는 임의 Worker로 각 effort 1회씩 돌린다.
