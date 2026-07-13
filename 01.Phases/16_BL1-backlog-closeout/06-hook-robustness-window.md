---
owner: 영호
milestone: BL1
phase: 06
title: "[유지보수 창] 훅 견고성 3건 — || true·fail-closed·exit code 테스트"
status: done
grade: 복잡 (자동 상향: 보통 + harness)
loop_track: human-gate
estimated: 2~3h
domain: cross
summary: HR1 P06 reviewer minor 1~3 봉합 — tdd-guard 경고 경로 `|| true` 누락, shell-policy.mjs 크래시 fail-open→fail-closed, .sh 글루 exit code 회귀 테스트 신설. 영호 유지보수 창 필수(CORE-11).
---

# Phase 06: [유지보수 창] 훅 견고성 3건

> **상태**: done
> **마일스톤**: BL1
> **등급**: 복잡 (자동 상향: 보통 + harness 깃발)
> **담당**: **메인 세션 직접** (하네스 = 영호 단독 통제 대행, CORE-11 — Worker 위임 금지)

---

## 🎯 목표

HR1 P06 reviewer가 남긴 minor 3건을 봉합해 훅 안전망 자체의 견고성을 올린다:

1. `tdd-guard.sh:52` — 경고 경로 `emit_system_message` 호출에 `|| true` 추가 (`set -e` 하에서 notify 실패가 가드 전체를 죽여 원장 유실되는 경로 차단)
2. `shell-policy.mjs` 크래시 시 **fail-closed** — 정책 판정기가 죽으면 현재 열림(허용)으로 새는 것을 닫힘(차단+복구 안내)으로 전환 (`dangerous-cmd-guard.sh`·`supervisor-guard.sh` 호출부 포함)
3. `.sh` 글루 exit code **회귀 테스트** 신설 — 현재 라이브 프로브로만 커버되는 차단(exit 2)/통과(exit 0) 경로를 `_lib/*.test.mjs` 패턴으로 자동화

---

## ⏪ 사전 조건

- [ ] **영호 유지보수 창 오픈** (사람 게이트 — 이 절차 없이 착수 금지). 채팅 선언만으로는 이중 잠금이 안 열림 — 영호 본인이 직접: ① `.claude/settings.json` permissions.deny의 하네스 항목(`.claude/hooks/**`·`.claude/settings.json`) 완화 ② `supervisor-guard.sh` 봉인 해제 (근거: supervisor-guard.sh:5-8·settings.json:48-53)
- [ ] 근거 확인: HR1-DONE.md:62 (reviewer minor 3건 원문)
- [ ] P07과 같은 창에서 연속 진행 권장 (재봉인·재신뢰 1회로 묶기)

---

## 📝 작업 내용

- [ ] **(1)** `tdd-guard.sh:52` `|| true` 추가 + 경고 경로 발화 프로브
- [ ] **(2)** shell-policy 크래시 fail-closed — 호출부에서 판정기 비정상 종료 감지 시 exit 2 + 사유 메시지("정책 판정기 오류 — 훅 점검 필요"). 크래시 주입 테스트(구문 오류 픽스처)로 검증
- [ ] **(3)** .sh 글루 exit code 테스트 — 훅별 대표 케이스(차단 1·통과 1)에 픽스처 stdin 주입 → exit code 단정. Git Bash 실행 전제(.gitattributes LF 고정 유의)
- [ ] 게이트: `_lib` 테스트 전체 green + `bash -n` 전 훅 + 라이브 프로브(차단·알림 각 1회 발화 확인)
- [ ] **재봉인**: 영호가 settings deny·supervisor-guard 봉인 원복 → Claude `/hooks` 재신뢰(신뢰 다이제스트는 Claude Code가 자동 재계산) → CHANGELOG `[M]` 한 줄 (게이트 동작 변경 = fail-closed 전환 포함이므로 `[H]` 검토). **Codex 쪽 SHA-256 cachebuster(.codex/hooks.json:8)는 건드리지 않음** — Claude 설정에는 digest 계약이 없고(settings.json 실측), Claude 작업으로 Codex 배선을 바꾸면 엔진 격리(CORE-12) 위반 (Codex P2)

---

## ✅ 완료 조건

- [ ] 신설 exit code 테스트 포함 훅 테스트 전체 PASS (기존 23종+)
- [ ] fail-closed 크래시 주입 테스트 PASS (판정기 사망 → 차단 확인)
- [ ] 라이브 프로브 트랜스크립트 (차단형·알림형 각 1)
- [ ] 재봉인 완료 — 봉인 원복 + 영호 `/hooks` 재신뢰 + CHANGELOG 기록
- [ ] **봉인 복구 프로브 2종** (CORE-11 "재봉인 + 봉인 복구 프로브", CORE.md:63 — 이중 잠금이므로 층별 분리, Codex P2): ① Edit 도구로 하네스 파일 수정 시도 → settings deny 층 차단 확인 ② Bash 우회쓰기(`echo >> 하네스 파일`) 시도 → supervisor-guard 층 차단 확인

---

## 📚 학습 포인트

- **fail-open vs fail-closed** — 안전장치가 고장 났을 때 열리는가 닫히는가. 가용성 장치(캐시 등)는 열림이, 보안 게이트는 닫힘이 원칙. 대신 닫힘의 비용(작업 중단)을 낮추려 복구 경로를 오류 메시지에 함께 제공.
- **안전망의 안전망** — 훅을 테스트 없이 두면 훅 수정이 제일 위험한 작업이 된다(RF1 교훈: 검출 패턴은 rename에 조용히 죽는다).

---

## ⚠️ 함정

- 유지보수 창 밖 착수 금지 — supervisor-guard·CORE-11 위반. 창 오픈 선언 → 수정 → 재봉인 순서 엄수.
- fail-closed 전환은 오탐 시 *모든 명령이 막히는* 양날 — 크래시 사유를 stderr에 명확히 남겨 영호가 즉시 원인 파악 가능하게.
- `.claude/hooks/**`는 LF 고정(.gitattributes) — Windows 편집기 CRLF 유입 주의.

---

## 담당 SubAgent

없음 — 메인 세션 직접 (영호 감독 하). secretary는 CHANGELOG/커밋 잡무만.
