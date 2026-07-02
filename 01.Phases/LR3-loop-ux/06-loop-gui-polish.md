---
owner: 영호
milestone: LR3
phase: 06
title: loop GUI 마감 — 금색 REPL·전체박스 gloss·goal 배너·모션
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 2~4h
domain: renderer
summary: 영호 실측 피드백(2026-07-03) 시각 항목 일괄 — REPL 버튼 이펙트 금색(신규 색 토큰 + UI.md 정합 = 영호 확인) · loop gloss를 채팅창+입력창 전체 박스(.conversation)로 · goal 진행 배너(동적 회전 아이콘 + N턴 뱃지, 진행 카드는 기록 유지) · 전반 아이콘/모션 다듬기. ui-visual = 무인 commit 금지.
---

# Phase 06: loop GUI 마감 (ui-visual)

> **상태**: done (2026-07-03 영호 육안 GO)
> **마일스톤**: LR3
> **등급**: 복잡 (renderer 시각 — ui-visual 깃발)
> **담당**: renderer Worker + **영호 육안 트랙**(무인 commit X)

---

## 🎯 목표

루프·목표 반복이 도는 동안 앱이 "살아있는" 시각 신호를 준다 — REPL 상태(금색), 루프 활성
(전체 박스 gloss + 배너 모션), goal 진행(동적 뱃지). LR2-03 통합 배너 골격 위의 마감 작업.

## ⏪ 사전 조건

- [ ] Phase 02(AUTO 세션 수명 — 표시등이 파생할 "세션 활성" 의미 확정) ·
      Phase 03(replMode 기본 true·prefs + 배너 변형 구성 확정).
- [ ] Phase 04·05는 병행 가능 — goal 배너는 P03 이후 착수 가능.

## 📝 작업 내용

- [ ] **REPL 버튼 재정의 + 금색 이펙트**: P02 AUTO 세션 수명에 맞춰 버튼 의미를 "모드
      스위치" → **상태 표시등**(세션 활성/루프 진행 시 금색 점등)으로 전환. 수동 "항상
      유지(핀 고정)"은 신규 IPC 필요성 검토 후 별도 결정(이 Phase 범위 밖 — 표시만).
      테마 팔레트에 금색 토큰 신설(라이트/다크 듀얼 값) — 안티슬롭 "새 색 발명 금지"의
      *의도된 예외*이므로 **UI.md 팔레트 표 갱신과 짝**(UI.md = 영호 문서 → 초안 제시 후
      영호 확인). 배경/테두리/글로우-금지 준수한 은은한 강조.
- [ ] **gloss 영역 확장**: `.conversation.loop-active`의 inset 링을 `.chat-scroll` 한정에서
      **채팅창+컴포저 전체 박스** 기준으로 이동(영호: "영역이 너무 좁고 이상함").
      스크롤/모달과의 z-order 확인.
- [ ] **goal 진행 배너**: 통합 배너에 goal 변형 추가 — 소스는 `pendingCommand`(name='goal'
      ·running·turns). 동적 회전 아이콘 + "N턴" 뱃지. 진행 카드(cmdresult)는 기록으로 유지.
      `resolveLoopStatus` 우선순위에 goal 편입(단일 표시 불변식 유지 + 계약 테스트).
- [ ] **모션/아이콘 다듬기**: 배너 spin 속도·아이콘 크기·여백 일관화.
      `prefers-reduced-motion` 가드 전 모션 적용.
- [ ] 스크린샷 하네스(lr2-03-loop-gui-screens.e2e.ts) 확장 — 금색 REPL·전체 gloss·goal
      배너 3샷 추가 → `ScreenShot/`.

## ✅ 완료 조건

- [ ] 상태 로직(배너 변형 결정·goal 편입) 단위 테스트 green.
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0.
- [ ] 스크린샷 세트 생성(라이트/다크 각 1셋 권장).
- [ ] **[human-visual] 영호 육안 GO 후 commit** — 금색 톤·gloss 범위·모션 과유불급 판단.
      무인 commit 금지. **[🟡-5②] 금색 토큰 = 안티슬롭 "새 색 발명 금지"의 예외이므로
      영호의 명시적 예외 승인 + UI.md 팔레트 표 갱신 확인이 이 게이트에 포함됨.**

## 📚 학습 포인트

- **디자인 토큰의 예외 처리** — "새 색 금지" 규칙에 예외를 낼 때는 토큰·문서·듀얼테마를
  한 세트로 — 규칙을 깨는 게 아니라 규칙을 *확장*하는 절차.
- **모션의 접근성** — 기능적 모션만, reduced-motion 가드 동반.

## ⚠️ 함정

- 금색이 accent(테라코타 계열)와 싸우면 촌스러워짐 — 채도/명도 듀얼테마 각각 튜닝, 육안 필수.
- gloss를 전체 박스로 넓힐 때 PermissionModal 등 오버레이와 겹침 확인.
- goal 배너 추가로 "단일 표시" 불변식이 깨지지 않게 — resolveLoopStatus 한 곳에서만 결정.

## 담당 SubAgent

renderer Worker + 영호 육안. reviewer(복잡). Phase 07과 병렬 가능.
