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

- [x] **알림형 훅 전환**: risk-detector · reviewer-auto-trigger · convention-size-guard 등 `echo >&2` → stdout JSON `{"systemMessage": "..."}` (exit 0)
- [x] **차단형 훅**: supervisor-guard · dangerous-cmd-guard · tdd-guard(차단 모드) — exit 2 + stderr(모델 피드백) 유지, 대신 로그 append 추가
- [x] 차단형 사용자 가시화 라이브 검증: PreToolUse에서 exit 2 대신 stdout JSON `permissionDecision: "deny"` + `systemMessage` 병행이 가능한지 실측 — 가능하면 차단도 사용자 가시 채널 확보(불가면 log + 모델 경유 유지로 명시 축소) (Codex adversarial #6)
- [x] `hook-common.sh`에 공용 함수 신설: `emit_system_message "<msg>"` + `log_guard_event "<hook>" "<action>" "<detail>"`
- [x] `guard-blocks.log` 신설: 위치 `.claude/state/guard-blocks.log`(gitignored — state 규약 정합), 형식 `ISO시각 | 훅명 | notify/block | 요지` — **구조화 allowlist 필드만 기록**(원시 payload·명령 인자 금지 + redaction 규칙), 라인 단위 append 직렬화(동시 훅 실행 대비 — 단일 writer 또는 lock), 크기 상한 로테이션(512KB → `.1`)은 원자적으로 (Codex adversarial #5)
- [x] 훅 출력 검증: 전환 대상은 `.sh` 훅이라 기존 `_lib` 테스트(done-report-policy·shell-policy)는 대상이 아님 — 신규 경량 테스트(페이로드 주입 → stdout JSON 파싱 단정)를 추가하거나, `bash -n` + 라이브 프로브로 커버함을 명시 (plan-auditor 🟡#4) + `bash -n` 전 훅 구문 검사
- [x] **라이브 프로브 2종**: ① 알림형 발화 → transcript에 systemMessage 표시 확인 ② 차단형 발동 → 차단 + log append 확인
- [x] secretary: 커밋 + CHANGELOG [H]

## ✅ 완료 조건

- [ ] 라이브 프로브 2종 PASS (트랜스크립트 표시 + log 기록 — 영호 육안 확인 포함) — (대기: risk-detector·deny 프로브 systemMessage 화면 표시 여부 영호 확인 예정)
- [x] 훅 테스트 green + `bash -n` 10/10
- [x] 기존 차단 semantics 회귀 0 (rm -rf·git add 프로브 exit 2 재확인)
- [ ] (분기) systemMessage 미지원 이벤트가 실측에서 발견되면 **성공 처리하지 않고** 영호와 범위 축소를 확정한 뒤 함정 섹션에 실측·축소 범위를 박제 (plan-auditor 🟡#3 · Codex adversarial #6 — 비가시 상태를 green으로 세지 않는다)
- [x] 로그 보안·동시성 테스트: 민감값 미기록(redaction) · 동시 20 append 유실 0 · 회전 락(rotation 경쟁 안전) (Codex adversarial #5)
- [x] P04 산출 검증 지점(systemMessage 훅·guard-blocks.log)이 `core-manifest.json` 선언 경로/식별자와 일치 — 불일치 시 P02 선언이 정본, 구현을 맞춘다 (plan-auditor v2 🟡#1)

## 📚 학습 포인트

- **stdout/stderr는 "누가 읽는 채널인가"가 다르다** — 같은 출력이라도 소비자(사용자 UI/모델/debug 로그)가 이벤트·exit code별로 다름. 관측성 설계는 채널 선택에서 시작.
- **append-only 원장** — 상태를 덮어쓰지 않고 사건을 누적하면 사후 감사(audit)가 가능해진다.

## ⚠️ 함정

- **stdout에 JSON 외 텍스트 섞이면 파싱 실패** — 전환한 훅은 stdout에 JSON 단독만.
- **exit 2 경로엔 JSON 병행 불가**(JSON은 exit 0에서만 해석) — 차단 가시화는 작업 항목의 exit-0 `permissionDecision: "deny"` 경로로 실측할 것. 그 경로가 미지원으로 확인된 경우에만 log + 모델 경유로 명시 축소 (plan-auditor v2 🟡#2 — v1 잔재 문구 정정)
- 이벤트별 JSON 지원 차이 가능 — 각 훅의 실제 이벤트(PreToolUse/PostToolUse/UserPromptSubmit)에서 라이브로 확인 후 확정.
- Windows 줄바꿈 — `.gitattributes` LF 고정 대상에 신규 파일 포함 확인.

## 담당 SubAgent

메인 직접(하네스 = 영호 단독 통제 대행, 유지보수 창) + secretary(커밋·CHANGELOG)

## 게이트 기록(중간)

구현 완료 2026-07-12. 라이브 검증: ① 알림형 — 훅 편집 중 risk-detector가 7회 발화, `guard-blocks.log` notify 기록 확인(화면 표시는 영호 육안 대기) ② 차단형 — `rm -rf`·`git add` 프로브 exit 2 차단 + block 원장 기록 ③ legacy advisory — RMW1-DONE payload 주입으로 systemMessage JSON+notify 확인 ④ **exit-0 JSON `permissionDecision:"deny"` 경로 실측 유효**(차단·사유 전달·systemMessage 병행 — dangerous-cmd-guard 임시 분기로 검증 후 제거, 주석 박제). 채택 여부는 AC "차단 여전히 exit 2"와 충돌하므로 영호 결정 대기 — 현행 exit 2+log 유지. Codex(Sol) 리뷰 3건 반영: [P1] 재봉인 이행 / [P2] 회전 락+락 안 재확인 / [P2] legacy advisory systemMessage 승격.
