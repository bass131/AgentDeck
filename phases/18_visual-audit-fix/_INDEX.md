# Phase 18 — 시각 audit fix (멀티 피커 공유화 + 인사말 + todos scroll)

> 시각 전수 audit 1차 패스(task #1, replica-loop 메모리)에서 확정된 nit을 수정.
> **핵심 패턴**: 1:1 이식 컴포넌트는 전부 충실. nit은 **단일/멀티 피커가 두 컴포넌트로 갈리며 멀티 옵션이 드리프트**한 것 + 인사말 동적데이터 미연결.

## 사용자 결정 (2026-06-23)
- **모델명**: 우리 정식 ID + **Fable 5 포함** → Fable 5 / Opus 4.8 / Sonnet 4.6 / Haiku 4.5 (원본 Sonnet 4.7/Haiku 4.6 대신 우리 claude-api 값).
- **Bypass 모드**: 단일/멀티 **공유 모드셋**으로 제대로 도입 (일반/플랜/모두 허용/자동/Bypass[빨강+경고]).
- 범위: "audit만 계속" 보류 해제 → 이제 fix.

## 근본 해결 (드리프트 재발 차단)
원본 AgentCodeGUI는 단일/멀티가 **같은 Pick + 같은 MODELS/EFFORTS/MODES**(Chat.tsx L73~94)를 공유. 우리는 `Composer.tsx`(단일)와 `multiAgentSampleData.ts`(멀티)가 옵션을 **독립 정의** → 드리프트. → **공유 옵션 모듈 신설**해 양쪽이 import.

## nit 인벤토리 (task #1 상세)
| # | 위치 | 수정 |
|---|---|---|
| N1 | Conversation.tsx:55 | "무엇을 도와드릴까요?" → "무엇을 도와드릴까요, {닉}님?" (닉=SAMPLE_USER.name) |
| N2 | MultiWorkspace RunPickers L150 | caption "노력" → "Effort" |
| N3 | EFFORT 라벨 매핑 | xhigh "최대" → "매우 높음" (원본 xhigh=매우높음, max=최대) |
| N4 | 모델 라벨 | "Opus" → "Opus 4.8" 등 (+ Fable 5 추가) |
| N5 | 모드 | "자율" → "Bypass" 영문 + var(--red) + warn 아이콘(IconAlert) |
| N6 | MultiWorkspace L250·L309 | "/ 200,000 토큰" → "/ 1M 토큰" (used = ctxPct/100 * 1,000,000) |
| N7 | AgentPanel todos | className "todos" → "todos scroll" (thin 스크롤바) |

의도적 갭(수정 아님): N8 WhatsNew 풀스크린 비디오 생략.

## 공유 옵션 스펙 (원본 Chat.tsx L73~94 기준, 모델명만 우리 값)
- **MODELS**: Fable 5(fable, gold) / Opus 4.8(opus, violet) / Sonnet 4.6(sonnet, blue) / Haiku 4.5(haiku, teal). ctx 1M(haiku는 원본 200이나 시각 셸 단순화 — 표시는 1M 유지).
- **EFFORTS**: 최대(max) / 매우 높음(xhigh) / 높음(high) / 보통(medium) / 낮음(low) / 최소(minimal).
- **MODES**: 일반(normal,shield) / 플랜(plan,plan) / 모두 허용(acceptEdits,check) / 자동(auto,bolt) / Bypass(bypass, red, warn:true, IconAlert).
- 기본값: 단일 = opus/xhigh/auto, 멀티 = opus/xhigh/bypass (현재 보이는 기본 표시 보존: Opus 4.8 / 매우 높음 / 자동(단일)·Bypass(멀티)).

## 검증
- renderer Worker TDD (tdd-guard 활성). typecheck + vitest green.
- 기존 테스트 갱신: composer-trays, multiagent-f13, agentpanel-detail, conversation/chat-empty.
- 시각 재검증(메인 세션): rebuild → 멀티 그리드 + 단일 컴포저 + 빈채팅 캡처 → 원본 대조.
- reviewer: CRITICAL 0. 새 IPC 0(renderer-only).
