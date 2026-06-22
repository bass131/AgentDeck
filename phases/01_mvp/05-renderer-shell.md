# Phase 05: renderer-shell

## 목표
3-pane React UI 셸이 완성된다 — 좌 파일탐색기(+AI 인디케이터), 중앙 대화 패널(스트리밍·도구카드·입력창), 우 에이전트 상태, diff 뷰어. Zustand store가 IPC 이벤트를 구독. 다크 테마.

## 담당 도메인 / 에이전트
renderer. 등급: 복잡~대규모 (**대규모면 coordinator 분해 필수** — 4컴포넌트+store+테마).

## 의존 Phase
02 (계약·타입). (실데이터는 06에서 연결 — 본 Phase는 store/목 데이터로 UI 완성)

## 위험 깃발
없음. (단 renderer untrusted 규칙 준수)

## 변경 대상
- `src/renderer/src/layout/` — 3-pane 셸
- `src/renderer/src/components/` — `FileExplorer` / `Conversation`(스트리밍·도구카드) / `AgentPanel` / `DiffViewer`
- `src/renderer/src/store/` — Zustand: 대화/스트리밍/변경파일/현재작업
- `src/renderer/src/theme/` — 토큰 적용(다크)
- `tests/renderer/` — 컴포넌트 렌더/상호작용 테스트

## 작업 단계
1. 3-pane 레이아웃(UI_GUIDE 다이어그램) + 타이틀바(워크스페이스명 + 백엔드 라벨='Claude Code' **고정 텍스트**) + 하단 바. ⚠️ 토큰 게이지·백엔드 전환 UI는 본 Phase 비대상(토큰게이지 B8=M4 / 백엔드전환 A3=Track2·M6) — 넣더라도 **빈 placeholder DOM만, 계산/전환 로직 0**.
2. Zustand store: `AgentEvent`를 받아 스트리밍 텍스트 누적 / 도구카드 / 파일변경 반영(리듀서).
3. `Conversation`: 스트리밍 append(가상화/메모이즈로 60fps), 도구호출 *접이식 카드*(실행중/에러 펼침), 하단 입력창.
4. `FileExplorer`: 트리 + AI-건드린 인디케이터. 클릭 → DiffViewer/코드뷰 탭.
5. `DiffViewer`: 추가=`--ok`/삭제=`--del` 시각화(UI_GUIDE).
6. 모든 권한작업은 `window.api`(IPC) 경유 — fs/Node 직접 호출 0. 채널명 하드코딩 0.
7. **안티슬롭 준수**: glass/그라데이션텍스트/네온/이모지아이콘 금지.
8. 컴포넌트 테스트(렌더 + 입력 상호작용).

## 완료조건 (AC)
- [ ] `npm run typecheck` green + 컴포넌트 테스트 PASS.
- [ ] `npm run dev`로 3-pane가 다크로 렌더(목 데이터로 스트리밍/도구카드/diff 시연).
- [ ] renderer에서 Node/fs 직접 호출 0 (grep `require('fs')`/`window.require` 없음).
- [ ] 인라인 색상 없음(토큰 변수 사용).
- [ ] **토큰 게이지·백엔드 전환 로직 0** — 사용량 계산·엔진 전환 코드 없음(grep). 백엔드 라벨은 고정 텍스트. (토큰게이지 B8=M4 / 백엔드전환 A3=Track2·M6)

## 참조
docs/UI_GUIDE.md(레이아웃·팔레트·안티슬롭) · docs/ARCHITECTURE.md(단방향 흐름) · CLAUDE.md(신뢰경계) · ADR-002/005.
