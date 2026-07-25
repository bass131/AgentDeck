---
owner: 영호
milestone: GAP1
phase: 14
title: SubAgent 스플릿 뷰 — 단일채팅모드 우측 분할 그리드 실시간 표시
status: done
grade: 대규모 (renderer 대변경 + ui-visual 신규 UI — coordinator 경유, reviewer 무조건)
risk: ui-visual·backend-contract(thinking cap 해제 선택 시 조건부)
loop_track: human-visual
estimated: 5~12h
domain: renderer
summary: 영호 스펙 확정(2026-07-14) — 단일채팅모드에서 SubAgent 작업 배분 시 메인 세션 좌측 + 우측 분할 그리드(최대 2컬럼×컬럼당 3행 = 동시 6, 초과분 탭 대기열)로 SubAgent 세션들을 Split Terminal 느낌으로 실시간 표시. 창별 활성/비활성 토글 + 완료창 잠시 표시 후 자동 닫기→재배치(대기열 승격). 유동 배분 = 활성 셀 자동 확대 확정(영호 2026-07-14 — 스트림 흐르는 셀 자동 확대·나머지 축소·제로 조작). 스카우트 실측(2026-07-14): 데이터 소스 기성 — SubAgent transcript가 parentToolId 라우팅으로 state.subagents[].transcript에 라이브 누적(agent-events.ts:287-387 · claude-stream.ts:353-363·409-451·692-697 · reducer text.ts:22-42·139-156 · tool.ts:23-51·148-187), 신규 이벤트/IPC 0으로 표시 데이터 성립. 셀 UI 기성품 = SubAgentFullscreen.tsx + lib/subagentChat.ts, 그리드·리사이저 기성 = MultiWorkspace.css .ma-grid + PaneSplitter.tsx. 실공사 3가지 = ① Shell 우측(AgentPanel 392px) 레이아웃 분기 ② 셀 배정 정책(선택·축출·대기열 신규) ③ SubAgentFullscreen 셀 컴포넌트화. 한계 = text는 메시지 단위 도착(글자 델타 없음) · thinking 90자 cap(claude-stream.ts:343, 해제는 선택) · tool 항목 verb/target/status만. 비범위 = 셀별 입력·개별 abort(표시 전용). P13 뒤(renderer 직렬)·P15 앞(헌팅 대상 포함).
---

# Phase 14: SubAgent 스플릿 뷰 — 단일채팅모드 우측 분할 그리드

> **상태**: done
> **마일스톤**: GAP1
> **등급**: 대규모 (renderer 대변경 + ui-visual 신규 UI → reviewer 무조건)
> **담당**: coordinator 경유 — renderer 주도(레이아웃 분기·셀 컴포넌트·배정 정책) + agent-backend 선택 1건(thinking cap 해제 채택 시) + qa. reviewer 무조건
> **실행 순서**: P13 뒤(renderer 파일 겹침 가능 — 직렬) · P15 앞(신규 UI가 라이브 헌팅 대상에 포함되도록)

---

## 🎯 목표

단일채팅모드에서 SubAgent 작업 배분 시, 메인 세션을 좌측에 두고 우측 분할 그리드로 SubAgent 세션들을 실시간 표시하는 "스플릿 뷰" 모드를 만든다(영호 스펙 확정 2026-07-14). 끝나면: SubAgent가 생기면 우측 그리드에 Split Terminal 느낌으로 대화가 라이브 스트리밍되고, 동시 표시 상한(6)을 넘는 SubAgent는 탭 대기열로 대기하며, 완료된 창은 잠시 표시 후 자동으로 닫혀 대기열이 승격되고, 창별 활성/비활성 토글로 사용자가 표시를 제어할 수 있다. 지금은 SubAgent transcript가 상태에 쌓이기만 하고 전용 화면(SubAgentFullscreen) 진입 없이는 병행 관찰이 불가능하다.

---

## 📐 확정 스펙 (영호 2026-07-14 — 완료 조건의 뼈대)

