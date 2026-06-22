# Phase 01: imageviewer-lightbox

## 목표
**ImageViewer 라이트박스**(오버레이·좌우 chevron·썸네일 필름스트립·클릭 줌) — 컴포저 첨부 썸네일 클릭 트리거.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F11(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. 기본앱열기=no-op/M5).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/ImageViewer.tsx`+CSS(신규) — iv-overlay > iv-top(iv-name + iv-count N/M[다중] + iv-spacer + 기본앱으로 열기[no-op, M5] + 닫기) + iv-stage(iv-nav prev/next[다중] + iv-imgwrap > iv-img[클릭 줌 토글]) + iv-strip(iv-thumb 필름스트립[다중]). Esc/←→/백드롭 닫기. props {images,index,onIndexChange,onClose}.
- `src/renderer/src/components/Composer.tsx` — **optional `onOpenImage?(images,i)` prop 신규 추가**(F9 img-thumb-open에 onClick 핸들러 부재 — 신규 배선). img-thumb-open onClick → onOpenImage?.(images,i). **미주입 시 no-op(하위호환).**
- `src/renderer/src/components/Conversation.tsx` — onOpenImage 전달(Shell 경유). 전달 외 변경 금지.
- `src/renderer/src/layout/Shell.tsx` — imageViewer state{images,index} + ImageViewer 렌더 + Conversation onOpenImage 콜백. 배치 최소.
- 이미지 src=기존 lib/viewer.ts/images 헬퍼 재사용(data URL). 새 IPC 0.

## 작업 단계
1. ImageViewer(단일/다중, 줌, 필름스트립, 키보드).
2. Composer onOpenImage(optional, 하위호환) → Conversation → Shell open state.
3. CSS. 인라인 색 0.
4. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: ImageViewer 단일(이미지+닫기) · 다중(iv-count·prev/next·필름스트립 iv-thumb·← →) · iv-img 클릭 줌 토글 · Esc/백드롭 닫기 · 컴포저 썸네일 클릭 → onOpenImage 콜백(미주입 시 no-op). PASS.
- [ ] scope grep: ImageViewer window.api 실 호출 0(기본앱열기=no-op).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 ImageViewer.tsx 전체 · REPLICA_GAP F12 · F9 첨부 트레이.
