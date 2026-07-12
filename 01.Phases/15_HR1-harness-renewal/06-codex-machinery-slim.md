---
owner: 영호
milestone: HR1
phase: 06
title: Codex 기계장치 경량화 — TOML·doctor·계약테스트 축소
status: pending
grade: 복잡
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: 워커 TOML 9종·doctor live canary·계약 테스트(harness-contract.test.mjs)를 전담 보조 계약(P05) 크기로 축소 재작성한다.
---

# Phase 06: Codex 기계장치 경량화 — TOML·doctor·계약테스트 축소

> **상태**: pending · **마일스톤**: HR1 · **등급**: 복잡 · **담당**: 메인 직접 — P05와 연속 처리(계약 테스트 RED 상태 봉합)

---

## 🎯 목표

Codex 기계장치가 새 계약(전담 보조)의 크기에 맞는다: 잔존 역할 프로필만 남고, doctor·계약 테스트가 새 계약을 green으로 검증하며, 안전 게이트(execpolicy·훅)는 온전하다.

## ⏪ 사전 조건

- [ ] P05 완료 (새 계약 확정 — 이 Phase의 명세. P05 직후 연속 착수: 계약 테스트 RED 방치 금지)

## 📝 작업 내용

- [ ] `.codex/agents/*.toml` 정리: 보조 역할 프로필만 잔존(P05 선별안 — 예상: reviewer 계열 1~2개), 워커 5종·coordinator·secretary 등 풀 드라이버 전제 프로필 제거
- [ ] `harness-doctor.mjs` 축소: 정적 검사 + 잔존 프로필 canary만 (16종 경계 canary → 잔존 역할 수에 비례 축소, `--live` 옵션 존치)
- [ ] `harness-contract.test.mjs` 재작성: 새 계약 반영(브리지 정확 일치 수 갱신, 제거된 프로필 검사 삭제, **안전 게이트 검사는 존치**: execpolicy push/PR/merge/release prompt·curl 계열 forbidden·시크릿 deny-read)
- [ ] `.codex/hooks.json`·`agentdeck-hook.mjs`·`rules/agentdeck.rules` 존치 항목 확인: 파괴명령 차단·하네스 봉인·pin 주입은 역할 무관 유지 (훅 정의 변경 시 SHA-256 cachebuster 갱신 + Codex `/hooks` 재신뢰)
- [ ] `.agents/skills/**` 제거 후보 삭제 (P05 승인분)
- [ ] secretary: 커밋 + CHANGELOG [H]

## ✅ 완료 조건

- [ ] `node --test .codex/harness-contract.test.mjs` green (새 계약 기준 — RED 0)
- [ ] `node .codex/harness-doctor.mjs --live` PASS (축소된 canary 기준)
- [ ] **Codex 라이브 스모크 1회**(영호 attended): Sol 세션에서 `$agentdeck-review`(또는 잔존 스킬) 정상 발화 + 파괴명령 차단 프로브 1회
- [ ] 제품 게이트 무영향: `npm run typecheck` · `npm run test` green

## 📚 학습 포인트

- **테스트는 계약의 화석** — 계약이 바뀌면 테스트도 재작성 대상. "테스트가 깨지니 되돌리자"가 아니라 "이 테스트가 지키던 계약이 아직 유효한가"를 묻는다.
- **삭제의 안전학** — 지울 때 지키는 것(안전 게이트)의 목록을 먼저 고정하고 지운다.

## ⚠️ 함정

- **execpolicy·시크릿·파괴명령 검사를 계약 테스트에서 지우지 말 것** — 축소 대상은 조직론(프로필·브리지 수), 안전 의미가 아님.
- Codex 훅 정의 hash 변경 → **재신뢰 전까지 조용히 no-op** — 스모크 전 `/hooks` 재신뢰 절차 필수.
- doctor 축소 시 Windows sandbox EPERM 우회(단일 cmd.exe canary — H1 학습)를 회귀시키지 말 것.
- 수치 주의: H1 기록의 "계약 테스트 38 pass"는 node --test 서브테스트 카운트 기준(파일 실측 = test() 블록 12·assert 50) — 재작성 후 완료 조건은 개수가 아니라 "RED 0" (plan-auditor 🟡#1).

## 담당 SubAgent

메인 직접(하네스 = 영호 단독 통제 대행, 유지보수 창) + secretary(커밋·CHANGELOG)
