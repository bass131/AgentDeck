---
owner: 영호
milestone: BL1
phase: 07
title: "[유지보수 창] CORE-03 Claude 검증 재정합 — 기존 Read deny 실효 프로브 + manifest stale 교정"
status: done
grade: 보통 (자동 상향: 단순 + harness)
loop_track: human-gate
estimated: 1~2h
domain: cross
summary: plan-auditor 실측(2026-07-13)으로 전제 반전 — settings.json Read deny(.env*·secrets/**)는 최초 하네스 커밋(fec171a)부터 존재, core-manifest.json:19 "기계 차단 없음" note가 stale. 재정합 = 기존 deny 실효 프로브 + manifest 교정 + Bash 경로 미커버 "부분 보장" 정직 선언.
---

# Phase 07: [유지보수 창] CORE-03 Claude 검증 재정합

> **상태**: done
> **마일스톤**: BL1
> **등급**: 보통 (자동 상향: 단순 + harness 깃발)
> **담당**: **메인 세션 직접** (하네스 — CORE-11, Worker 위임 금지) · **Opus 4.8 세션 권장**
>
> **⚠️ 전제 반전 기록**: 원 계획은 "Claude에 Read deny *신설*"이었으나 plan-auditor 디스크 실측으로 반증됨 — `.claude/settings.json:45-47`에 `Read(**/.env)`·`Read(**/.env.*)`·`Read(**/secrets/**)` deny가 **이미 존재**(최초 커밋 fec171a, 2026-06-22부터 연속). stale한 것은 `core-manifest.json:19`의 "기계 차단 없음" 선언 쪽. 실제 남은 공백은 **Bash 경로**(`cat .env`·`node fs.readFileSync` 등 — Claude 훅 미커버, Codex는 agentdeck-hook.mjs로 커버)다.

---

## 🎯 목표

CORE-03의 Claude 어댑터 검증 선언을 실측과 재정합한다 — 기존 Read deny의 실효를 프로브로 **증명**하고, `core-manifest.json`의 stale note를 교정하며, Bash 경로 미커버를 "부분 보장"으로 정직하게 선언한다(Codex 어댑터의 부분 보장 선언과 대칭).

---

## ⏪ 사전 조건

- [ ] **영호 유지보수 창 오픈** — 채팅 선언만으로는 이중 잠금이 안 열림. 영호 본인이 직접: ① `.claude/settings.json` permissions.deny의 하네스 항목 완화 ② `supervisor-guard.sh` 봉인 해제 (근거: supervisor-guard.sh:5-8·settings.json:48-53). **P06과 같은 창 권장**(재봉인·재신뢰 1회)
- [ ] 근거 확인: `.claude/settings.json:45-47`(기존 deny), `core-manifest.json:19`(stale note), ADR-034:19, HR1-P02-설계검토.html:233-234

---

## 📝 작업 내용

- [ ] **(a) 기존 Read deny 실효 프로브** — canary `.env` 파일로 Read 시도 → 기계 거부 트랜스크립트 확보 (실제 시크릿 파일로 실험 금지). 중첩 경로(`sub/dir/.env`)·`.env.local`·`secrets/**` 각 1회. **프로브 후 canary 3종 삭제·잔존 0 확인** (Codex P3)
- [ ] **(b) manifest stale 교정** — `core-manifest.json` CORE-03을 실측 반영으로 갱신: `claude.verify`(:19)뿐 아니라 **`claude.impl`(:18 — 현재 CLAUDE.md만)에 `.claude/settings.json`(permissions.deny)을 추가**하고 verify/probe 선언을 함께 교정 (Codex P2 — 기계 구현의 실체는 settings.json인데 impl에 빠져 있으면 선언 반쪽). **conformance verifyTypes 고정 allowlist**(9455451) 안의 타입만 사용 — allowlist 개정이 필요해지면 보고 후 영호 결정
- [ ] **(c) "부분 보장" 정직 선언** — Read 툴 deny 커버 / Bash 경로 미커버를 manifest note에 명시
- [ ] **(d) 게이트** — `conformance-check.mjs` 13/13 green + `npm run test` harness-conformance spec green
- [ ] **(e) 마감** — CHANGELOG `[M]`(선언 교정 — 행동 변경 없음) + 재봉인 + **봉인 복구 프로브 2종**(① Edit 시도 → settings deny 차단 ② Bash 우회쓰기 시도 → supervisor-guard 차단 — 이중 잠금 층별 분리, CORE-11·Codex P2)
- [ ] **[영호 결정 항목 — 기본은 범위 밖]** Bash 경로 시크릿 가드 신설(Claude 측 dangerous-cmd-guard 확장 또는 신규 훅으로 Codex 패리티) 여부 — 원하면 별도 Phase/백로그 등재. 기본 입장 = 부분 보장 선언으로 종결(구문 denylist 무한 회피전 회피 — HR1 교훈)

---

## ✅ 완료 조건

- [ ] deny 실효 프로브 트랜스크립트 (canary Read 시도 → 기계 거부, 3케이스) + **canary 삭제·잔존 0 확인**
- [ ] 정상 작업 비차단 확인 (일반 파일 Read 정상)
- [ ] `core-manifest.json` 교정 diff (`claude.impl`에 settings.json 추가 + verify/probe 선언) + conformance 게이트 green
- [ ] CHANGELOG [M] 기록 + 재봉인 + **봉인 복구 프로브 2종 통과**(Edit → settings deny 차단 / Bash 우회쓰기 → supervisor-guard 차단)

---

## 📚 학습 포인트

- **실측 우선** — 이 Phase 자체가 산 사례: 계획 문서(manifest note)의 자기보고가 디스크 실측(plan-auditor)으로 반전됐다. 문서·모델의 선언은 검증 대상이지 진실이 아님 (memory `verify-fixes-empirically`).
- **부분 보장의 정직한 선언** — 완벽 차단이 불가능한 층(Bash 구문 우회)은 "부분 보장"으로 선언하고 다른 층(리뷰·Codex 대칭 사례)이 보완. 한 층에서 완벽을 추격하면 denylist 무한 회피전이 된다.

---

## ⚠️ 함정

- **Fable 5 세이프가드 false-positive 이력** — 시크릿 차단을 다루는 작업이므로 Opus 4.8 세션 권장 유지 (memory `fable-safeguard-defensive-security`).
- **denylist "부분 보장" 구문 재추격 금지** (HR1 종결 규율·pin 약속) — Bash 경로 공백을 발견했다고 해서 구문 패턴 확장으로 좇지 말 것. 영호 결정 항목으로만 올린다.
- deny 문법·범위는 프로브가 진실 — "등록돼 있으니 됐다" 금지(이번 전제 반전이 바로 그 사례의 역방향: "없다"는 선언도 프로브 없이는 못 믿는다).
- conformance verifyTypes는 고정 allowlist — 임의 verify 타입 신설은 게이트가 거부.

---

## 담당 SubAgent

없음 — 메인 세션 직접 (영호 감독 하, Opus 4.8 세션 권장). secretary는 CHANGELOG/커밋 잡무만.

---

## 📎 실행 기록 (2026-07-13)

- **canary Read deny 프로브 (실효 증명)**:
  - repo 내 3케이스 — `.env` / `nested/.env.local` / `secrets/**` → **3/3 기계 거부**(Read 툴 deny 발화).
  - **워크스페이스 밖 대조군** — 스크래치패드에 동일 3케이스 배치 → **3/3 미적용**(Read 성공). deny 실효 범위 = 프로젝트 내부임을 경계 실측으로 확정.
  - 프로브 canary 전부 삭제 · git 잔존 0 확인.
- **manifest 교정** — `core-manifest.json` CORE-03 `claude.impl`에 `.claude/settings.json`(permissions.deny) 추가 + stale note("기계 차단 없음") 교정 + 부분 보장(Read 툴·내부 커버 / Bash 경로 미커버) 정직 선언. 커밋 `c8844ff` · `conformance-check.mjs` 13/13 PASS.
- **Bash 경로 시크릿 가드 신설** — 영호 결정 보류(기본 범위 밖). 백로그 항목으로 존치(구문 denylist 무한 회피전 회피 — HR1 종결 규율).
- **재봉인** — 유지보수 창에서 완화했던 `.claude/settings.json` deny·supervisor-guard를 원복(영호 위임 → 메인 실행, diff 무변경 = HEAD 봉인본과 일치). **봉인 복구 프로브 2/2** — ① Edit(.claude/settings.json) 시도 → settings deny 차단 / ② Bash 우회쓰기 시도 → 수정된 supervisor-guard 라이브 차단.
- **/hooks 재신뢰 불요 실측** — 설정 다이제스트 불변(신뢰 표면 = 훅 *설정*이지 스크립트 본문 아님). P06이 스크립트 본문만 바꾸고 훅 등록/설정은 불변이라 재신뢰 프롬프트 미발생.