- **레이아웃**: 메인 세션 좌측 + 우측 **최대 2컬럼, 컬럼당 최대 3행**(동시 표시 상한 6). 초과분은 **탭 대기열**.
- **채움 순서**: 컬럼1 위→아래 3개 → 컬럼2 위→아래. 컬럼에 1개뿐이면 전체 높이 사용(예: 4번째 SubAgent는 컬럼2에 혼자 = 큰 세로창).
- **분할 비율**: 고정 1/N 아님 — 세로 공간 유동 배분. **[확정 — 영호 2026-07-14]** 유동 배분 방식 = **활성 셀 자동 확대** — 스트림이 흐르는(최근 이벤트 수신) 셀이 자동으로 커지고 나머지 축소, 제로 조작. (검토안: (A) 드래그 리사이즈 — 사용자 제어·영속 가능 / 조작 비용 vs (B) 활성 셀 자동 확대 — 제로 조작 / 예측 불가 움직임·시각 소음 → **(B) 채택**)
- **스트리밍**: Split Terminal 느낌 실시간 표시 + **창별 활성/비활성 토글 버튼**.
- **완료 창**: 잠시 표시 후 **자동 닫기 → 재배치**(대기열 승격).

---

## ⏪ 사전 조건

- [x] **데이터 소스 기성 (스카우트 실측 2026-07-14)** — SubAgent 대화(assistant 텍스트 전문·tool call/result·thinking 90자 요약)가 `parentToolId` 라우팅으로 `state.subagents[].transcript`에 라이브 누적: `02.Source/shared/agent-events.ts:287-387`(SubAgentTranscriptItem·SubAgentInfo) · 어댑터 `02.Source/main/01_agents/claude-stream.ts:353-363·409-451·692-697` · reducer `02.Source/renderer/src/store/reducer/text.ts:22-42·139-156`·`tool.ts:23-51·148-187`. **신규 이벤트/IPC 0으로 표시 데이터 성립**
- [x] **셀 UI 기성품** — `02.Source/renderer/src/components/05_agent/SubAgentFullscreen.tsx` + `02.Source/renderer/src/lib/subagentChat.ts`(순수 빌드 함수) — transcript를 채팅으로 렌더하는 완성형. 이것의 셀 컴포넌트화가 실공사
- [x] **그리드·리사이저 기성** — `02.Source/renderer/src/components/00_shell/MultiWorkspace.css` `.ma-grid`(grid-auto-rows 1fr) + COLS 맵(`MultiWorkspace.tsx:24` import · `:170` 사용 — 2col×3row=6셀 동형) + `02.Source/renderer/src/components/00_shell/PaneSplitter.tsx`(targetRef 일반화·localStorage 영속)
- [ ] P13(진행 중 권한 모드 전환) 완료·커밋 — renderer 파일 겹침 가능성으로 직렬

---

## 📝 작업 내용

- [x] **(0) 설계 결정 확정 — [확정] 활성 셀 자동 확대(영호 2026-07-14)** — 스트림이 흐르는(최근 이벤트 수신) 셀이 자동으로 커지고 나머지 축소, 제로 조작(위 📐 분할 비율 항목에 기록 완료). 구현 착수 가능
- [ ] **(a) TDD RED 선행 (qa)** — 실패 테스트 먼저: ① 배치 규칙 결정론(1~7개 시나리오 — 1개=우측 전체 / 4개=컬럼2 전체 높이 / 7개=탭 대기열 발생) ② 완료 창 자동 닫기 → 재배치(대기열 승격) ③ 창별 활성/비활성 토글 상태 전이. 배정 정책은 순수 함수로 명세해 결정론 판정 가능하게
- [ ] **(b) renderer: 셀 배정 정책 신규** — `state.subagents`는 무한 누적이므로 표시 대상 선택 로직 신규: 활성/최근 우선 배정·축출·탭 대기열·완료 창 자동 닫기 타이머·승격. UI와 분리된 순수 로직((a)의 테스트 대상)
- [ ] **(c) renderer: 셀 컴포넌트화** — SubAgentFullscreen 본문을 그리드 셀 컴포넌트로 추출(`subagentChat.ts` 재사용). 셀 헤더에 활성/비활성 토글 버튼
- [ ] **(d) renderer: Shell 우측 레이아웃 분기** — 우측 영역(AgentPanel 392px)을 "AgentPanel ↔ 스플릿 그리드" 전환/공존시키는 레이아웃 분기. `.ma-grid`·PaneSplitter 기성 재사용. **UI.md §2(셸 골격) 갱신 동반**
- [ ] **(e) [선택] agent-backend: thinking 요약 cap 해제** — 어댑터가 thinking을 90자 요약으로 cap(`claude-stream.ts:343`). **주의: 이 cap은 P06 경계교정의 의도적 결정**(`claude-stream.ts:338-340` 주석 — 90cap은 P06이 일부러 복원한 동작)이라, 해제는 그 결정을 **번복**하는 것. 트레이드오프 비교: (1) 어댑터 cap 해제 — 셀에서 전문 표시 가능 / backend-contract 깃발 격상 + P06 결정 번복 vs (2) **어댑터 무접촉·renderer 표시측 절단** — cap을 표시 정책으로 이관(어댑터는 그대로, 셀이 표시 길이만 절단 — backend-contract 격상 불요). 셀에서 전문 표시가 필요하다고 판정될 때만 (1) 채택 — **채택 시 backend-contract 깃발 격상**(reviewer 무조건은 이미 성립) + **reviewer 관점에 "SubAgentFullscreen 요약 라인 회귀" 포함**. 미채택 시 90자 요약 표시로 확정하고 사유 기록

