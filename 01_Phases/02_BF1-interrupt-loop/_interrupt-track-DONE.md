---
owner: 영호
milestone: BF1-interrupt-loop
track: interrupt (P01~P03)
status: done
grade: 복잡 (P03 backend-contract 상향)
completed: 2026-07-01
summary: 채팅 네모(stop) 버튼이 진행 중 메시지를 중단 못 하고 에러만 뱉던 버그 — interrupt-result error suppress로 해결, 세션 유지(ADR-024). 코드 정독 가설을 실 SDK 실측이 정정.
---

# BF1 Interrupt 트랙 (P01~P03) 완료 보고

> **종결 커밋**: `45200e9`(Phase정의) · `ceb9634`(P02 RED) · `9e31870`(P02 정정) · `efb5311`(P03 fix)
> 브랜치 `fix/bf1-interrupt-loop` (미push — 마일스톤 전체 1 PR 전략, push/PR=영호 게이트)

## 1. 무엇을 (목표)
채팅 네모(stop) 버튼이 진행 중인 메시지를 실제로 중단하지 못하고 `Agent execution error`만 뱉던 버그 수정. + 중단 후 같은 대화 세션이 유지되어 다음 메시지가 맥락을 잇도록(ADR-024 "interrupt ≠ abort").

## 2. 어떻게 (과정)
- **P01 재현·진단**: `replMode=true`에서 네모→에러 재현. 코드 정독으로 "throw→catch 오라벨"(가설 C) 세움.
- **P02 RED 테스트**: mock query로 interrupt 버그 고정(3 케이스).
- **실 SDK 실측(probe)**: 코드 정독 가설을 *실측으로 정정* — interrupt는 throw가 아니라 `result(is_error=true, subtype=error_during_execution)`를 emit. 같은 `session_id`로 turn2 정상 처리(세션 SDK상 살아있음).
- **P02 mock 정정**: throw→result-emit. 케이스 ③을 RunManager 통합으로 이동(세션죽음 진짜지점 = `agent-runs.ts:198`).
- **P03 수정**: `claudeAgentRun.ts`에 `_interrupted` 플래그 → 펌프가 interrupt-result의 error 이벤트 suppress → agent-runs terminal 판정 회피 → 세션 유지. **한 파일**(agent-runs/normalizer/claude-stream 무수정).

## 3. 핵심 발견 (학습)
- **코드 정독 < 실측**: throw 가설이 틀렸고, 실 SDK probe가 result-emit + `agent-runs.ts:198` error terminal을 잡음. **SDK는 세션을 살려두는데 AgentDeck이 interrupt-result를 error로 오해해 *스스로* 닫던 것.** 혼자 코드만 읽었으면 catch 블록(엉뚱한 곳)을 고쳤을 것.
- **테스트 자기모순**: P02 ③의 RED 증거 단언(error 표면화 `toBe(true)`)이 GREEN 타깃(error suppress)과 양립 불가 → `toBe(false)`로 정정. RED 전용 단언이 GREEN과 충돌하는 TDD 함정.
- **claude-code-guide + probe 조합**: SDK 타입만으론 불충분 → 실 제어동작 1회 관측이 (가) 실현가능성 + 수정 위치를 동시 확정.

## 4. 검증 (게이트)
- `npm run test` 3850 passed (P02 ①②③ GREEN, 단발 `_runPump` 회귀 0).
- `typecheck`/`lint` 0, `build` green.
- **reviewer GO** (🔴0): ADR-024 세션유지 불변식 · abort/interrupt 의미 분리(`_aborted` vs `_interrupted`) · 플래그 리셋 안전(error+done 원자 쌍 실측).
- **영호 육안**: ① 네모→에러 없이 중단 OK ② 다음 메시지 맥락 유지 OK.

## 5. 잔여·후속
- 🟡(비차단): `_interrupted` 안전성이 "interrupt→result(is_error) 1쌍" SDK 불변식에 의존 → 필드 주석에 회귀 추적점 박음(efb5311).
- **자동실측 정책 제안**(영호 결정 대기): 3단 — 결정적 UI/이벤트=Playwright `_electron` 자동 / 구조질문=코드 정독 / 실LLM 비결정=attended e2e 1회. `work-judge.md`/`loop-driver.md` 변경이라 영호 단독 통제(AI 초안만).
- probe 스크립트 `bf1_interrupt_probe.mjs`(스크래치) — P03 검증 재사용 가능, 세션 종료 시 정리.
- **다음**: P04(loop = "목표 달성까지 반복 자율형 Goal" 기능 결정).
