---
owner: 영호
milestone: FB2
phase: 04
title: 슬래시 목록 미표시 진단·수정 — 기존 command.list/skill.list 인프라 확장
status: pending
grade: 보통
risk: trust-boundary
loop_track: auto-gate
estimated: 2h
domain: main-process
summary: 로컬 커맨드·스킬 조회 기능은 이미 존재(command.list/skill.list) — 영호 환경에서 안 뜨는 원인을 진단하고 기존 스캐너를 확장 수정. 신규 채널 절대 금지
---

# Phase 04: 슬래시 목록 미표시 진단·수정 — 기존 command.list/skill.list 인프라 확장

## 🎯 목표

`/` 팔레트에 로컬 프로젝트 커맨드·스킬이 실제로 뜨게 한다 — **기존 인프라의 버그/한계 수정으로**(신규 IPC·신규 스캐너 금지, plan-auditor 🔴-1 봉합 조건).

## ⏪ 사전 조건
- [ ] 없음 (독립).

## 📝 작업 내용
- [ ] **진단 먼저**(파일:라인 실증): 기존 경로 = `shared/ipc/settings.ts:27`(COMMAND_LIST)·`:59`(SKILL_LIST) → `main/00_ipc/handlers/settings.ts:105-116`·`:49-52`(getCurrentWorkspaceRoot 주입) → `main/05_settings/commands.ts:305-330`·`skills.ts:297-322`(스캔) → `renderer useSlashPalette.ts:91-102`(렌더). 어느 링크에서 끊기는지 특정.
- [ ] 유력 후보 2개 우선 검증(감사 특정): (a) 중첩 폴더 `:` 네임스페이스 미지원 — `commands.ts:223`이 하위 디렉토리 skip(flat 스캔만), 영호 프로젝트는 `.claude/commands/work/plan.md`류 중첩 사용 이력 (b) 멀티패널 독립 cwd(`shared/ipc/multi.ts:154`)와 전역 currentWorkspaceRoot 불일치.
- [ ] 원인 확정 후 **기존 `commands.ts`/`skills.ts`/핸들러 확장으로 수정**(예: 재귀 스캔+`:` 네임스페이스). 원인이 renderer 쪽이면 수정하지 말고 보고(도메인 경계).
- [ ] 신뢰경계 유지: 반환은 기존 4필드(name/description/argHint/scope) 원칙, 워크스페이스 루트 밖 탈출 방지 기존 방어 보존.
- [ ] 단위 테스트: 픽스처 기반(중첩 커맨드 네임스페이스·스킬·빈 폴더), 기존 테스트 무삭제.

## ✅ 완료 조건
- [ ] 원인 보고(파일:라인)
- [ ] typecheck 0
- [ ] test green
- [ ] lint 0
- [ ] reviewer(trust-boundary) CRITICAL 0

## 📚 학습 포인트
- "기능이 없다"와 "있는데 안 보인다"의 진단 차이 — 신규 구축 전 기존 인프라 전수 조사가 왜 먼저인가(이번 plan-auditor 🔴가 산 교훈).

## ⚠️ 함정
- 신규 채널·신규 스캐너 생성 = 즉시 중단 사유(IPC 단일 정의 위배).
- renderer 경로 주입 방식 금지(main이 workspaceRoot 자체 결정 — 기존 CRITICAL 주석 준수).

## 담당 SubAgent
main-process
