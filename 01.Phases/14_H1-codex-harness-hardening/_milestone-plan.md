---
owner: youngho
milestone: H1
title: Codex Harness 실행 계약과 비용 계층 보강
status: done
grade: 대규모
risk: harness
loop_track: human-gate
domain: cross
---

# H1 — Codex Harness 실행 계약과 비용 계층 보강

## 목표

Claude 정본의 의미를 보존하면서 Codex Harness가 실제 런타임에서 역할·권한·Hook·모델 계층을 검증 가능하게 적용하도록 수리한다. 제품 코드와 LR4 P02는 범위에서 제외한다.

## 결정

- Harness 자체 변경은 사용자 승인에 따라 루트가 직접 수행하며 SubAgent에 편집을 위임하지 않는다.
- 모델 기본값은 판단 난도에 따라 Sol(복잡한 판단), Terra(일반 구현), Luna(명확한 운영)로 나눈다.
- 메인 Supervisor는 Full Access, SubAgent는 역할별 최소 권한 profile을 사용한다.
- Hook은 보안 경계가 아니라 실수 방지 장치로 기술하고, sandbox·approval·rules와 함께 사용한다.
- 현재 호스트가 custom agent 프로필을 실제 적용하는지는 새 세션의 live doctor가 확인하기 전까지 `미검증`으로 표시한다.

## Phase

| Phase | 제목 | 선행 | 핵심 완료 조건 |
|---|---|---|---|
| 01 | 실행 계약과 doctor | 없음 | 역할 9개·Hook digest·bridge 정적 검사 red→green |
| 02 | 권한과 비밀 경계 | 01 | execpolicy prompt/forbidden canary + `.env` deny-read profile |
| 03 | 입력 명확성 게이트 | 01 | prompt 원문 비기록·semantic reminder 주입 |
| 04 | Sol·Terra·Luna 모델 계층 | 01 | 9개 역할 모델·reasoning 정적 검증 |
| 05 | Claude 정본·Codex bridge 드리프트 | 01 | stale 경로·역할 수·명령 의미 불일치 0 |
| 06 | 통합 검증과 새 세션 인수 | 02~05 | Hook/doctor/execpolicy green + 수동 live checklist |

## 사람 게이트

- `.codex/config.toml`의 기본 permissions와 `.codex/rules/**`는 새 세션에서만 확실히 반영되므로 적용 전 diff 검토와 프로젝트 trust가 필요하다.
- push, PR, merge, 배포, package는 이 마일스톤에서도 실행하지 않는다.
- custom agent의 실제 모델 표시와 `SubagentStart.agent_type` 전달은 새 세션에서 사용자가 확인한다.
