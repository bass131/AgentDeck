---
owner: 영호
milestone: RF1
phase: 06
title: components 번호접두 폴더 이동 + import 갱신
status: done
grade: 대규모
risk: ui-visual
loop_track: human-visual
estimated: 3h
domain: renderer
summary: 05 매핑대로 components를 NN_category/ 폴더로 이동 + 전 import 경로 갱신 + 회귀·육안 검증
---

# Phase 06: components 번호접두 폴더 이동 + import 갱신

> **상태**: ✅ done (2026-06-27 — 89파일 9폴더 이동, 회귀 4종 green, 영호 육안 GO)
> **마일스톤**: RF1-cleanup (트랙 B · 구조)
> **등급**: 대규모 (대량 파일 이동 + import churn)
> **담당**: renderer (메인 직접 — 결정론적 스크립트)

---

## ✅ 결과 (2026-06-27)

89파일(47 .tsx + 42 .css) → 9폴더(`common`·`00_shell`~`07_notice`) 이동, 루트 평면 0. import 재작성: 이동파일 41 + 외부 importer 89 + 테스트 CSS read경로 3. 전부 `git mv`(89 rename 감지·히스토리 보존). **회귀**: typecheck 0err(node+web)·test 3619 pass·build green·lint 0err. **영호 육안 GO**(3-pane·대화·뷰어 불변). 단일 atomic 커밋(import 상호의존 → 카테고리별 분리 시 중간상태 컴파일 불가 트레이드오프). **의도적 미변경**: `lib/*SampleData.ts`의 컴포넌트 경로 문자열=데모 표시데이터(실제 참조 아님)라 거동불변 위해 유지.

---

## 🎯 목표

Phase 05 매핑대로 `components/`를 `NN.category/` 번호접두 폴더로 **물리 이동**하고, 이를 참조하는 **모든 import 경로를 갱신**한다. 거동 불변 — 픽셀·동작 변화 0.

---

## ⏪ 사전 조건

- [ ] Phase 04 — ADR-027 확정
- [ ] Phase 05 — 카테고리 매핑 합의

---

## 📝 작업 내용

- [ ] 카테고리별 폴더 생성 (`00.shell/` …)
- [ ] `git mv`로 .tsx + 짝 .css 이동 (git mv = 히스토리 보존)
- [ ] import 경로 일괄 갱신 — 상대경로(`./Foo`) + `@renderer` alias 참조 모두
- [ ] .css의 상대 참조·`@import`도 갱신
- [ ] 동적 import·문자열 경로(`viewer.ts` 라우팅 등) 숨은 참조 grep 점검
- [ ] 카테고리당 커밋 분리 권장 (리뷰·롤백 단위)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors (import 전부 해소)
- [ ] `npm run test` green
- [ ] `npm run build` green
- [ ] `npm run lint` 0 problems
- [ ] **육안**: 앱 실행 → 3-pane·대화·뷰어 시각·동작 불변 (`docs/UI.md` 안티슬롭) — 사람 트랙
- [ ] `git mv` 사용으로 파일 히스토리 보존 확인

---

## 📚 학습 포인트

- **`git mv` vs 삭제+생성** — git mv는 rename으로 추적돼 `git log --follow` 히스토리 보존. 그냥 옮기면 히스토리 끊김.
- **거동 불변 리팩토링** — 구조만 바꾸고 동작은 1픽셀도 안 바꾼다. 검증 = 회귀 게이트 + 육안.

---

## ⚠️ 함정

- 동적 import·CSS `@import`·문자열 경로 누락 → 런타임에서만 터짐 (typecheck 통과해도). grep 필수.
- 한 커밋에 전부 → 롤백 단위 비대. 카테고리별 분리.
- ui-visual = 무인 commit X. 육안 후 commit.

---

## 담당 SubAgent

> renderer (src/renderer/** R/W). 대규모 + ui-visual → coordinator 경유 + 사람 육안 게이트.
