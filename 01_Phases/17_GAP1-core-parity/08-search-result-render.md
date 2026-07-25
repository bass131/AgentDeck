---
owner: 영호
milestone: GAP1
phase: 08
title: Grep/Glob 결과 IDE 렌더 — 매치 파싱 · 파일별 그룹핑 · 클릭 점프
status: done
grade: 복잡 (보통 + backend-contract 깃발)
risk: ui-visual·backend-contract
loop_track: human-visual
estimated: 2~5h
domain: cross
summary: 현재 Grep/Glob 결과가 raw 텍스트/JSON 덩어리(toolKind.ts:24-25·ToolCallCard.tsx:206-219) → Claude 어댑터에서 top-level tool_use_result(현재 드롭 claude-stream.ts:363)를 엔진 중립 search_result 이벤트로 정규화(CORE-02) → renderer는 계약만 렌더(파일 그룹·클릭 점프, raw는 fallback)(T-03). P01 CodeViewer 재사용 패턴 선행 권장.
---

# Phase 08: Grep/Glob 결과 IDE 렌더

> **상태**: pending
> **마일스톤**: GAP1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract → reviewer 무조건·human-visual)
> **담당**: cross (agent-backend·shared-ipc·renderer) + reviewer

---

## 🎯 목표

검색 결과를 클릭 가능한 IDE 탐색으로 만든다. 끝나면: Claude 어댑터가 tool_use_result를 엔진 중립 search_result로 정규화하고, renderer는 그 계약을 파일별 그룹으로 렌더하며 클릭하면 기존 FileModal/CodeViewer로 파일이 열린다. 지금은 결과가 클릭 불가한 텍스트 덩어리라 '검색→열기' 흐름이 GUI에서 끊긴다.

---

## ⏪ 사전 조건

- [ ] **P03 완료** — `search_result` 엔진 중립 이벤트 타입이 `02.Source/shared`에 정의됨(미정의 시 P03로 additive 추가)
- [ ] **P01 완료 권장(soft)** — P01이 확립한 CodeViewer/FileModal 재사용 패턴을 클릭 점프에 재사용
- [ ] 근거 = GAP1 감사 T-03
- [ ] 현행: toolKind search(IconSearch/yellow/verb Glob|Grep)로 접힘 한 줄은 나오나 결과는 generic `<pre>`에 raw 텍스트/JSON(`toolKind.ts:24-25`; `ToolCallCard.tsx:206-219`). 매치 하이라이트·파일별 그룹핑·클릭 점프 전무

---

## 📝 작업 내용

- [ ] **(a) 어댑터 정규화 (CORE-02)** — Claude 어댑터에서 top-level `tool_use_result`(현재 드롭 `claude-stream.ts:363`)를 **엔진 중립 `search_result` 이벤트로 정규화**. Grep 출력 3모드(files_with_matches/content/count)·Glob 형상을 매치 리스트·파일 그룹·경로로 파싱해 계약에 담음. 계약 타입 = P03 `search_result`(미정의 시 P03로 additive 추가)
- [ ] **(b) renderer 렌더** — renderer는 **`search_result` 계약만 렌더** — 파일별 그룹핑(파일 헤더 + 매치 라인) + 클릭 점프(기존 FileModal/CodeViewer, 가능하면 해당 라인 스크롤, P01 재사용 패턴). raw 텍스트는 호환 fallback
- [ ] **(c) 폴백** — 계약 미수신/파싱 실패 시 기존 `<pre>` raw 렌더 폴백(포맷 변형에 렌더가 깨지지 않게)
- [ ] **(d) TDD** — 어댑터 정규화(3모드) + renderer 렌더 + 클릭 실패 테스트 선행

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행)
- [ ] `npm run lint` 0 problems
- [ ] 어댑터 search_result 정규화(Grep 3모드·Glob) 단정 · renderer 파일별 그룹핑 렌더 · 클릭 시 파일 열림(단정) · 계약 미수신/파싱 실패 시 raw 폴백
- [ ] 영호 육안 병행 (ui-visual — 무인 commit X)
- [ ] reviewer 통과 (backend-contract = 무조건)

---

## 📚 학습 포인트

- **구조화 파싱의 견고성** — 같은 도구(Grep)도 모드(files_with_matches/content/count)에 따라 출력이 다르다. 한 포맷만 가정하면 다른 모드에서 깨진다. 파싱 실패 시 raw 폴백이 안전망.
- **IDE다운 탐색** — 검색 결과를 클릭 가능한 링크로 만들면 '검색→열기' 흐름이 GUI 안에서 닫힌다. 텍스트 덩어리와 링크 리스트의 차이가 곧 IDE 체감.

---

## ⚠️ 함정

- **ui-visual = 사람 육안 병행** — 무인 commit X.
- **Grep 포맷 변형** — files_with_matches/content/count 모드별 파싱. 견고성 미확보 시 raw 덩어리보다 나빠질 수 있음 → 폴백 필수.
- **P01 선행(soft)** — CodeViewer 재사용 패턴을 P01에서 먼저 확립하면 클릭 점프 배선이 수월. P01 미완이면 클릭 점프만 지연 배치.
- **backend-contract(어댑터 정규화, CORE-02)** — raw 텍스트 파싱은 renderer가 아니라 **어댑터**에서(엔진 중립). `search_result` 계약은 P03 선정의분 사용, 추가 필요 시 P03로.

---

## 담당 SubAgent

coordinator 경유 — agent-backend Worker(어댑터 정규화 `claude-stream.ts`) + shared-ipc Worker(`search_result` 계약) + renderer Worker(그룹핑·클릭 점프 `02.Source/renderer/**`) + qa(3모드 정규화 테스트) + reviewer 무조건(backend-contract). ui-visual이라 영호 육안 병행.
