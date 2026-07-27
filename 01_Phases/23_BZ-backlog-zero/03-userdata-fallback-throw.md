---
owner: 유영호
milestone: BZ
phase: 03
title: getUserDataPath 폴백 throw 전환 (백로그 21②)
status: done
grade: 보통
loop_track: auto-gate
domain: main-process
estimated: 1~1.5h
summary: electron 미초기화 시 조용히 사용자 홈으로 떨어지는 폴백을 throw로 바꿔 명시 주입을 강제한다. 주석-코드 불일치('/tmp' vs 실제 홈)도 정정.
---

# Phase 03: getUserDataPath 폴백 throw 전환

> **등급**: 보통 · **담당**: `main-process` · **문**: 없음 (밤 자율)
> 게이트 기준선 = [`_milestone-plan.md`](_milestone-plan.md)

## 🎯 목표

`02_Source/main/engineVersions.ts`의 `getUserDataPath()`가 electron 미초기화 + 주입 부재 상태에서 **명확한 에러를 던진다** — 사고 증폭기였던 「조용한 성공」(`os.homedir()/.agentdeck-dev` 폴백)이 사라진다. 프로덕션(main 프로세스, electron ready 후)은 영향 0.

## ⏪ 사전 조건

- [ ] Phase 02 완료 (전역 게이트가 먼저 서야 이 Phase 작업 중 오염도 감지 — 보호막 우선)
- [x] 방향 확정 — throw 전환 (영호 2026-07-27)

## 📝 작업 내용

- [ ] **소비처 전수 grep 선행** — `getUserDataPath` 직접 호출 + 이를 경유하는 export(`getVersionState`·`setActive`·`installVersion`·`loadActiveQuery` 등)의 호출처 전수. **override 없이 비-electron 컨텍스트에서 부르는 곳이 있는지** 판정. ⚠️ 발견 시 = 설계 분기 → **이 갈래 멈추고 아침 보고** (밤 계약). 목록은 이 문서 하단에 박제
- [ ] (TDD red 먼저) `engineVersions.test.ts`에 실패 테스트: override 없음 + electron `app.getPath` throw 상황에서 명확한 에러(메시지에 "overrideUserData" 포함)를 던지는지
- [ ] 구현 — catch 분기에서 `path.join(os.homedir(), …)` 반환 대신 throw. 에러 메시지는 자기설명적으로: 무엇이 없어서(electron userData), 무엇을 하라는지(테스트·standalone은 overrideUserData 주입)
- [ ] 주석 정정 — `:62` `'/tmp/agentdeck-dev' 폴백` 서술 삭제(코드와 불일치했던 옛 서술 — 성향 20 사례) + 새 동작(throw) 반영
- [ ] `os` import가 이 함수에서만 쓰였다면 정리 (다른 사용처 확인 후)

## ✅ 완료 조건

- [ ] `npx vitest run 99_Others/tests/main/engineVersions.test.ts` green (신규 throw 테스트 포함 — 증가분 기록)
- [ ] `npx vitest run` 전량 green — **폴백에 기대던 테스트가 하나도 없었음의 실증** (P07 수리로 전부 명시 주입이 된 상태가 전제. red가 나면 그 테스트가 곧 폴백 의존처 — 멈추고 보고)
- [ ] `npm run typecheck && npm run lint` 0/0
- [ ] 전역 게이트(P02) 무발화 — 홈 오염 0
- [ ] 마지막 `Tests N passed | M skipped` **원문 줄을 이 문서 하단에 박제** (🟡c — P04 등호 검산의 앵커)

## 📚 학습 포인트

- **fail-fast vs fail-silent**: 폴백은 편의처럼 보이지만 "잘못된 곳에 성공"하는 경로다. 성공이 침묵일 수 있는 자리에서는 실패가 정보다
- C#의 `InvalidOperationException` 감각 — 전제(초기화) 미충족 시 기본값이 아니라 예외

## ⚠️ 함정

- `loadActiveQuery`(SDK 동적 로드)가 IPC 밖에서 불리는 경로가 있는지 — grep에서 `standalone`·스크립트성 진입점 특히 확인
- 에러 메시지에 실제 홈 경로를 찍지 않는다 (로그에 사용자 경로 노출 최소화 — ADR-008 결)

## 담당 SubAgent

`main-process` (02_Source/main/**). 테스트 추가분은 같은 Phase에서 qa가 아니라 main-process가 함께 — 파일 겹침(engineVersions.test.ts)이 P02와 있으므로 **P02 완료 후 착수**(계획서 의존성).

---

## 📌 실측 박제 (main-process Worker, 2026-07-27 밤 — 커밋 `4675d3a`)

**소비처 전수 grep — 폴백 의존처 0 (설계 분기 없음)**: ① `main/00_ipc/handlers/engine.ts:29,98,110,121` — override 없이 호출하지만 IPC 핸들러 = `app.whenReady()` 이후 실행이라 throw 경로 도달 불가 ② `main/01_agents/queryFn.ts:57-62` — 유일한 비-IPC 호출부인데 기존 try/catch("throw 전파 금지 — 번들 폴백 흡수" 주석 명시)가 새 throw를 설계 그대로 흡수 ③ `ClaudeCodeBackend.ts:222-230` — 동일 패턴(버전 폴백) ④ 나머지는 계약·타입 참조뿐. standalone 스크립트 호출 경로 없음.

**구현**: `:56-79` catch에서 홈 폴백 반환 → `overrideUserData` 안내 throw(홈 경로 문자열 미노출 — ADR-008) · `:62` 옛 `/tmp` 주석 서술 정정 · 미사용 `os` import 제거.

**게이트 원문**: 단일 파일 35 passed · 전량 **`Tests 5352 passed | 10 skipped (5362)`** (P02 앵커 5350+2 — 증가분 = 신규 throw 테스트 2건 정확 일치) · typecheck/lint 0/0 · P02 홈 게이트 무발화. TDD red 선행 확인(`expected [Function] to throw`).
