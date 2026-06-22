# Phase 02: chat-polish-zoom

## 목표
채팅 폴리시(**메시지 타임스탬프** + **thinking/notice 아이템** + **선택 툴바**) + **ZoomBadge**(Ctrl+휠 줌). 정적 샘플/로컬.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F14-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. 줌 영속=localStorage. 선택 인용 실연결=M4).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/lib/zoom.ts`(신규) — useZoom 훅(Ctrl+휠, clamp 0.5~3 step 0.1, localStorage 영속, flash) + ZoomBadge 컴포넌트("N%" 일시 pill). lib/theme의 localStorage 패턴 재사용.
- `src/renderer/src/components/Conversation.tsx` — 채팅 스크롤에 useZoom 연결(zoom CSS + ZoomBadge). 메시지 메타에 **타임스탬프**(.meta 시간). **thinking 아이템**(IconClaude + 사고요약 + 점3 애니) + **notice 아이템**(IconAlert + 텍스트 + 시간) 렌더(메시지 타입 분기, 샘플/store 기반).
- `src/renderer/src/components/SelectionToolbar.tsx`+CSS(신규) — 스레드 텍스트 selection 시 떠서 「복사」(IconCopy→복사됨)/「더 자세히」(IconSearch). 복사=navigator.clipboard(renderer-safe), 더 자세히=콜백(시각, 실 인용=M4).
- `src/renderer/src/components/Conversation.css` — 타임스탬프·thinking·notice·zoom-badge. 토큰.
- `src/renderer/src/components/icons.tsx` — IconCopy(없으면) 추가.

## 작업 단계
1. zoom.ts(useZoom + ZoomBadge) + Conversation 연결.
2. 메시지 타임스탬프 + thinking/notice 아이템.
3. SelectionToolbar.
4. CSS. 인라인 색 0(zoom CSS factor 인라인 허용, 색 아님).
5. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: useZoom(Ctrl+휠 → zoom 변경 + flash) · ZoomBadge(show 시 .on) · 메시지 타임스탬프 렌더 · thinking 아이템(사고요약+점) · notice 아이템(IconAlert) · SelectionToolbar(selection → 복사/더 자세히, 복사 클릭→복사됨). PASS.
- [ ] scope grep: window.api 줌/선택 0(localStorage/clipboard renderer-safe).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 zoom.tsx(전체) · Chat.tsx thinking/notice/SelectionToolbar · REPLICA_GAP F14.
