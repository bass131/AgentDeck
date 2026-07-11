---
owner: 영호
milestone: LR4
phase: 07
title: REPL 토글 세션별 분리
status: pending
grade: 복잡
risk: shared-contract
loop_track: human-gate
estimated: 2~5h
domain: cross
summary: replMode 전역 단일 필드(스코프 과대)를 대화별(단일)/패널별(멀티)로 — 영호 GO, held-open 파급 있어 A 후.
---

# Phase 07: REPL 토글 세션별 분리

> **상태**: pending
> **마일스톤**: LR4
> **등급**: 복잡
> **담당**: cross

---

## 🎯 목표

REPL 토글을 전역→세션별로 분리한다(영호 GO). 대화·패널마다 독립적으로 켜고 끈다.

---

## ⏪ 사전 조건

- [ ] **A 전체(P02·P03 held-open 파급) 완료 후** — 세션 수명 로직이 안정된 위에서 세션별 분리.

---

## 📝 작업 내용

- [ ] **(a) 필드 이동** — `replMode`를 `system.ts:38` 전역에서 대화별(단일: conversation 레코드)/패널별(멀티: `PanelThreadSnapshot`)로 이동.
- [ ] **(b) 영속** — shared/ipc conversation 레코드 확장 + main load/save(CP1 P05 사이드카 패턴 참고).
- [ ] **(c) 소비처 배선** — 소비처(`runtime.ts:196` send persistent 플래그·`PanelView`·토글 UI `PanelPicker`/`ComposerBar`)가 세션 값을 사용.
- [ ] **(d) 전역 마이그** — 전역 prefs(`Shell.tsx:207`·`main.tsx:33`) 마이그/제거.
- [ ] **(e) ADR-024·system.ts:38 근거 갱신** — cross-session 설정→per-session으로 의도 반전(문서-코드 drift 방지). ADR 본문 반영은 영호 직접, Phase는 갱신 필요만 명시.

---

## ✅ 완료 조건

- [ ] 세션 A/B 독립 토글 테스트 PASS
- [ ] 영속 라운드트립 테스트 PASS
- [ ] held-open 플래그 세션별 정합(P02·P03 위) 테스트 PASS
- [ ] 하위호환(기존 전역 prefs→세션별 마이그, 크래시 0) 테스트 PASS
- [ ] `npm run typecheck` (main+renderer) 0 errors · `npm run test` green · `npm run lint` 0 problems
- [ ] reviewer(shared-contract) CRITICAL 0
- [ ] **영호 GO** — JSON 스키마 마이그(버킷 c).

---

## 📚 학습 포인트

- **스코프 과대(over-scoped state)** — 전역 단일 필드는 여러 세션이 공유해 한 곳의 토글이 다른 세션에 새어나간다. 세션별 스코프로 내리면 독립성이 생기지만, 영속 스키마 마이그레이션이 따라온다.
- **하위호환 마이그레이션** — 기존 전역 prefs를 세션별로 옮길 때, 옛 레코드가 로드 시 깨지지 않게 graceful 마이그레이션을 둔다(additive + 폴백).

---

## ⚠️ 함정

- held-open 세션별 분리가 P02·P03 세션 수명과 상호작용 — 정합 확인.
- JSON 스키마 마이그(기존 전역→세션별) — 크래시 0.
- ADR-024 구역.

---

## 담당 SubAgent

renderer + shared-ipc + main-process cross. reviewer + 영호 GO.
