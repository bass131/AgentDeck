---
owner: youngho
milestone: H1
phase: 06
title: 통합 검증과 새 세션 인수
status: done
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 2~5h
domain: cross
depends_on: [02, 03, 04, 05]
human_gate: new-session-live-acceptance
---

# Phase 06: 통합 검증과 새 세션 인수

## 🎯 목표

독립 Hook 테스트와 doctor를 모두 통과시키고, 프로젝트 trust 후 새 세션에서만 확인 가능한 역할·모델·권한 적용을 사용자가 짧게 검증할 수 있게 한다.

## ⏪ 사전 조건

- [x] Phase 02~05의 정적 구현이 완료됐다.

## 📝 작업 내용

- [x] Hook unit/launcher test 전체를 실행한다.
- [x] doctor static 검사를 실행한다.
- [x] doctor live canary로 permission 3개·Hook launcher 4개·model 3개를 실행한다.
- [x] execpolicy canary를 실행한다.
- [x] 새 세션에서 root Full Access와 정상 shell 실행을 확인한다.
- [x] 새 세션에서 `/hooks` 네 이벤트와 repo skills를 확인한다.
- [x] custom agent의 실제 role/model label은 현재 호출 표면에서 선택할 수 없음을 확인한다(`agent_type` 인자 없음, task name 자동 매칭 없음).
- [x] secretary operations profile의 read/write 경계는 sandbox canary로 확인하고, model label은 host capability gap으로 degraded 처리한다.
- [x] 미지원 host path는 degraded mode로 문서화한다.

## ✅ 완료 조건

- [x] 모든 정적/독립 테스트가 0 fail이다(26 PASS).
- [x] live checklist에 PASS/PENDING/FAIL이 구분돼 있다.
- [x] raw prompt와 secret 내용이 로그에 남지 않는다.
- [x] push/PR/package 실행이 없다.

## 📚 학습 포인트

- 설정 파일 검증과 실제 호스트 수용 검증을 분리하면 가짜 확신을 피할 수 있다.

## ⚠️ 함정

- 현재 세션은 config·rules·agent profile을 이미 로드했을 수 있어 수정 직후 live 판정에 사용할 수 없다.

## 담당 SubAgent

사용자 승인 Harness 변경 예외로 루트 직접.
