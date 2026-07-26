---
owner: 영호
milestone: TG1
phase: 08
title: 스플릿 뷰 균등 셀 · 정적 하이라이트 · 지그재그 스태킹
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 2~3h
domain: renderer
---

# Phase 08: 스플릿 뷰 균등 셀 · 정적 하이라이트 · 지그재그 스태킹

> **상태**: done
> **마일스톤**: TG1 (P08 — 마감 후 편입, 영호 육안 피드백 편입 2026-07-17 확정 · GAP1 P16 선례)
> **등급**: 복잡 (ui-visual → reviewer 통합·human-visual)
> **담당**: renderer (+reviewer 무조건)

---

## 🎯 목표

> 서브에이전트 스플릿 뷰의 셀 배치·활성 표시 연출을 영호 육안 피드백대로 재작업한다.

세 가지를 바꾼다:

1. **활성 셀 자동 확대(flex-grow 2:1) 제거** → 전 셀 균등 크기 고정.
2. **활성 표시는 정적 하이라이트(크기 불변 — 테두리/헤더 점등)로 대체** — reflow 없이 활성만 시각적으로 강조.
3. **셀 스태킹을 좌측 컬럼 선채움 → 좌,우,좌,우 지그재그(짝수 index=좌, 홀수=우)로 변경.**

근거 = 영호 육안 피드백(2026-07-17): 확대 reflow가 산만 + 좌우 균형 선호. "Floating Window" 의도 = 균등 크기 셀로 확인(드래그 자유 배치 아님 — 질의로 확정).

---

## ⏪ 사전 조건

- [ ] **GAP1 P14 스플릿 뷰 완료** — `splitView.ts` 정책 순수 함수 + 정본 테스트 `gap1-p14-splitview-policy.test.ts`
- [ ] **TG1 P07 채증 하네스** — `TG1SHOTS` 시각검증 하네스(dark/light 컷 채증 인프라)

---

## 📝 작업 내용

> 복잡 등급 — RED 선행(TDD) → 정책 → 컴포넌트 → 하네스 채증 순.

- [ ] **(a) RED 선행 — 정책 정본 테스트 갱신** — `gap1-p14-splitview-policy.test.ts`에 `rowWeights` 균등·`computeColumns` 지그재그 신규 계약을 실패 테스트로 먼저 기술.
- [ ] **(b) splitView.ts 정책 변경** — `ACTIVE_WEIGHT` 확대 폐기 · `noteActivity`/`activeId`는 하이라이트용으로 보존 · `MAX_CELLS` 6 · queue 불변.
- [ ] **(c) SubAgentSplitView.tsx/css** — `flexGrow` 주입 제거 · flex-grow transition 제거 · 활성 하이라이트 클래스(Clay 기존 토큰 재사용 — 신규 HEX 0).
- [ ] **(d) 컨테이너·shot 테스트 정합** — 컴포넌트 변경에 맞춰 컨테이너·shot 테스트 갱신.
- [ ] **(e) TG1SHOTS 하네스 p08 장면 추가·채증** — 균등·지그재그·하이라이트 실렌더 컷을 dark/light로 채증.
- [ ] **(f) 육안 가이드 갱신은 마감 몫** — 본 Phase에서는 채증까지, 열람 가이드 갱신은 마일스톤 마감에서 일괄.

---

## ✅ 완료 조건

> 객관적·정량적. done 판사 = CI 회귀 게이트.

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전량 0 fail
- [ ] `npm run lint` 0 problems
- [ ] 정책 정본 테스트 신규 계약(`rowWeights` 균등·`computeColumns` 지그재그) GREEN
- [ ] 균등·지그재그·하이라이트 실렌더 컷 채증(dark/light) `ScreenShot/` 착지
- [ ] 육안 = 사람 트랙(무인 통과 처리 금지)
- [ ] reviewer 통합 통과

---

## ✅ 완료 기록 (2026-07-17)

- **정책 교체** — `computeColumns` 지그재그(짝수 index=좌·홀수 index=우) · `rowWeights`/`ACTIVE_WEIGHT`/`ROWS_PER_COLUMN` 완전 삭제 → 균등은 CSS `flex: 1 1 0` 단독 소유.
- **렌더** — `flexGrow` 인라인 주입 제거 → `.sag-cell--active` 클래스로 전환 · `noteActivity` running 한정 트리거 의미 보존.
- **CSS** — `flex-grow` transition 제거 · 정적 하이라이트 = `--accent-line` ring + `--accent-soft` 헤더 틴트(기존 Clay 토큰, 신규 HEX 0).
- **정본 테스트 교체** — policy 37 · container 18 RED→GREEN.
- **채증** — TG1SHOTS p08 장면 2컷(`p08-split-zigzag-dark.png`·`-light.png`).
- **reviewer** — 🔴 0.
- **게이트** — typecheck·lint clean · Vitest 5247 pass.
- **옛 계약 옵트인 2종 재베이스라인** — qa 커밋 `0875317`(P14SHOTS 5/5 GREEN · hunt-r4 정적 검토 대체).
- **GAP1 p14 골든 10장** — 부수 재생성 발생분을 명시 경로 `git checkout --`로 복원(역사 기록 보존).

---

## 📚 학습 포인트

> 학부생 시각에서 새로운 개념.

- **정적 하이라이트 vs 크기 변화** — 활성 표시를 "크기(reflow)"가 아니라 "색(paint)"으로 바꾸면 레이아웃 재계산 없이 강조된다. reflow는 산만·비용, repaint는 국소·저렴.
- **정책 순수 함수 우선 갱신(TDD)** — 배치 규칙(균등·지그재그)을 `splitView.ts` 순수 함수의 계약으로 먼저 못박고(RED), 컴포넌트는 그 계약을 렌더링만 하게 두면 시각 회귀를 테스트로 잠글 수 있다.

---

## ⚠️ 함정

> 이 영역에서 자주 하는 실수.

- **셀 소멸·승격 시 지그재그 재매핑** — 셀이 사라지거나 승격되면 index 재매핑으로 좌우 이동이 발생한다(기존도 승격 시 이동 — 동급, 명시만 함).
- **1개일 때 전폭 유지** — 셀이 1개면 컬럼 1개로 전폭 유지(지그재그 분기 진입 금지).
- **GAP1 골든은 역사 기록** — GAP1 골든(p14 shots · p15r4 active-zoom 컷)은 역사 기록이다. 재생성 부수효과 시 명시 경로로 복원.
- **noteActivity running 한정 트리거 의미 유지** — `noteActivity`의 running 한정 트리거 의미는 그대로 보존(하이라이트 대상 선정에만 재사용).
- **신규 HEX 0** — 활성 하이라이트는 Clay 기존 토큰 재사용. 신규 색상 값 도입 금지.

---

## 🚦 마일스톤 종료 게이트

- **P08은 마감 후 편입 Phase** — 구현과 함께 마감 커밋 예정(코드·문서 동반). 채증·게이트 GREEN 후 육안은 P08 컷 포함 일괄 사람 트랙.

---

## 담당 SubAgent

renderer 주도(정책·컴포넌트·css·shot·하네스 채증). reviewer 무조건 통합(ui-visual 복잡).
