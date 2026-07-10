---
owner: youngho
milestone: H1
phase: 01
title: 실행 계약과 Harness doctor
status: done
grade: 복잡
risk: harness
loop_track: auto-gate
estimated: 2~5h
domain: cross
depends_on: []
human_gate: false
---

# Phase 01: 실행 계약과 Harness doctor

## 🎯 목표

문서상 약속과 실제 Codex 구성의 차이를 정적 검사로 재현하고, 신뢰 후 새 세션에서 확인할 항목을 doctor가 명확히 구분한다.

## ⏪ 사전 조건

- [x] Harness read-only 감사 결과가 있다.
- [x] 사용자가 Harness 수리를 승인했다.

## 📝 작업 내용

- [x] 역할 9개 이름·TOML 필수 필드·sandbox/permissions를 검사한다.
- [x] Hook script SHA-256 digest가 `hooks.json` 명령과 일치하는지 검사한다.
- [x] skill bridge 대상과 Claude 정본 파일의 존재를 검사한다.
- [x] `.claude/state/**`를 Codex runtime이 참조하지 않는지 검사한다.
- [x] live-only 항목은 자동 통과로 위장하지 않고 수동 checklist로 출력한다.

## ✅ 완료 조건

- [x] 실패 계약 테스트를 먼저 실행해 red를 확인했다.
- [x] Hook·Harness 계약 테스트 26개가 0 fail이다.
- [x] `node .codex/harness-doctor.mjs`가 static PASS와 live PENDING을 구분한다.

## 📚 학습 포인트

- 정적 구성 검사는 “파일이 맞다”를, live acceptance는 “호스트가 실제로 적용했다”를 검증한다.

## ⚠️ 함정

- 존재하지 않는 임의 `agent_type`을 넣고 exit code 0만 확인하면 역할 주입을 검증한 것이 아니다.

## 담당 SubAgent

사용자 승인 Harness 변경 예외로 루트 직접.
