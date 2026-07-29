---
owner: 유영호
milestone: RS1
phase: 01
title: NUL 바이트 제거 + 테스트 수집 기준선 fitness
status: done
grade: 단순
loop_track: auto-gate
estimated: 1h
domain: qa
summary: core-loop 테스트의 실제 NUL 바이트를 이스케이프 표기로 교체(grep 바이너리 오판 해소) + 테스트 파일 수 기준선(402)을 fitness 테스트로 박제. 환경 검증용 소형 첫 Phase.
---

# Phase 01: NUL 바이트 제거 + 테스트 수집 기준선 fitness

> **상태**: pending · **마일스톤**: RS1 · **등급**: 단순 · **담당**: qa

## 🎯 목표

`grep`이 `core-loop.test.ts`를 다시 텍스트 파일로 검색할 수 있고, 앞으로 테스트 파일이 수집에서 조용히 빠지면(개명·통합 실수) 회귀 게이트가 빨간불을 켠다.

## ⏪ 사전 조건

- [ ] 없음 (마일스톤 첫 Phase — 실행 루프 환경 검증을 겸한다)

## 📝 작업 내용

- [ ] `99_Others/tests/integration/core-loop.test.ts:827` — 문자열 리터럴에 박힌 **실제 NUL 바이트**(파일 offset 43020)를 **U+0000 유니코드 이스케이프 표기**(백슬래시 + u0000, 여섯 글자)로 교체. **런타임 문자열 값은 동일**해야 한다(검증 의미 불변). ⚠️ 이 파일을 Edit 도구로 고치려 하면 NUL 때문에 매칭이 실패할 수 있다 — Bash에서 perl/printf로 바이트 단위 치환이 확실하다.
- [ ] 테스트 수집 기준선 fitness 테스트 신설(예: `99_Others/tests/collection-baseline.test.ts`) — `99_Others/tests/**`의 `*.test.*` 파일 수를 세어 **402 이상**을 단언. 이후 Phase에서 파일이 늘면 그대로 통과, 수집 누락이 생기면 red.

## ✅ 완료 조건

- [ ] `npm run typecheck`(node+web) 0 errors / `npm run test` 5,359+ passed·신규 fail 0 / `npm run lint` 0
- [ ] `grep -c "null.ts" 99_Others/tests/integration/core-loop.test.ts`가 바이너리 판정 없이 숫자를 반환
- [ ] 신규 fitness 테스트 1 PASS (파일 수 403 이상 확인)

## 📚 학습 포인트

- **적합도 함수(fitness function)** — 아키텍처 성질(여기서는 "테스트가 전부 수집된다")을 사람이 기억하는 대신 기계 검사로 상시 감시하게 만드는 것.
- grep류 도구는 파일에 NUL 바이트가 있으면 통째로 바이너리로 판정해 **조용히 검색에서 제외**한다 — 침묵하는 고장의 전형. (이 Phase 문서를 쓰는 도중에도 같은 함정이 재현됐다 — NUL이 섞인 텍스트는 편집 도구까지 오작동시킨다.)

## ⚠️ 함정

- NUL 교체 시 문자열의 *표기*만 바뀌고 *값*은 같아야 한다 — 테스트가 검증하는 의미를 바꾸면 리팩토링이 아니다.
- fitness 테스트의 glob 패턴이 e2e(`*.e2e.ts`, playwright 소관)를 세면 vitest 수와 어긋난다 — vitest가 수집하는 패턴만 센다.
- 고정 단언(≥402)은 이후 늘어난 파일이 다시 줄어드는 것(예: 405→404)까지는 못 잡는다(알려진 한계) — 파일 수가 늘어난 Phase를 닫을 때 기준을 올리는 ratchet 갱신은 각 Phase 재량.

## 담당 SubAgent

qa (앱 코드 접촉 없음)
