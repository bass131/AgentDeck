---
owner: 영호
milestone: LR1
phase: 02
title: transcript 폴백 — resume 부재/실패 시 최근 대화 재주입 (ADR-025)
status: pending
grade: 복잡
risk: backend-contract
loop_track: auto-gate
domain: agent-backend
summary: resumeSessionId가 없을 때 최근 대화 transcript를 모델 컨텍스트 창 예산으로 Claude prompt에 주입해, sessionId 없는 옛 대화·resume 실패에서도 맥락 연속성을 확보한다. 모델 컨텍스트(유계) ↔ 채팅 기록(전체) 분리. history는 이미 main(_req.messages)에 있으므로 새 IPC 불필요.
---

# Phase 02 — transcript 폴백 (ADR-025 핵심)

> **성격**: 마일스톤의 본체. 영호 실불편("옛 대화 이어가면 기억 못 함")의 구조적 원인(resume-only, 폴백 전무)을 닫는다.

## 🎯 목표
`resumeSessionId`가 없거나 빈 문자열일 때, `claudeAgentRun`이 최근 대화 transcript를 **모델 컨텍스트 창 예산 안에서**(응답·시스템 여유분 제외) 잘라 Claude prompt에 프리앰블로 주입한다. sessionId가 있으면 기존 resume 경로(마지막 메시지만) 유지 — 회귀 0. **개념: 모델 컨텍스트(유계 투영) ↔ 채팅 기록(전체)을 분리**(ADR-025, 영호).

## ⏪ 사전 조건
- Phase 01 done (sessionId 저장 — `fa9df22`).
- **ADR-025 영호 사인오프** (`_adr-025-transcript-fallback-draft.md` → ADR.md 커밋). ← 이게 없으면 착수 금지(설계 근거).

## 📝 작업 내용
1. **TDD RED 먼저** (qa): `resumeSessionId` 없을 때 SDK로 넘어가는 `prompt`에 직전 대화 메시지들이 포함됨을 검증하는 실패 테스트. resumeSessionId 있을 때는 `prompt`=마지막 user 메시지만(회귀 고정).
2. **폴백 빌더** (`claudeAgentRun.ts` `_runPump`/`_runPersistentPump` 공통): `resumeSessionId` 없으면 `_req.messages`에서 최근 user/assistant 메시지를 **모델 컨텍스트 창 예산** 안에서 뒤에서부터 채워 프리앰블 구성. 예산 = 모델별 창 크기 − 응답·시스템 여유분(고정 8k 상수 아님, 게이지 `lastContextWindow` 인프라 재활용).
3. **경량 토큰 근사**: 정확 tokenizer 불요 — 문자수/4 등 근사로 창 예산 컷(과주입/오버플로 방지가 목적).
4. **포맷 헬퍼**: `이전 대화 맥락:\n{role}: {text}\n...\n\n현재 메시지: {lastUser}` 형태. Claude가 과거 맥락으로 인지하고 현재 메시지와 구분하게.
5. resumeSessionId 있으면 **기존 경로 그대로**(`prompt = lastUserMsg.content`).

## ✅ 완료 조건 (정량)
- RED→GREEN: 폴백 주입 테스트 통과 + resumeSessionId 있을 때 회귀 테스트(마지막 메시지만) 통과.
- 컨텍스트 창 예산 초과 시 **오래된 것부터 잘림**을 단위 테스트로 검증(오버플로 불가).
- `npm run typecheck` green (main) · `npm run test` baseline 비감소 · `npm run lint` 0.
- **reviewer 통과** (backend-contract 깃발 — 무조건).
- (수동) 영호 실앱: 폴더 선택한 새 대화 심기→앱 완전재시작→회상 확인(Phase 05 e2e가 자동화).

## 📚 학습 포인트
- **resume(서버측 세션) vs prompt 주입(클라이언트측 맥락)** 의 차이 — 전자는 SDK가 session_id로 서버에서 복원, 후자는 우리가 history를 다시 보냄.
- 토큰 예산과 컨텍스트 윈도우 관리.
- Claude Code 충실도(ADR-013) vs GUI UX(ADR-025)의 의도적 트레이드오프.

## ⚠️ 함정
- **이중 맥락**: resumeSessionId 있을 때도 주입하면 SDK 세션 맥락 + 우리 프리앰블이 겹쳐 토큰 낭비·혼란 → **트리거를 sessionId 유무로 엄격히**.
- **메시지 종류**: user/assistant만 주입. 시스템/도구 노이즈 배제.
- **오인 방지**: 프리앰블이 "지금 사용자가 말하는 것"으로 읽히지 않게 라벨 명확히.
- **시크릿(ADR-008)**: messages content만 — API 키·경로 시크릿 주입 절대 금지.
- **held-open/단발 양 경로**: 폴백 빌더를 둘 다에 적용(공통 헬퍼) — 한쪽만 하면 모드별 비대칭 재발.

## 담당 SubAgent
agent-backend (`02.Source/main/01_agents/**`) + qa(RED 테스트). reviewer 무조건.
