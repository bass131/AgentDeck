---
owner: 영호
milestone: HR2
phase: 01
title: ADR 선행 — 010·028·033·038 개정
status: pending
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: coordinator/worker 조직론·루트 구분자 점(.) 결정·모델명 유지 결정·OpenGate 방어범위 네 ADR이 이번 변경에 정면으로 걸린다 — CORE-08상 선행.
---

# Phase 01: ADR 선행 — 010·028·033·038 개정

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness)
> **담당**: 메인 직접 (하네스 = 영호 단독 통제 대행, CORE-11)

---

## 🎯 목표

이번 마일스톤이 뒤집는 **기존 결정 3건**을 ADR로 먼저 정리한다. 헌법 CORE-08("디렉토리 경계·구조 변경 = ADR 선행")과 문서 지도의 *"바꾸려면 ADR부터"* 원칙상, 이 Phase 없이 P02~P03을 진행하면 **결정 기록 없이 결정을 뒤집는** 상태가 된다.

---

## ⏪ 사전 조건

- [ ] 영호가 `OPEN-GATE.bat` 실행 (`00.Documents/adr/**`·`ADR.md`는 봉인 대상 — ADR-037)
- [ ] 브랜치 `chore/harness-renewal-opus5` (생성 완료 2026-07-25)

---

## 📝 작업 내용

- [ ] **ADR-010 처리 결정** — `00.Documents/adr/ADR-010-multiagent-coordinator-worker.md`가 coordinator/worker 조직론 *그 자체*다. 개정 vs 신설+superseded 중 택일하고, 파일명에 `coordinator-worker`가 박혀 있으므로 rename 여부도 함께 결정.
- [ ] ADR-010 본문에 **실측 근거 #2·#3** 박제 — "v2.1.220에서 서브에이전트 `Agent` 도구 회수(중첩 기본 OFF)로 `main→coordinator→Worker` 2단 위임은 런타임에서 이미 불가. 2026-07-11 '유지 결정'은 중첩이 켜져 있던 v2.1.172~216 창 안의 결정이었다."
- [ ] **ADR-033 개정** — `:7`의 *"Claude의 Opus/Sonnet 모델명은 그대로 유지"* 결정을 뒤집는다. 근거 = 실측 #1(`model: opus` 별칭이 `claude-opus-4-8`로 스폰).
- [ ] **ADR-038 개정** — 결정문 `:3`·위협모델 `:9`가 `harness_opengate` **참조 Bash 전면 차단**을 명시 방어 범위로 선언해 뒀다. P05의 실행/언급 구분은 버그 수정이 아니라 **방어 범위 축소 = 계약 변경**이므로 개정이 선행돼야 한다.
- [ ] ⚠️ **ADR-028 개정 (개명의 정당성 근거 — 빠지면 ADR 없이 ADR을 뒤집는다)** — `00.Documents/adr/ADR-028-root-restructure.md:3,13`이 바로 이번에 뒤집는 결정이다:
  > *"구분자 `.`(점) 선택: ADR-027 하위폴더는 `_`(언더바)였으나 최상위는 `.`으로 시각 구분 강화(**영호 선택**). 경로 세그먼트 중간의 점은 확장자가 아니므로 모듈 해석 무탈."*

  P07~P08이 이 결정의 정면 반전인데, CORE-08("구조 변경 = ADR 선행")상 개정 없이 진행하면 이 Phase가 스스로 적은 *"순서가 곧 정당성"*이 여기서 깨진다. **개명 매핑표를 이 ADR에 박제**한다.
- [ ] ADR-028의 트레이드오프 절(`:20`)을 **P07 설계 근거로 인용** — 이미 같은 함정을 한 번 겪은 기록이 있다:
  > *"hook 리터럴 함정 — `*src/*` glob·`$PROJ/tests` lookup은 rename에 안 안전 → 동반 갱신. `tdd-guard` 테스트 lookup·`reviewer-auto-trigger` 경계 glob 2건은 **에이전트 자동매핑이 놓쳐 직접 정독으로 포착**."*

  이번 P07의 *"부분 수정이 가장 나쁘다"*와 정확히 같은 사고의 **2회차**다. 그 사실을 적어 두면 3회차를 막는다.
- [ ] **ADR 신설 여부 판단** — 새 역할(`chief-tech-operator`)과 모델 티어 4층이 ADR-010 개정으로 담기는지, 별도 ADR이 맞는지.
- [ ] `00.Documents/ADR.md` 인덱스 정합 (`:18` ADR-010 행 제목·상태)

---

## ✅ 완료 조건

- [ ] ADR-010·**028**·033·038 각각 개정 또는 superseded 표기 완료, `ADR.md` 인덱스와 **상태·제목 일치**
- [ ] ADR-028에 **개명 매핑표 5행**(`00.Documents`→`00_Documents` 등)이 박제됨 — P08이 이 표를 근거로 실행
- [ ] 각 ADR 본문에 trade-off 절 존재 (헌법 "결정엔 항상 trade-off")
- [ ] 실측 근거 #1·#2·#3이 file:line과 함께 박제 — 다음 점검이 같은 논의를 반복하지 않을 만큼 구체적으로
- [ ] `npm run test` green (`harness-conformance.test.ts`가 ADR 구조를 검사하므로 회귀 확인)
- [ ] CHANGELOG `[H]` 엔트리 1줄

---

## 📚 학습 포인트

- **ADR(Architecture Decision Record)의 supersede 관례** — 결정을 지우지 않고 "이 결정은 X에 의해 대체됨"으로 남긴다. 왜 그때 그렇게 정했는지가 지워지면, 나중에 같은 함정을 다시 밟는다.
- **결정의 유효기간** — ADR은 그 시점의 환경을 전제한다. 2026-07-11 "coordinator Agent 유지"는 *당시엔 옳았고* 런타임이 바뀌어 무효가 됐다. 결정이 틀린 게 아니라 **전제가 만료**된 것 — 이 구분을 ADR에 적어야 한다.

---

## ⚠️ 함정

- **ADR을 형식으로만 쓰기** — "바꿨다"만 적고 근거를 안 적으면 다음 점검이 또 조사한다. 실측 워크플로가 108만 토큰을 썼다는 사실 자체가 근거 박제의 가치다.
- **ADR-038 개정을 P05와 묶어 뒤로 미루기** — 그러면 P05가 "계약을 어기는 코드 변경"이 된다. 순서가 곧 정당성이다.
- **파일 rename 유혹** — `ADR-010-multiagent-coordinator-worker.md`의 이름이 실질과 어긋나 보이지만, ADR 파일명 변경은 인덱스·인용 링크 전수를 건드린다. 이름을 바꿀지는 **비용을 확인하고** 정한다.

---

## 담당 SubAgent

**메인 직접** — 하네스·ADR은 영호 단독 통제이며 메인이 대행한다(CORE-11). 에이전트 위임 X.
