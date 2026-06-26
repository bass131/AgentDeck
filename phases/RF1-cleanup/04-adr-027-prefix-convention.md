---
owner: 영호
milestone: RF1
phase: 04
title: ADR-027 초안 — 번호접두 폴더 컨벤션
status: done
grade: 복잡
loop_track: human-gate
estimated: 1h
domain: cross
summary: 번호접두(NN.name) 폴더 컨벤션을 ADR-027로 결정·트레이드오프 박제 (AI 초안, 사용자 확정)
---

# Phase 04: ADR-027 초안 — 번호접두 폴더 컨벤션

> **상태**: ✅ done (2026-06-27 — ADR-027 박제, 영호 GO)
> **마일스톤**: RF1-cleanup (트랙 B · 구조)
> **등급**: 복잡 (구조 결정 = 후속 Phase 다수에 파급)
> **담당**: 메인 직접 (초안) → **영호 확정** (ADR = 사용자 단독 통제)

---

## ✅ 결과 (2026-06-27)

ADR-027 `docs/ADR.md`에 박제 + 영호 확정. **확정값**: 구분자=`_`(언더바) · 번호=촘촘(`00,01,02`) · 정렬=논리/데이터흐름 순. 범위=`components/`+`src/main` 내부 모듈+`docs/`, 최상위 src 4종 제외. CHANGELOG [L]. → 후속 P05~P08은 이 ADR이 근거. **plan 예시의 점(`.`) 표기는 P05 실행 시 언더바로 정합.**

---

## 🎯 목표

`components/`·`src/main/`·`docs/`에 `NN.<name>` 번호접두를 도입하는 결정을 **ADR-027**로 박제한다. 헌법: "디렉토리 구조 변경 = ADR 선행". 이 ADR이 06·07·08의 *근거*가 된다.

---

## ⏪ 사전 조건

- [ ] 없음 (트랙 B의 첫 Phase — B0)

---

## 📝 작업 내용

- [ ] `docs/ADR.md`에 ADR-027 초안 작성 (기존 포맷: 결정 / 이유 / 트레이드오프·불변 / 위험도)
- [ ] **결정**: 번호접두 범위 = `components/`(카테고리)·`src/main/`(모듈)·`docs/`(읽기순서). 최상위 `src/{main,preload,renderer,shared}` **제외** (electron-vite 고정).
- [ ] **트레이드오프** 명시: 명시적 순서 ↔ import 경로 churn·rename 비용. 왜 이득인지.
- [ ] **불변** 명시: agent R/W 글롭 `/**` 유지(라우팅 안 깨짐), 신뢰 경계 불변, alias 불변.
- [ ] 번호 부여 규칙 박제 (예: `00.` 시작, 의존/중요도 순, 간격 둘지)
- [ ] **영호에게 초안 제시 → 확정 GO 대기** (human-gate)

---

## ✅ 완료 조건

- [ ] ADR-027이 `docs/ADR.md`에 박힘 (포맷 정합)
- [ ] `.claude/CHANGELOG.md`에 [M] 한 줄 (구조 컨벤션 결정)
- [ ] **영호 확정 서명** (이 Phase는 사용자 GO 없이 done 처리 X)

---

## 📚 학습 포인트

- **ADR(Architecture Decision Record)** — "왜 이렇게 했나"를 미래의 나/합류자에게 남기는 결정 로그. 바꾸려면 ADR부터.
- **결정의 트레이드오프 강제** — "A로 한다"가 아니라 "A vs B, A 선택, 단점은 C". 번복 비용을 미리 가시화.

---

## ⚠️ 함정

- ADR 없이 06·07 착수 → 컨벤션 번복 시 대량 재rename. **04 확정이 B 트랙 게이트.**
- ADR = 사용자 단독 통제 영역 — AI가 *확정*하면 헌법 위반. 초안까지만.

---

## 담당 SubAgent

> 메인 직접 (초안) → 영호 확정. (docs/ADR = 위임 X, 사용자 단독)
