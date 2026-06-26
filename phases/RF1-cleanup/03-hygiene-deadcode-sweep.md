---
owner: 영호
milestone: RF1
phase: 03
title: dead code · 미사용 export 스윕
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1.5h
domain: cross
summary: 미사용 export·dead code·루트 잡파일을 진단 도구로 식별 + 안전 범위만 제거
---

# Phase 03: dead code · 미사용 export 스윕

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 A · 위생)
> **등급**: 보통 (여러 파일 소폭 · 가역)
> **담당**: 메인 직접 (+ 필요 시 qa로 회귀 확인)

---

## 🎯 목표

코드베이스의 **미사용 export·도달 불가 코드·루트 잡파일**을 식별하고, *안전하게 증명된 것만* 제거한다. (CHANGELOG에 `composerSampleData`·`f14SampleData`·`run-args.ts` = keep 판정 이력 있음 — 실측 참조라 보존. 같은 오판 방지.)

---

## ⏪ 사전 조건

- [ ] Phase 02 완료 권장 (artifacts 정리 후 잡파일 노이즈 감소)

---

## 📝 작업 내용

- [ ] 미사용 export 진단 — `npx ts-prune` 또는 ESLint `no-unused` 확대 실행 (도구 추가 시 devDep만, ADR 불요)
- [ ] 후보별 *실 참조* 재확인 (동적 import·테스트·문자열 경로 참조 포함 — false positive 주의)
- [ ] 루트 잡파일 점검 (`*.tsbuildinfo`는 ignored 확인, 임시 산출물 정리)
- [ ] keep 판정(샘플데이터 등)은 **주석으로 "실측 참조 — keep 사유" 박제** (다음 스윕 오판 방지)
- [ ] 안전 증명된 dead code만 제거

---

## ✅ 완료 조건

- [ ] `npm run typecheck` green (제거가 타입 안 깨뜨림)
- [ ] `npm run test` green (Phase 시작값 대비 비감소 + 신규 fail 0)
- [ ] `npm run lint` 0 problems
- [ ] 제거 항목별 "참조 0건" 증거 (grep/ts-prune 출력) 기록

---

## 📚 학습 포인트

- **dead code의 위험** — 안 쓰는 코드도 읽는 비용·오해 비용·유지 비용 발생. 단 *증명 없이 삭제*는 회귀 사고.
- **false positive** — 정적 분석은 동적 import·문자열 경로·리플렉션을 못 봄. 도구 출력 = *후보*, 최종 판정은 사람.

---

## ⚠️ 함정

- ts-prune이 "미사용"이라 해도 e2e/동적 로드에서 쓰일 수 있음 → grep 교차 확인.
- 샘플데이터·픽스처를 dead로 오인 (CHANGELOG keep 이력 참조).

---

## 담당 SubAgent

> 메인 직접 진단 → 제거. 회귀 불안 시 qa에 "테스트 green 확인" 위임.
