---
owner: 영호
milestone: LR2
phase: 04
title: held-open sessionKey 전환 안정화 — 완료 보고 (-DONE)
status: done
grade: 복잡 (backend-contract 깃발이었으나 실구현은 renderer-only — main·IPC 무변경)
date: 2026-07-03 (야간 무인)
summary: 신규 대화 turn1(UUID 키)→turn2(conversationId 키) 키 flip으로 held-open 세션이 고아로 남던 누수를 "선저장(pre-save)" 접근으로 제거. 키가 대화 생애 내내 conversationId로 불변. ADR-024 🔴 최대위험 구역(agent-runs.ts)은 0줄 변경.
---

# LR2 Phase 04 — held-open sessionKey 전환 안정화 완료 보고

> 브랜치 `feature/lr2-loop-replmode` · 야간 무인(overnight-0703) [야간6].

## ① 무엇을 / 왜
`runtime.ts` `resolvedSessionKey = convId ?? currentSessionKey` 때문에 신규 대화의 turn1은
`currentSessionKey`(UUID)로 held-open 세션을 등록하고, turn1 후 저장으로 conversationId가
생기면 turn2가 conversationId를 키로 사용 → main `persistentRuns`(agent-runs.ts:156) 키 miss →
**새 세션 생성 + turn1 세션 고아 잔존**(자원 누수 — 맥락은 resume으로 보존되나 아무도 안 듣는
세션이 앱 종료까지 잔존).

## ② 어떻게 (선저장 — Phase 명시 옵션 중 "키 소스 일관화")
`runtime.ts` sendMessage +9줄이 변경 전부:
- `replMode && conversationId === null`이면 agentRun **전에** `await saveConversation()` →
  conversationId 선확정 → 키가 대화 생애 내내 conversationId로 불변(재시작·전환-복귀에도 동일 소스).
- 저장 실패/빈 thread(카드 커맨드 첫 발화)는 `currentSessionKey` 폴백(기존 거동, `.catch` 무해화).
- **agent-runs.ts(ADR-024 "🔴 회귀 최대위험 구역")·IPC 계약·shared/preload 전부 무변경** —
  reviewer가 git 실측으로 확정. 재사용/`done→delete` 라이프사이클은 기존 로직 그대로,
  키가 안 바뀌므로 자연히 재사용 유지.

대안 트레이드오프: main-side 재키잉(새 IPC 필요 — 야간 정지 버킷) / bgRuns에 키 스냅샷
(P3b 결합 복잡도) 대비, 선저장은 IPC 왕복 1회(신규 REPL 대화 첫 send 한정)를 지불하고
상태 머신 추가 없이 키 불변식을 얻는 최소 수리.

## ③ 검증 (기계 게이트)
- TDD: `lr2-04-sessionkey-stability.test.ts` **T1 RED 실측**(turn1 UUID ≠ turn2 convId) →
  구현 후 GREEN. T2 기존 대화 회귀 0 · T3 단발(OFF) 무영향 · T4 저장 실패 폴백.
- 기존 `repl-mode.test.ts` R5a-3 계약 갱신 2곳(옛 "UUID 유지" 계약 → 새 "선저장 convId가 키" 계약,
  mock 고정 id → 증가 id — reviewer가 "필수 수정·의도 보존" 판정).
- 전체 **3897 test green**(254 files) · typecheck 0 · lint 0.
- **라이브 probe PASS**(probe 4/12): 새 빌드로 held-open 재시작 e2e 재실행 — 1차 기동이 정확히
  "REPL ON 신규 대화 첫 send"(선저장 경로)를 밟고 sessionId 영속·재시작 회상 정상.
- **reviewer 🟢**(위반 0 · 8/8축, 🟡 관찰 3): 🟡-2(호출카운트 타이밍 결합 단언)는 키 값 단언으로
  교체 반영. 🟡-1(첫 send IPC 왕복 1회 지연)은 설계 트레이드오프로 수용. 🟡-3(backendId 리터럴)은
  기존 코드 — 멀티엔진 단계 백로그.

## ④ 트레이드오프 / 미해결
- **첫 send 지연**: 신규 REPL 대화의 첫 send에만 conversationSave IPC 왕복 1회 추가(디스크 JSON
  쓰기 — 체감 미미 예상, 아침 육안 시 확인 가능).
- **잔여 엣지(의도적 수용)**: 신규 대화의 *첫 발화가 슬래시 카드 커맨드*면 payload=null이라
  선저장 무효 → 그 대화 첫 일반 메시지 시점에 키 flip 1회 가능. 수정 전(모든 신규 대화 flip)의
  엄격한 부분집합 = 순개선. 완전 봉합은 카드 커맨드 저장 정책 결정 필요(영호).
- **고아 "0" 단언의 범위**: 이 수리는 flip으로 인한 고아 *생성 경로*를 제거. 이미 떠 있는 고아
  회수 로직은 불필요(closeAll이 앱 종료 시 일괄 정리 — 기존 보장).

## ⑤ 다음
- [야간7] LR2-03 — loop GUI (구현+스크린샷만, **커밋 금지**, 아침 육안).

## 🎓 배운 것
1. **키 불변식은 상태 추가보다 소스 일관화로.** "세션 시작에 쓴 키를 기억"(상태 추가) 대신
   "키의 소스를 하나로"(선저장) — 불변식이 구조적으로 성립하면 지킬 코드가 없다.
2. **🔴 위험 구역은 우회 가능한지부터.** backend-contract 깃발 Phase였지만 실구현은 renderer-only —
   위험 구역 무변경이 최선의 회귀 방어.
3. **mock 아티팩트 주의.** 고정 id mock이 "새 대화=새 키" 테스트를 거짓 실패시킴 — mock은
   실 시스템의 *구별 가능한* 거동(고유 id 발급)을 미러해야 한다.

## 산출물
- 앱 소스: `02.Source/renderer/src/store/slices/runtime.ts`(+9줄).
- 테스트: `99.Others/tests/renderer/lr2-04-sessionkey-stability.test.ts`(신규 4) ·
  `repl-mode.test.ts`(계약 갱신 2곳).
