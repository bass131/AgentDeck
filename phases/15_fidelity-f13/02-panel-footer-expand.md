# Phase 02: panel-footer-expand

## 목표
패널 footer(**RunPickers** + **PanelComposer**) + **확장 모달**(크게 보기) + **일괄 폴더/패널 프롬프트** 트리거.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F13-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. 전송/폴더/프롬프트=시각·로컬. M4).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/PanelView.tsx` — footer: **RunPickers**(모델/effort/모드 — 컴포저 Pick 재사용 가능, 패널별 로컬 picker state, DEFAULT_PICKER opus/xhigh/bypass) + **PanelComposer**(ma-attach[no-op] + textarea "메시지를 입력하세요" + ma-send[send 아이콘]). 「크게 보기」 ma-p-zoom → onExpand(slot). ma-p-row2 프롬프트 버튼 → onPrompt(slot).
- `src/renderer/src/components/MultiWorkspace.tsx` — expandedSlot state + **확장 오버레이**(ma-expand-overlay 백드롭 + ma-expand-card > 확장 패널[닫기 버튼]). Esc/백드롭 닫기. ma-batch 「일괄 폴더」 → FolderSwitchDialog(F11) open(시각, **from=현 패널 cwd / to=SAMPLE_BATCH_TO 더미** — OS 다이얼로그 금지). 패널 프롬프트 → PromptModal(F11) open(시각, target=패널 제목·scope "패널 N에만 적용"). promptSlot/pendingFolder 로컬 state.
- `src/renderer/src/components/*.css` — ma-p-composer/ma-attach/ma-send · ma-expand-overlay/ma-expand-card · RunPickers. 토큰.

## 작업 단계
1. PanelView footer(RunPickers + PanelComposer).
2. 확장 모달(ma-expand) + 일괄폴더(FolderSwitch)·프롬프트(PromptModal) 트리거.
3. CSS. 인라인 색 0.
4. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: PanelView footer(RunPickers 3 + PanelComposer textarea + send) · 크게 보기 클릭 → ma-expand-overlay + 확장 패널 + Esc/백드롭 닫기 · 일괄 폴더 → FolderSwitchDialog · 패널 프롬프트 → PromptModal. PASS.
- [ ] scope grep: window.api.multi 전송/폴더 실 호출 0.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 MultiAgent.tsx PanelComposer L172~/RunPickers L861/확장 L1364~1370 · F11 FolderSwitch/PromptModal · REPLICA_GAP F13.
