---
owner: 영호
milestone: BL1
title: 백로그 청소 — HR1 이후 잔여 6건 (그룹 A 하네스 + 그룹 B 앱)
status: done
grade: 대규모 (마일스톤 전체 — phase별 상이, frontmatter 참조)
created: 2026-07-13
---

# BL1 — 백로그 청소 마일스톤 계획

> **배경**: HR1(하네스 전면 리뉴얼) 종결 후 work-pin에 누적된 잔여 백로그를 일괄 청소한다. 영호 결정(2026-07-13): "그룹 A+B 처리 후 M5 배포로 간다."

## 🎯 목표

HR1 이후 잔여 백로그 6건을 청소해 M5 배포 착수 전 부채를 0으로 만든다.

- **그룹 A (하네스 — 영호 유지보수 창 필요, CORE-11)**: ① 훅 견고성 3건 ② CORE-03 Claude 시크릿 read 기계 차단 공백
- **그룹 B (앱 코드 — Worker 위임)**: ③ 복원 페이지 JS 갱신 루프 데드락 ④ LR4-P03 유예 타이머 정리 ⑤ LR4-P05 ended 신호 유실 경계 ⑥ ultracodeToggle offKeys prune

## 🚫 비범위 (BL1 밖)

- **M5 배포**(electron-builder NSIS + electron-updater) — BL1 완료 후 별도 마일스톤·별도 `/work-plan`.
- **RMW lost-update** — RMW1-DONE으로 완료 확인(ADR-031). pin 백로그에서 제거(이 마일스톤 시드 시 반영).
- **REPL 4b auto-revive / main heartbeat 신설** — LR4-DONE 합의대로 auto-revive 재도입 시점에 재논의. P03은 renderer 수신측 폴백까지만.

## 📊 Phase 표 (의존성 순)

| Phase | 제목 | 등급 | loop_track | domain | 의존 |
|---|---|---|---|---|---|
| 01 | ultracodeToggle offKeys prune | 보통 | auto-gate | renderer | — (스타터, 작게) |
| 02 | idle-close 유예 타이머 정리 (LR4-P03 꼬리) | 복잡 (보통+backend-contract) | auto-gate (reviewer 무조건) | cross (agent-backend+qa) | — |
| 03 | goal 배너 stale-watchdog (LR4-P05 경계) | 복잡 (보통+ui-visual) | human-visual | renderer | P02 권장(soft) |
| 04 | 복원 페이지 갱신 루프 데드락 — 진단 | 보통 | auto-gate | renderer(+qa) | — |
| 05 | 복원 페이지 e2e 정직 클릭 회복 (P04 진단 재정의 — 테스트 하네스 전용, 제품 diff 0) | 보통 (하향) | auto-gate | qa | **P04** ✅ |
| 06 | [유지보수 창] 훅 견고성 3건 | 복잡 (보통+harness) | human-gate | cross | 영호 창 오픈 |
| 07 | [유지보수 창] CORE-03 검증 재정합 (기존 Read deny 프로브·manifest stale 교정) | 보통 (단순+harness) | human-gate | cross | 영호 창 오픈 (P06과 같은 창 권장) |

**병렬 가능**: P01 ↔ P02 ↔ P04 (상호 독립, 도메인 분리). P03은 **P02 뒤 권장**(soft — P02가 보존해야 할 autonomy_status 방출 시점을 P03이 소비. 병렬 강행 시 통합 회귀 게이트 필수 — Codex P3). P06·P07은 그룹 B와 완전 독립 — 영호가 창을 여는 시점에 묶어서(재봉인 1회) 진행.

**권장 실행 순서**: P01(작게 시작·환경 검증) → P02 → P04 → P05 → P03 → [영호 창] P06+P07. 창은 영호 일정에 맞춰 앞당겨도 무방.

## ⚠️ 마일스톤 공통 주의

- P06·P07은 하네스 봉인 영역 — **에이전트 위임 금지, 메인 세션이 영호 대행으로 직접 편집**(CORE-11). 창 오픈(영호 본인이 settings.json deny 완화 + supervisor-guard 봉인 해제 — 채팅 선언만으로 안 열림) → 수정 → 재봉인(digest 갱신 + `/hooks` 재신뢰) → **봉인 복구 프로브**(하네스 Edit 시도 → 차단 확인) → CHANGELOG 필수.
- **P07 전제 반전(plan-auditor 2026-07-13)**: settings.json Read deny는 최초 커밋부터 존재 — P07은 "신설"이 아니라 "실효 프로브 + core-manifest.json:19 stale 교정 + Bash 경로 부분 보장 선언"으로 재정합됨. Bash 경로 가드 신설 여부는 영호 결정 항목(기본 = 범위 밖).
- P07은 **Opus 4.8 세션에서 진행 권장** — Fable 5는 시크릿 차단/우회 논의에 dual-use 세이프가드 false-positive 이력(memory 2026-07-13).
- 시크릿 가드 denylist "부분 보장" 구문 재추격 금지(HR1 종결 규율) — P07은 settings deny *레이어 추가*만.

## 🔬 검증 이력 (2026-07-13)

- **plan-auditor (Tier 2-B)**: 🔴 2건(P07 전제 반전 — settings.json Read deny 기존재·manifest note stale / P06·P07 봉인 복구 프로브 누락) + 🟡 3건 → 전부 봉합 반영.
- **Codex Sol 2차 검증 (GO-with-fixes)**: P1 0건 · P2 10건 · P3 4건 → 전부 봉합 반영. 주요 교정: P01 prefix 전수 prune·실패 삭제 무변경 / P02 step-splitting 도입 사유(중첩 fake-time) 반영 / P03 활동 신호 정의·전환/축출 경계 / P04 1순위 후보 = SmoothMarkdown rAF(REPL 인디케이터 반증) / P05 CPU 합격 임계 / P06 Codex digest 혼입 제거(CORE-12) / P07 claude.impl 교정 / 봉인 복구 프로브 2종 분리.
- **P04 진단에 의한 P05 재정의 (2026-07-13)**: "제품 지속 갱신 루프" 가설 오진 확정 — 실원인 = 복원 창 OS 포커스 미획득으로 Chromium rAF 전달 정지(Playwright stable 판정 미구동). 제품 무혐의·idle CPU 0 실측. P05 = 테스트 하네스 전용 수정(복잡·human-visual·renderer+qa → 보통·auto-gate·qa 하향). 근거 = `04-diagnosis-notes.md`.

## 📚 마일스톤 학습 테마

- 리소스 수명 관리(P01) · 타이머 리팩토링과 동작 불변 증명(P02) · liveness/watchdog 설계의 오탐-미탐 trade-off(P03) · 렌더링 루프 프로파일링(P04·P05) · fail-open vs fail-closed(P06) · 권한 deny 레이어(P07)
