---
type: ADR 초안 (영호 검토 후 00.Documents/ADR.md에 확정 — docs=영호 단독)
proposed: ADR-025
date: 2026-07-01
milestone: LR1
status: 초안 (영호 사인오프 대기)
---

# ADR-025 (초안) — Transcript 폴백: resume 부재/실패 시 최근 대화 맥락 재주입

## 상태
초안 — 영호 검토·커밋 대기. LR1 마일스톤의 설계 근거.

## 맥락 (왜 이 결정이 필요한가)

영호 실측 버그: "옛 대화를 불러와 이어가면 Claude가 이전 내용을 기억 못 한다."

3소스(적대 코드-트레이스·계획 정독·Codex 리뷰) 수렴 진단:

1. **직접 원인(수정됨)**: `CONVERSATION_SAVE` 핸들러가 단일채팅 `sessionId`를 `store.save`로 forward 안 해 디스크에 영속 못 함 → 커밋 `fa9df22`로 수정.
2. **더 깊은 구조적 원인(미해결)**: `claudeAgentRun.ts:379`가 매 턴 **마지막 user 메시지 하나만** SDK에 보낸다. 전체 history는 main이 이미 받지만(`runtime.ts:134`) 재주입하지 않는다. 즉 **모델 맥락 복원 = 오직 `session_id` resume에만 의존**하고, **transcript 폴백이 전무**하다.

이 resume-only 설계는 원래 **ADR-013(Claude Code 본가 충실)**의 귀결이다 — 본가 CLI는 `--resume`으로 서버측 세션을 되살리고 history를 재전송하지 않는다. 그러나 그 결과:

- **resume이 실패하는 모든 경우에 앱이 조용히 기억상실**에 빠진다:
  - sessionId 없이 저장된 옛 대화(수정 이전 데이터 — 소급 불가)
  - cwd 불일치(SDK는 세션을 cwd 기준으로 찾음 — 폴더 안 고른 단일채팅)
  - 세션 만료·손상
- GUI 채팅 앱에서 사용자는 **"화면에 대화가 보이면 AI가 기억한다"**를 기본 기대한다. resume-only는 이 기대를 말없이 깬다.

## 결정

**하이브리드: resume을 주수단으로 유지하되, `resumeSessionId`가 없을 때 최근 대화 transcript를 Claude 요청에 폴백 주입한다.**

- **트리거**: `req.resumeSessionId`가 없음/빈 문자열일 때만 폴백. sessionId가 있으면 resume 우선(효율 — history 재전송 안 함, SDK 서버측 캐시 활용).
- **주입 범위**: 최근 대화를 **토큰 예산(초기값 ~8k) 안에서** 잘라 주입. 무제한 전체 주입(오버플로 위험)·요약(추가 LLM 호출) 대신 **유계 최근 transcript** 채택.
- **위치**: main 프로세스 `claudeAgentRun` prompt 빌드부. history는 이미 `this._req.messages`에 있으므로 **새 IPC·새 채널 불필요** — 신뢰 경계 표면 증가 0. **어댑터 국소 구현은 의도된 설계** — 엔진별 prompt 포맷이 상이(Claude vs Codex)하므로 폴백도 어댑터가 소유. Track2 Codex 어댑터 추가 시 각자 구현(공통 추상화는 그때 판단). (ADR-003 정합 — 정규화는 AgentEvent 출력 쪽, 입력 prompt 포맷은 어댑터 자유.)
- **포맷**: `이전 대화 맥락:\n[...]\n\n현재 사용자 메시지: [...]` 형태로 Claude가 과거 맥락으로 인지하게.
- **UI 표시**: sessionId 없이 폴백으로 복원된 대화엔 "맥락 요약 복원됨" 배지(투명성 — 사용자가 완전 resume이 아님을 인지).

## 트레이드오프

**장점**
- 영호의 실제 불편(옛 대화 회상) 직접 해결 + resume 실패 전반에 안전망.
- history가 이미 main에 있어 구현·비용이 작다(새 IPC 0, 추가 LLM 0).
- resume 주경로는 그대로라 일반 케이스 효율(토큰) 유지.

**단점 / 비용**
- **ADR-013 순수 충실에서 의도적 이탈** — 본가 CLI엔 없는 거동. AgentDeck 고유 확장으로 명시(Zustand·JSON 영속처럼 "원본 미존재 확장" 계열).
- 폴백 발동 턴은 토큰 비용↑(유계지만). 
- 아주 오래된 대화의 초기 맥락은 토큰 예산 밖이라 여전히 유실(연속성엔 충분하나 완전하진 않음).
- resume "성공했으나 맥락 없음"(cwd 불일치로 빈 세션 resume) 케이스는 이 트리거(sessionId 유무)로는 못 잡음 → 별도 견고성 수정(cwd 안정화)이 보완.

## 고려한 대안

1. **resume-only 유지 + 견고성만 강화**(폴백 없음): Claude Code 충실 유지·효율 최고. 그러나 sessionId 없는 옛 대화·resume 실패는 원리적으로 복구 불가 → 영호 불편 미해결. **기각**(사용자 기대 우선).
2. **전체 transcript 주입**: 가장 충실하나 긴 대화에서 컨텍스트 오버플로 위험. **기각**(유계가 안전).
3. **요약 주입**: 토큰 최효율·긴 대화 커버. 추가 LLM 호출(지연·비용)·구현 복잡·요약 손실. **후속 개선 후보로 이월**(초기 구현은 유계 transcript).

## 귀결 (Consequences)

- 신규 대화: resume 정상(fa9df22) — 효율 경로.
- 옛 대화/resume 실패: 유계 transcript 폴백으로 연속성 확보.
- 견고성 동반 수정(별 Phase): ① session 이벤트 즉시 저장(done 전 종료 시 sessionId 유실 방지) ② sessionKey 전환 안정화(turn1 currentSessionKey→turn2 conversationId 고아 세션) ③ cwd 안정화(단일채팅 재시작 간 cwd 일관).
- `REPL_TRANSITION.md`·ADR-024 원인 서술 정정: "held-open 증발"이 아니라 "단일채팅 저장 경로 sessionId drop + transcript 폴백 부재"로.
- ADR-013은 유지하되, "resume 실패 시 GUI UX 보장을 위한 폴백은 ADR-025로 예외"라고 상호참조.

## 미해결/후속
- 토큰 예산 초기값(~8k)의 적정치는 실사용으로 튜닝.
- 요약 폴백(대안 3)은 긴 대화 UX 개선용 후속.
- resume-miss(sessionId 있으나 빈 세션) 탐지는 cwd 안정화로 우선 방어, 필요 시 SDK 신호 조사.
