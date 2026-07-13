---
owner: 영호
milestone: GAP1
phase: 01
title: quick win 렌더 재사용 3건 — Read CodeViewer · PanelView todos · MCP verb 라벨
status: pending
grade: 보통
risk: ui-visual
loop_track: human-visual
estimated: 1~3h
domain: renderer
summary: GAP1 감사 quick win 중 renderer 단독 3건 — (1) Read 결과에 기존 CodeMirror CodeViewer 재사용(T-02), (2) 멀티워크스페이스 PanelView에 AgentPanel/todos 마운트(T-08), (3) MCP 도구 verb 사람읽기 라벨(quick-win 5). 신규 컴포넌트 0, 계약·신뢰경계 변경 없음.
---

# Phase 01: quick win 렌더 재사용 3건

> **상태**: pending
> **마일스톤**: GAP1
> **등급**: 보통
> **담당**: renderer (+ qa)

---

## 🎯 목표

이미 앱이 보유한 렌더 인프라(CodeViewer·AgentPanel)를 아직 안 쓰는 지점에 재사용해, 반나절짜리 일관성 결함 3건을 닫는다. 끝나면: Read 결과가 구문강조로 보이고, 멀티워크스페이스에서도 할 일/진행바가 뜨고, MCP 도구가 흉한 원시 이름 대신 '서버 · 도구' 라벨로 읽힌다.

---

## ⏪ 사전 조건

- [ ] 선행 Phase 없음 (P02·P03과 병렬 착수 가능 — 도메인·파일 분리)
- [ ] 근거 = `00.Documents/reports/GAP1-Claude-Code-기능격차-감사.html` (T-02·T-08·quick win 5번)

---

## 📝 작업 내용

- [ ] **(a) Read → CodeViewer 재사용 (T-02)** — 현재 Read 결과는 펼치면 `detailText`(문자열 그대로 / 아니면 JSON.stringify)가 무강조 `<pre>`에만 표시된다(`ToolCallCard.tsx:118-121,206-219`). M2에서 만든 CodeMirror 6 CodeViewer(구문강조+LSP)는 FileModal 전용이라 도구 렌더에서 import되지 않음 → ToolCallCard의 read 분기에서 CodeViewer를 import·배선 + 결과 문자열 판별(코드 텍스트일 때만 CodeViewer, 아니면 기존 `<pre>` 폴백)
- [ ] **(b) PanelView todos 마운트 (T-08)** — 단일챗 Shell엔 AgentPanel '할 일' 섹션(진행바+항목 상태)이 렌더되나(`AgentPanel.tsx:52-79`; `Shell.tsx:379`), 멀티워크스페이스 `PanelView`는 OrchestrationCard·SubAgentInline·LoopStatusBanner·PermissionCard만 마운트하고 AgentPanel/todos는 누락 → PanelView에 AgentPanel(또는 todos 셀렉터) import+마운트
- [ ] **(c) MCP verb 사람읽기 라벨 (quick win 5)** — MCP 도구가 `mcp__claude_ai_Notion__notion-search` 원시 전체 이름 verb로 노출된다(`toolKind.ts:36`) → `mcp__server__tool` 접두사 파싱 → '서버 · 도구' 라벨로 정규화(전체 서버 그룹핑 UI는 GAP1 밖 = M-B T-05)
- [ ] **(d) 노출 지점 전수 열거** — 3건 각각 소비처 grep 전수 확인 후 위임 브리프에 명시(과거 배지 3번째 지점 누락 교훈)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행)
- [ ] `npm run lint` 0 problems
- [ ] Read 결과가 코드일 때 CodeViewer 구문강조로 렌더(단정 테스트) · PanelView에 todos 마운트 확인 · MCP verb가 '서버 · 도구'로 파싱(단정 테스트)
- [ ] 영호 육안 병행 (ui-visual — 무인 commit X)

---

## 📚 학습 포인트

- **재사용 vs 재발명** — 이미 검증된 컴포넌트(CodeViewer)를 새 지점에 붙이는 것이 신규 렌더 로직을 짜는 것보다 일관성·비용 양쪽에서 낫다. "이미 만든 걸 왜 안 썼나"가 quick win의 핵심.
- **접두사 파싱** — `mcp__server__tool` 같은 구조화 문자열은 구분자로 쪼개 사람이 읽을 형태로 재조립. 정규식보다 split 기반이 견고할 때가 많다.

---

## ⚠️ 함정

- **ui-visual = 사람 육안 병행** — 기능은 자율 진행하되 무인 commit X. 시각 변화는 영호 육안 판정.
- **UI 롤아웃 노출 지점 전수 열거** — 소비처를 grep으로 전수한 뒤 위임(memory: ui-rollout-surface-enumeration — 배지 3번째 지점 누락 교훈). Read 렌더는 단일챗·멀티패널 양쪽에 노출될 수 있음.
- **CodeViewer 판별 오탐** — 도구 결과가 항상 코드는 아니다(JSON·에러 메시지 등). 코드 텍스트 판별에 실패하면 무강조 `<pre>` 폴백 유지 — 판별 실패가 렌더 깨짐으로 이어지지 않게.

---

## 담당 SubAgent

renderer Worker(구현, `02.Source/renderer/**`) + qa(테스트, `99.Others/tests/**`). ui-visual이라 영호 육안 병행.