---

## ✅ 완료 조건

- [x] **(0) 결정 기록 완료(본 문서)** — 유동 배분 = 활성 셀 자동 확대(영호 2026-07-14, 📐 반영)
- [ ] **UI.md §2 셸 골격 갱신 커밋** — 우측 레이아웃 분기((d)) 반영분
- [ ] `npm run typecheck` (main+renderer) 0 · `npm run test` 전체 green(신규 RED→GREEN, 회귀 0) · `npm run lint` 0
- [ ] 배치 규칙 결정론 테스트 통과 — 1~7개 시나리오(1개=우측 전체 / 4개=컬럼2 전체 높이 / 7개=탭 대기열)
- [ ] 완료 창 자동 닫기·재배치(대기열 승격) 테스트 통과
- [ ] 창별 활성/비활성 토글 테스트 통과
- [ ] **ui-visual 육안 — 영호 필수**(신규 UI — 무인 commit X)
- [ ] reviewer 통과 (대규모 — 무조건. (e) 채택 시 backend-contract 관점 포함)

---

## 📚 학습 포인트

- **스카우트가 신규 계약 0을 만든다** — "실시간 병행 뷰"라는 큰 기능도, 데이터 소스(transcript 라이브 누적)·셀 UI(SubAgentFullscreen)·그리드(.ma-grid)가 이미 있음을 실측하면 신규 이벤트/IPC 없이 성립한다. 기능 요구를 듣고 바로 새 파이프라인을 설계하는 것이 아니라, 기존 인프라 실측이 먼저다(memory: plan-before-scout).
- **"실시간"의 상한은 데이터 계약이 정한다** — SubAgent text는 SDK 구조상 메시지 단위로 도착한다(글자 델타 없음). UI가 약속할 수 있는 "실시간"은 데이터 소스의 갱신 단위를 넘을 수 없다 — 이를 넘는 연출(타자기 효과 등)은 거짓 신호다.
- **무한 누적 상태 × 유한 표시 슬롯 = 정책 문제** — 슬롯 6개에 무한 누적 리스트를 얹으려면 배정·축출·대기열 정책이 필요하고, 이것은 UI 장식이 아니라 순수 함수로 분리해 결정론 테스트를 걸 수 있는 로직이다. 정책을 컴포넌트 안에 섞으면 테스트도 재사용도 죽는다.

---

## ⚠️ 함정

- **표시 전용 — 세션 조작 발명 금지** — SubAgent는 별도 run이 아니다(세션 조작 인프라 없음). 셀별 입력 전송·개별 abort는 **비범위** — 만들려는 시도 자체가 범위 밖(보고 후 중단). SDK 트랜스크립트 파일 읽기도 불필요(상태에 이미 있음).
- **transcript tool 항목의 한계** — verb/target/status만 보존(raw 미보존). 셀에서 raw 입출력 표시를 시도하지 말 것 — 데이터가 없다.
- **thinking 90자 cap은 선택 항목으로만** — (e) 미채택이 기본. 채택하면 backend-contract 깃발 격상 — 어댑터 1줄이라도 공유 계약 관점 리뷰 필수.
- **배정 정책과 렌더의 분리** — (b)를 컴포넌트 내부 state로 구현하면 (a)의 결정론 테스트가 불가능해진다. 순수 함수 우선.
- **P13과의 직렬** — renderer 파일 겹침 가능(Shell·store). P13 커밋 전 착수 금지.
- **(0) 결정 항목 — 확정 완료(영호 2026-07-14)** — 유동 배분 방식 = 활성 셀 자동 확대로 확정·본 문서 기록 완료. 전 스펙(상한 6·채움 순서·대기열·자동 닫기·활성 셀 자동 확대) 확정이므로 재확인 없이 자율 진행.
- **ui-visual — 무인 commit X** — 신규 UI라 영호 육안 필수. 기능·테스트는 자율 진행하되 시각 판정은 영호 트랙.
