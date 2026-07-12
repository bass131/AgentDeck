---
owner: 영호
milestone: HR1
phase: 04
title: 훅 관측성 리뉴얼 — systemMessage 전환 + guard-blocks.log
status: pending
grade: 복잡
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: 훅 알림을 사용자에게 보이는 공식 채널(JSON systemMessage)로 전환하고 발화·차단 원장 guard-blocks.log를 신설한다.
---

# Phase 04: 훅 관측성 리뉴얼 — systemMessage 전환 + guard-blocks.log

> **상태**: pending · **마일스톤**: HR1 · **등급**: 복잡 · **담당**: 메인 직접(하네스 봉인 해제 필요) — H3 안건 ④ 승격 건

---

## 🎯 목표

훅이 발화·차단할 때 **사용자 눈에 보인다**. 알림형 훅은 transcript에 systemMessage로 표시되고, 모든 발화·차단은 `guard-blocks.log`에 남아 사후 확인 가능하다.

**근거(공식 확정 2026-07-12, claude-code-guide)**: PreToolUse/PostToolUse의 stderr(exit 0)는 debug 로그 전용 — 사용자 UI 미표시. exit 2의 stderr도 모델에게만 전달. 사용자 표시 공식 수단 = JSON 출력 `systemMessage` 필드(전 이벤트, exit 0).

## ⏪ 사전 조건

- [ ] 없음 (P02와 병렬 가능 — 어댑터 구현 세부라 코어 추출과 독립)
- [ ] 유지보수 창 개방 (`.claude/hooks/**` = 봉인 대상)

## 📝 작업 내용

- [ ] **알림형 훅 전환**: risk-detector · reviewer-auto-trigger · convention-size-guard 등 `echo >&2` → stdout JSON `{"systemMessage": "..."}` (exit 0)
- [ ] **차단형 훅**: supervisor-guard · dangerous-cmd-guard · tdd-guard(차단 모드) — exit 2 + stderr(모델 피드백) 유지, 대신 로그 append 추가
- [ ] `hook-common.sh`에 공용 함수 신설: `emit_system_message "<msg>"` + `log_guard_event "<hook>" "<action>" "<detail>"`
- [ ] `guard-blocks.log` 신설: 위치 `.claude/state/guard-blocks.log`(gitignored — state 규약 정합), 형식 `ISO시각 | 훅명 | notify/block | 요지`, 크기 상한 로테이션(예: 512KB 초과 시 `.1`로 밀기)
- [ ] 훅 출력 검증: 전환 대상은 `.sh` 훅이라 기존 `_lib` 테스트(done-report-policy·shell-policy)는 대상이 아님 — 신규 경량 테스트(페이로드 주입 → stdout JSON 파싱 단정)를 추가하거나, `bash -n` + 라이브 프로브로 커버함을 명시 (plan-auditor 🟡#4) + `bash -n` 전 훅 구문 검사
- [ ] **라이브 프로브 2종**: ① 알림형 발화 → transcript에 systemMessage 표시 확인 ② 차단형 발동 → 차단 + log append 확인
- [ ] secretary: 커밋 + CHANGELOG [H]

## ✅ 완료 조건

- [ ] 라이브 프로브 2종 PASS (트랜스크립트 표시 + log 기록 — 영호 육안 확인 포함)
- [ ] 훅 테스트 green + `bash -n` 10/10
- [ ] 기존 차단 semantics 회귀 0 (supervisor-guard·dangerous-cmd-guard 차단 프로브 여전히 exit 2)
- [ ] (분기) systemMessage 미지원 이벤트가 실측에서 발견되면 해당 훅은 log-only로 강등 + 함정 섹션에 실측 박제 — 프로브 실패로 간주하지 않음 (plan-auditor 🟡#3)

## 📚 학습 포인트

- **stdout/stderr는 "누가 읽는 채널인가"가 다르다** — 같은 출력이라도 소비자(사용자 UI/모델/debug 로그)가 이벤트·exit code별로 다름. 관측성 설계는 채널 선택에서 시작.
- **append-only 원장** — 상태를 덮어쓰지 않고 사건을 누적하면 사후 감사(audit)가 가능해진다.

## ⚠️ 함정

- **stdout에 JSON 외 텍스트 섞이면 파싱 실패** — 전환한 훅은 stdout에 JSON 단독만.
- **exit 2와 JSON 출력은 병행 불가**(exit 0에서만 JSON 해석) — 차단형에 systemMessage를 욕심내지 말 것. 차단 가시성은 log + (모델이 전달하는) stderr로.
- 이벤트별 JSON 지원 차이 가능 — 각 훅의 실제 이벤트(PreToolUse/PostToolUse/UserPromptSubmit)에서 라이브로 확인 후 확정.
- Windows 줄바꿈 — `.gitattributes` LF 고정 대상에 신규 파일 포함 확인.

## 담당 SubAgent

메인 직접(하네스 = 영호 단독 통제 대행, 유지보수 창) + secretary(커밋·CHANGELOG)
