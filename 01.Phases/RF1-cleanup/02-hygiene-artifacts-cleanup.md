---
owner: 영호
milestone: RF1
phase: 02
title: artifacts 프로브 스크립트 정리 (실측 후 삭제)
status: done
loop_track: auto-gate
estimated: 0.3h
domain: cross
summary: 4개 서브에이전트 실측으로 프로브 14개가 전부 STALE(구현완료/결정확정) 확인 → 삭제. screenshots/ 보존.
---

# Phase 02: artifacts 프로브 스크립트 정리 (실측 후 삭제)

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 A · 위생)
> **등급**: 단순 (가역 · git-ignored 로컬 파일)
> **담당**: 메인 직접

---

## 🎯 목표

`artifacts/`의 프로브 스크립트 14개(`*-probe.mjs`)를 삭제한다. **단, 원래 플랜의 "옛 일회성 junk" 전제는 틀렸음** — 실측 결과 이들은 REPL 전환 설계의 ground truth였다. 4개 서브에이전트 교차 검증으로 **그 설계 기능이 전부 구현·배선됐거나 결정 확정**됨을 확인 → 프로브는 *소진된 역사 자산* → 삭제 정당화. `screenshots/`(e2e 시각 산출물)는 보존.

---

## 🔬 실측 결과 (2026-06-27, 서브에이전트 4 병렬)

프로브가 받치던 기능군 전부 STALE:

| 기능 | 상태 | 증거 | 프로브 |
|---|---|---|---|
| 지속세션 REPL | ✅ 구현+기본활성 | `appStore.ts:576 replMode:true`, `ClaudeCodeBackend.ts:1484~1656` | loop-persistent·idle·repl-resume |
| resume (ADR-023) | ✅ 구현 | `ClaudeCodeBackend.ts:1019,1551` | context·resume |
| 앱 /loop (ADR-022) | ✅ 구현 | `Conversation.tsx:533`, `loopCommand.ts` | loop |
| cron CRUD | ✅ 구현 | `ClaudeCodeBackend.ts:1306,1314` | crons·crons2·delete |
| origin (user/cron) | ✅ 확정+구현 | `ClaudeCodeBackend.ts:1612` pending-send | origin |
| watchdog auto-revive | 🚫 드롭확정 | `REPL_TRANSITION.md:143`, `d62fc88` | watchdog·rearm |
| slash / workflow | ✅ 구현 | `commands.ts`, `claude-stream.ts` | slash·workflow |

→ 부산물 발견: **CLAUDE.md·REPL_TRANSITION.md docs 드리프트**(REPL "미구현"이라 거짓) → **Phase 15** 신설.

---

## ⏪ 사전 조건

- [ ] 없음 (독립 Phase). 실측은 완료됨.

---

## 📝 작업 내용

- [ ] `artifacts/*.mjs` 14개 삭제 (`screenshots/` 디렉토리는 보존 — e2e 산출물)
- [ ] 삭제는 git-ignored 로컬 파일이라 git 변경 footprint 0 (커밋 대상 아님)
- [ ] 프로브가 확립한 사실은 `docs/REPL_TRANSITION.md` 본문이 이미 텍스트로 보존 — 지식 손실 0
- [ ] (이 plan 파일 갱신 = git 변경분 — 실측 결과 박제)

---

## ✅ 완료 조건

- [ ] `artifacts/`에 `*.mjs` 0개 · `screenshots/` 유지
- [ ] `npm run typecheck` green · `npm run test` (시작값 대비 비감소) — 삭제가 무영향 확인
- [ ] 실측 결과가 plan 파일에 박제됨 (다음 세션 재오인 방지)

---

## 📚 학습 포인트

- **"junk처럼 보이는 것" 삭제 전 실측** — grep 참조 게이트가 "프로브 = 설계 증거"를 잡아냄. 가정 대신 측정.
- **소진된 증거(spent ground truth)** — 설계기 ground truth는 그 설계가 구현/결정되면 역사 자산이 됨. 지식이 docs 본문에 흡수됐으면 실행 파일은 삭제 가능.

---

## ⚠️ 함정

- 실측 없이 "옛 junk"로 단정 삭제 → REPL 설계 증거 소실 사고(원래 플랜의 함정). **grep 게이트가 방어함.**
- `screenshots/`를 프로브로 오인 삭제 — `*.mjs`만 대상(스크린샷은 디렉토리).

---

## 담당 SubAgent

> 메인 직접 (로컬 파일 삭제 — 단순). 실측은 Explore 4 병렬로 완료.
