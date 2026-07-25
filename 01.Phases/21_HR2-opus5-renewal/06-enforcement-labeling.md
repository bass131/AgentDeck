---
owner: 영호
milestone: HR2
phase: 06
title: 검증 문구 강제 출처 라벨링 + 응대 규범(CORE-13)
status: pending
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: 문구 삭제가 아니라 각 규칙의 강제 출처(훅·settings·문서뿐)를 표기한다 — 적대 검증이 "삭제해도 안전"을 REFUTED로 판정했다.
---

# Phase 06: 검증 문구 강제 출처 라벨링 + 응대 규범

> **상태**: pending
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

## ⏪ 사전 조건

- [ ] P03 완료 (역할 재편이 끝나야 라벨 대상이 확정)
- [ ] OpenGate 개방

---

## 📝 작업 내용

- [ ] **강제 출처 판정 절차 확립** — 각 규칙 문구에 대해 ① `.claude/hooks/**` grep ② `settings.json` permissions 매처, 두 곳 중 하나라도 걸리면 "기계 강제", 둘 다 0건이면 **"문서 규범 전용"**
- [ ] 판정 결과를 각 정책 문서에 **라벨로 표기**(예: `[기계: supervisor-guard]` / `[문서 규범 전용]`)
- [ ] **라벨 대상 = `.claude/policies/*.md` 전수**(현 12개) — "주요 문서"처럼 모호하게 두면 완료 판정이 불가능하다. 각 파일에 **최상단 범례 1개 + 규칙 단위 라벨 ≥1개**를 최소 기준으로 한다
- [ ] ⚠️ **인용은 행 번호가 아니라 앵커 문구로** — 아래 `execution-owner.md:16,63`·삭제 금지 목록의 행 번호는 P02·P03이 같은 파일을 재편한 뒤 **이미 밀려 있다**. 실행 시 문자열 grep으로 재확인할 것
- [ ] ⚠️ **`execution-owner.md:16,63` 오분류 정정** — plan-auditor·reviewer를 "역할 무관 기계 게이트"로 표기하고 있다. 이 표를 지도 삼아 삭제 범위를 정하면 **반드시 오삭제**하므로 표 자체가 정정 대상
- [ ] **삭제 금지 목록 명시** (기계 강제 0건 + 유일 방어선):
  - `loop-driver.md:63` · `work-run/SKILL.md:72` (게이트 출력 트랜스크립트 박제 — 단순·보통 등급에서 게이트가 실제로 돌게 만드는 유일 장치)
  - `work-judge.md:43-44` + `CLAUDE.md:93` (attended 전제 = 버킷 (c) 물리 강제의 근거)
  - `grade-and-risk.md:59,67-69` (등급 상향 수동 기재 — `phase-gate-validator` 발화의 상류 스위치)
  - `CLAUDE.md:56` (claude-api 미참조 금지)
  - `grade-and-risk.md:52`·`CLAUDE.md:50` (양쪽 typecheck green — 어떤 훅도 typecheck를 실행하지 않음)
  - `review-tiering.md:32,47-50,77` · `subagent-routing.md:79-83,136` (reviewer·plan-auditor 무조건 호출 + 키 누락 시 종료)
  - `work-run/SKILL.md:98,107` (reviewer self-pass 금지)
  - `review-throughput.md:20-27` §2 (졸업 불가 목록) · `:54` (자기평가 편향 실측 전례)
  - `subagent-routing.md:120` (**"상향 모델도 실수 0을 보장하지 않으므로 검증을 생략하지 않습니다"** — 하네스가 이번 주장을 이미 선제 기각해 둔 문장)
- [ ] (선택) 순수 비용 축 3줄 처리 — 삭제해도 무방하나 이득이 작다. 라벨링만으로 종료 가능
- [ ] **spawn cap = 런타임 한도 사실 등재** — "신설"이 아니다. 런타임에 이미 3중(세션 200 / 동시 20 / 중첩 0). 기존 등급표의 "Worker 3~4"를 **규범 상한으로 승격**. ⚠️ **ultracode 세션은 동시 한도 면제** → 그땐 규범 상한이 유일 브레이크임을 명시
- [ ] **응대 규범 보강** — 범위 규율 + "반복 제거"
  - ⚠️ **"짧게 써라"로 쓰지 않는다** — 기존 "완성된 한국어 문장·함축/전보체 금지"와 정면 충돌. *"서론·중복 요약·이미 말한 것의 재진술을 넣지 않는다"*로 표현해 **문장 완성도는 유지하고 반복만 걷어낸다**
  - ⚠️ 의미 정본은 `CLAUDE.md`가 아니라 **`00.Documents/harness/CORE.md:71-74`(CORE-13)** → **조항 버전 상향 + `core-manifest.json` + `AGENTS.md` 3점 동기화** 필요(`CORE.md:6`)

---

## ✅ 완료 조건

- [ ] `execution-owner.md:16,63`에 plan-auditor·reviewer가 기계 게이트로 표기된 서술 **0건**
- [ ] 삭제 금지 목록 9항이 **전부 원문 그대로 존재**(diff로 확인)
- [ ] `.claude/policies/*.md` **전수(12개)**에 범례 1개 + 규칙 라벨 ≥1개 — 미부착 파일 0
- [ ] CORE-13 변경 시: 조항 버전 · `core-manifest.json` · `AGENTS.md` 3자 동기 + `npm run test` green(conformance)
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0

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
