---
owner: youngho
milestone: H1
phase: 02
title: 권한 규칙과 비밀 파일 경계
status: done
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 2~5h
domain: cross
depends_on: [01]
human_gate: new-session-trust
---

# Phase 02: 권한 규칙과 비밀 파일 경계

## 🎯 목표

Claude의 ask/deny 의미를 Codex의 permission profile과 execpolicy rules로 옮겨 비가역 명령은 승인 요청, 임의 다운로드와 비밀 파일 읽기는 거부한다.

## ⏪ 사전 조건

- [x] Phase 01 doctor 계약이 있다.

## 📝 작업 내용

- [x] root Full Access 기본값과 worker/read-only 권한 프로필을 분리한다.
- [x] `.env*`와 `secrets/**` deny-read glob을 설정한다.
- [x] push, PR create/merge, release, package, publish를 prompt rule로 둔다.
- [x] curl/wget 계열을 forbidden rule로 둔다.
- [x] `codex execpolicy check` canary를 계약 검사에 포함한다.

## ✅ 완료 조건

- [x] prompt/forbidden/not-match canary가 예상 decision을 반환한다.
- [x] custom agent TOML이 `sandbox_mode`와 `default_permissions`를 혼용하지 않는다.
- [x] 세 custom permission profile이 Windows sandbox에서 초기화된다.
- [x] 새 세션 적용 전 사람 검토 항목이 README에 있다.
- [x] trusted 새 세션에서 root Full Access를 live 확인한다.
- [x] permission profile 자체의 deny/write 경계는 live canary로 확인하고, custom selector 미지원은 degraded로 수용한다.

## 📚 학습 포인트

- Hook은 일부 도구만 보지만 sandbox와 execpolicy는 실행 권한 계층에서 보완한다.

## ⚠️ 함정

- project config의 rule은 프로젝트 trust 전에는 로드되지 않는다.

## 담당 SubAgent

사용자 승인 Harness 변경 예외로 루트 직접.
