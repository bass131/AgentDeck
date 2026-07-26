---
owner: 영호
milestone: LR3
phase: 06
title: loop GUI 마감 — 완료 보고
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
domain: renderer
date: 2026-07-03
summary: 금색 REPL 표시등(ON=상시 형광 점등·금색 채움)·전체박스 gloss·goal 배너(N턴)·표준
  스피너 정렬·정지 신뢰 피드백(stopped 확인 배너)까지 — 영호 육안 3라운드 조정 반영 후 GO.
---

# Phase 06 완료 보고 — loop GUI 마감

## 1. 무엇을 했나

**본체(Worker 구현):**
- **금색 REPL 표시등**: 기존 `--gold`(Fable 5 도트) 재사용 + `--gold-soft`/`--gold-line`/`--gold-glow-1·2` 패밀리 완성(신규 HEX 발명 0). 점등 판정 `lib/replIndicator.ts` `resolveReplLit` 순수 함수.
- **전체박스 gloss**: `.chat-scroll` 한정 → `.conversation`(채팅+컴포저) inset 링. 오버레이 z-order 구조 확인.
- **goal 배너**: `resolveLoopStatus`에 goal 변형 편입(단일 표시 불변식 sdk > goal > … 한 곳 결정) + "N턴" 뱃지.

**영호 육안 3라운드 조정(같은 날):**
- **1R**: ① REPL = 토글 ON이면 **상시** 점등(활동 무관) + 형광 pulse(2.6s, 글로우 금지의 명시적 예외 — 영호 지시) ② 정지 신뢰 피드백 — stopped 확인 배너 신설(단일+패널 대칭).
- **2R**(관찰 스크린샷 3장 원인 분석): ③ 배너 스피너 = IconRefresh 원형 회전이 얼룩으로 보임 → 앱 표준 border-arc(`.t-spin` 관례)로 정렬 ④ "정지 후 CronList에 크론 잔존" — **2중 라이브 probe로 판정**: 정지 후 80s 이벤트 증가 0(실행 사멸) + resume 후 90s 자율 틱 0(부활 없음) = **기록만 잔존, 실질 누수 없음**. stopped 문구를 사실 정합으로 교정("반복 실행이 멈췄어요" — "정리" 표현 금지 계약 테스트).
- **3R**: REPL 점등 = 금색 **채움** + 다크 잉크 텍스트(흰색은 금색 위 대비 1.9~2.5:1로 미달 → `oklch(from var(--gold) …)` 파생 잉크 ≈8:1) → **P06 GO**.

## 2. 핵심 파일

`lib/replIndicator.ts`(신규) · `lib/loopStatus.ts` · `LoopStatusBanner.tsx/.css` · `Composer.css`(repl-lit 채움+pulse) · `tokens.css`(gold 패밀리) · `store/`(loopsStoppedNotice: reducer types·lifecycle·runtime·sessions·selector·panelSession) · `EchoBackend.ts`(/loop 결정론 loops 재생 — e2e 게이트 안) · 테스트 5파일 + probe `lr3-p06-stop-cleanup.e2e.ts`(2종) + 스크린샷 하네스.

## 3. 검증

- typecheck 0 · lint 0 · **test 3919 green**(stopped 계약 +12, 스피너 계약 +1) · build ✅
- 라이브 probe 2종 PASS(위 2R ④) · 스크린샷 4장 재생성(`ScreenShot/p06-*.png`)
- reviewer 2회 🟢(본체 + 델타, 🔴 0)

## 4. 남긴 것 (영호 단독 잔여)

- UI.md 팔레트 표 갱신(초안 = `_ui-md-gold-draft.md` — 금색 재사용 + 형광 예외 문구 포함)
- ADR-024 재재고 → ADR.md 본문 반영(승인된 초안 = `_adr-024-rerethink-draft.md`)

## 5. 백로그 (비차단 🟡)

- main abort 이벤트 드롭 근본수리(🔴 구역 — 수리되면 renderer-local activeLoops 동기화 봉합 제거 가능)
- CronList 기록 잔존은 SDK 하네스 동작이라 앱에서 제어 불가 — 신경 쓰이면 대화에서 CronDelete 지시(체크리스트에 안내 박제)
- 스크린샷 하네스 파일명 드리프트(lr2-03 이름에 p06 샷) · Echo 재생창 타이밍 의존(retries:2 완화)
