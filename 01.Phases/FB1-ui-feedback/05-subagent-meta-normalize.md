---
owner: 영호
milestone: FB1
phase: 05
title: SubAgent 내부 메타 정규화 — 하네스 내부 텍스트가 UI에 노출되지 않게
status: done
grade: 보통
risk: backend-contract
loop_track: auto-gate
estimated: 1.5h
domain: agent-backend
summary: "Async agent launched successfully... agentId... Do NOT Read..." 류 하네스 내부 도구 결과가 SubAgent 상세에 그대로 노출 — 어댑터 정규화 계층에서 사용자 표시용으로 분리
---

# Phase 05: SubAgent 내부 메타 정규화

> 근거 스크린샷: `UC1-ultracode-redesign/Screenshot/SubAgent_상세페이지가_사람이 읽기에 정보가 너무 난잡함....png` — 하단 블록에 agentId·output_file·"Do NOT Read or tail" 등 **하네스 내부 지침 원문**이 사용자에게 그대로 보임.

## 🎯 목표

SDK가 어댑터에 주는 백그라운드 에이전트 launch/결과 메타 텍스트가 **엔진중립 이벤트로 정규화되는 시점에 사용자 표시용 필드와 내부 메타로 분리**되어, renderer(SubAgent 상세)에는 사람이 읽을 정보만 도달한다.

## ⏪ 사전 조건
- [ ] 없음 (독립)

## 📝 작업 내용
- [ ] 원인 실증: 스크린샷의 원문 블록이 `subagent`/`tool_result` 이벤트 중 어느 필드로 renderer에 도달하는지(eventNormalizer/claude-stream 경로, 파일:라인) 특정.
- [ ] 어댑터 정규화 시 내부 메타(agentId 지침·output_file 경로·harness 주의문)를 표시 필드에서 제거 또는 구조화(예: 결과 요약만 남김). **판별은 파싱 규칙 기반**(취약한 자연어 휴리스틱 최소화 — 실제 SDK 출력 포맷 실측 후 결정, 포맷 근거 보고).
- [ ] 골든 테스트: 실측 캡처 기반 픽스처 → 정규화 후 내부 메타 부재 단언. 기존 subagent 이벤트 테스트 정합(케이스 삭제 금지).

## ✅ 완료 조건
- [x] typecheck 0 / test green / lint 0 / reviewer(backend-contract) CRITICAL 0
- [x] shared 이벤트 스키마 변경 최소(가급적 0 — 필드 추가 필요 시 additive + shared-ipc 위임 보고)

## ⚠️ 함정
- 신뢰경계: raw payload를 더 노출하는 방향 금지 — 줄이는 방향만.
- 과필터로 실제 결과 텍스트까지 지우지 말 것 — 픽스처로 경계 고정.

## 담당 SubAgent
agent-backend
