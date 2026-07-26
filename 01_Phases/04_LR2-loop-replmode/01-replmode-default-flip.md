---
owner: 영호
milestone: LR2
phase: 01
title: replMode 기본값 전환 (held-open→resume) + held-open 옵트인 토글
status: pending
grade: 복잡
loop_track: auto-gate
domain: renderer
summary: system.ts:87 replMode 기본값을 true→false로 전환해 기본 세션을 resume 단발로. held-open은 옵트인 토글로 유지. ADR-024 재고(영호 확정)의 핵심 구현.
---

# Phase 03: replMode 기본값 전환 + held-open 옵트인 토글

> **상태**: pending
> **마일스톤**: LR1
> **등급**: 복잡 (behavior 전환 — 세션 전 경로 영향)
> **담당**: coordinator + renderer(+main-process 분기) Worker

---

## 🎯 목표

`system.ts:87`의 `replMode: true`를 **`false`로 전환**해, 앱 기본 세션 방식을 held-open → **resume 단발**로 바꾼다. held-open은 삭제하지 않고 **옵트인 토글**로 유지(빌트인 자율 루프용). ADR-024 재고(영호 확정)의 핵심 구현.

> ⚠️ 이 전환의 *설계 결정 자체*는 영호가 ADR-024 재고에서 **이미 확정**. 이 Phase는 판단 분기가 아니라 확정된 결정의 구현 → auto-gate. 단 세션 UX 체감(재시작 후 맥락 유지)은 human-visual 검증.

---

## ⏪ 사전 조건

- [ ] Phase 02 — resume 경로가 정확히 작동(session_id 재시작 복원). **resume이 정확해야 기본값으로 안전** — 안 그러면 전 사용자가 버그에 노출.

---

## 📝 작업 내용

- [ ] **기본값 전환** — `system.ts:87` `replMode: true` → `false`.
- [ ] **분기점 정합 확인** — `runtime.ts:146` `replMode ? { persistent: true, sessionKey } : {}` / `usePanelLoop.ts:79-80` 동일 분기. false일 때 단발+resume 경로로 흐르는지.
- [ ] **held-open 옵트인 토글 UI** — replMode를 사용자가 켤 수 있는 토글(설정 또는 대화별)이 존재/작동하는지 확인. 없으면 최소 토글 추가(옵트인 접근 경로 보장).
- [ ] **기존 테스트 기대값 갱신** — `persistent-contract.test.ts` 등 replMode=true를 가정하던 테스트의 기대값을 새 기본값(false)에 맞게 갱신. (기본값 전환이 목적이므로 테스트 수정은 정당 — 단 "왜 바뀌는지" 각 테스트에 근거 주석.)

---

## ✅ 완료 조건

- [ ] 기본 세션이 resume 단발로 동작 (persistent 미주입) — e2e 또는 단위로 확인
- [ ] held-open 옵트인 토글 ON 시 held-open(persistent) 경로 동작
- [ ] `npm run typecheck` 0 errors · `npm run test` green(기대값 갱신 반영) · `npm run lint` 0
- [ ] **[human-visual 체크포인트]** 영호 실사용: 앱 종료→재시작 후 이전 대화 맥락이 유지되는지 육안 확인 (ADR-024 재고가 겨냥한 그 불편의 해소 검증)

---

## 📚 학습 포인트

- **feature flag 기본값 전환의 파급** — boolean 하나(replMode)가 세션 전 경로(단발 vs held-open)를 가른다. 기본값을 뒤집으면 그 flag를 가정하던 모든 테스트·분기가 흔들림 → 영향 범위를 grep으로 전수 파악하는 습관.
- **옵트인 vs 기본값** — "기능 제거"가 아니라 "기본값 강등"으로 안전하게 전환하는 패턴. held-open 코드는 그대로, 진입 default만 바꿈 → 되돌리기 쉬움(가역).

---

## ⚠️ 함정

- **테스트 대량 실패** — replMode=true를 가정한 기존 테스트가 무더기로 깨질 수 있음. 각 실패가 "기본값 전환 때문(정당)"인지 "회귀(버그)"인지 구별. 정당한 것만 기대값 갱신.
- **옵트인 경로 소실** — 토글 UI가 없으면 held-open에 접근 불가 → 자율 루프(Phase05) 기능이 죽음. 옵트인 진입점 반드시 보장.
- **Phase02 미완 상태 전환 금지** — resume이 부정확한데 기본값을 바꾸면 전 사용자 버그 노출. 사전조건 엄수.

---

## 담당 SubAgent

**coordinator** + **renderer** Worker (system.ts·runtime.ts·usePanelLoop·토글 UI) + **main-process** 분기 정합 확인. reviewer 조건부.
