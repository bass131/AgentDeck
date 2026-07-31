---
owner: 유영호
milestone: CM1
phase: 04
title: 집행 층 — 훅 감량(보존 이식) · settings 3벌
status: pending
grade: 복잡
loop_track: human-gate
estimated: 3h
domain: cross
summary: Phase 1~3 결정의 집행부. 훅을 백지 재작성이 아닌 보존 이식+삭제 감량으로 재구성하고, 폐지 advisory는 무음 원장 모드로 전환하며, settings는 canonical 2벌 포함 3벌을 산출한다.
---

# Phase 04: 집행 층 — 게이트·훅

> **상태**: pending · **마일스톤**: CM1 · **등급**: 복잡 · **담당**: 메인 + 영호 (처분 확정) → Worker (보존 이식 감량 — 격리 불요, 코드 층)

## 🎯 목표

감량된 훅 세트 + settings 3벌 + 보존 테스트가 drafts(루트 동형 미러)에 존재하고, 스테이징에서 훅 테스트가 green이다.

## ⏪ 사전 조건

- [ ] Phase 01 (CORE 번호 매핑) · Phase 02 (② 폐지·편성) · Phase 03 (pin 신계약·보고 양식) 완료

## 📝 작업 내용

- [ ] **존치 게이트 확정** — 전제: dangerous-cmd-guard(파괴 차단 + 비가역 ask)·supervisor-guard ①③(봉인·OpenGate)·시크릿 deny. 영호 판단: tdd-guard(Phase 01의 CORE-05 처분과 연동)·phase-gate-validator(Phase 03 보고 결정과 연동).
- [ ] **advisory 5종(risk-detector·circuit-breaker·reviewer-auto-trigger·convention-size-guard + 폐지 결정분) → 무음 원장 모드** — systemMessage 제거, guard-blocks.log 기록만. Phase 07의 would-have-fired 관찰 장비.
- [ ] **shell-policy.mjs 감량**(989줄) — 병행 수용 글롭·구 경로·폐지 축 판정 제거. supervisor-guard ② 케이스 제거는 해당 테스트 삭제와 한 커밋 짝.
- [ ] **supervisor-guard 헤더의 구 경로 참조(`00_Documents/harness/**`·`adr/**`) 등 죽은 주석 정리** — 단 GATE_FLAG 신·구 2경로 OR 같은 부트스트랩 자물쇠는 의도 확인 후 처분.
- [ ] **settings 3벌 산출**: 신 `settings.SEALED.json`·신 `settings.OPEN.json`(canonical) + 배치본 — canonical을 안 바꾸면 CLOSE-GATE가 구본으로 롤백한다(설계 비평 1). $comment는 v3 기준으로 재작성.
- [ ] **테스트 경계 적용**: 블랙박스 글루 테스트(hook-exit·hook-advisory 837줄) 원본 보존, unit 테스트는 감량 따라 축소. drafts 미러에서 전 스위트 실행.

## ✅ 완료 조건

- [ ] drafts 미러에서 보존 훅 테스트 green (실행 로그 박제)
- [ ] settings 3벌 JSON 파싱 green + 3벌 상호 diff가 의도한 차이(봉인 deny)뿐
- [ ] 기능 제거와 테스트 삭제가 커밋 단위로 짝 (git log로 확인 가능)
- [ ] 감량 전/후 줄수 대비가 `_decisions.md`에 한 줄 박제

## 📚 학습 포인트

- fail-closed 설계 — 판정기가 죽으면 여는 게 아니라 닫는다는 원칙이 코드에서 어떻게 표현되는가.
- 블랙박스 vs unit 테스트의 생존성 차이 — 구현에 결합한 테스트는 구현과 함께 죽는다.

## ⚠️ 함정

- 코드 층 백지 재작성 금지 — 주석은 지워도 방어 로직(epoch 클램프·미래 시각 무효화·`..` 재진입 해소·fail-closed)은 삭제 근거 없이 건드리지 않는다.
- 훅 편집은 실경로가 아니라 drafts에서만 — 실경로는 봉인 중이며 Phase 06의 창에서만 반영.
- CRLF: drafts LF 규칙(Phase 00 미니 창)이 선행돼 있어야 한다.

## 담당 SubAgent

처분 결정 = 영호+메인. 감량 실행 = Worker(구 코드 정독 필요 — 격리 불요). 검증 = 메인 + 스테이징 테스트.
