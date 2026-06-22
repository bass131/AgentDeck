# Phase 02: session-menu-dialogs

## 목표
세션 행 **컨텍스트 메뉴(ctx-menu)** + **이름 변경/삭제 다이얼로그** + 로컬 state CRUD(시각). 우클릭/more → 메뉴.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F8-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. 로컬 state CRUD 시각).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/Sidebar.tsx` — sb-item 우클릭(onContextMenu) + more 버튼 클릭 → ctx-menu(좌표 클램프, 바깥클릭/Esc 닫기). ctx-item: 이름 변경(IconPencil)·프롬프트 설정(IconSpark)·ctx-sep·삭제(IconTrash danger). 메뉴 액션 → rename/delete 다이얼로그. rename=로컬 state 제목 변경, delete=로컬 state 행 제거(시각). 프롬프트 설정=no-op(M4) 또는 hasPrompt 토글(시각).
- `src/renderer/src/components/ConfirmDialog.tsx` (신규, 또는 Sidebar 내부) — 재사용 set-dialog: rename(sd-ic warn IconPencil + sd-title + sd-input autoFocus+select, Enter 저장/Esc 취소 + sd-btns 취소/저장) · delete(sd-ic IconTrash + sd-title + sd-msg "<b>제목</b> … 되돌릴 수 없습니다." + sd-btns 취소/삭제 danger).
- `src/renderer/src/components/Sidebar.css` (또는 신규 ConfirmDialog.css) — ctx-menu/ctx-item(.danger)/ctx-sep · set-dialog-overlay/set-dialog/sd-ic(.warn)/sd-title/sd-msg/sd-input/sd-btns/sd-cancel/sd-go(.danger). 색 토큰.

## 작업 단계
1. ctx-menu 상태(id+좌표) + 좌표 클램프(window.innerWidth/Height 경계; **menuH는 프롬프트 항목 유무로 분기 — 원본 onPrompt?127:92, 우리 단일모드만 프롬프트 항목**) + 바깥 mousedown/Esc 닫기(capture 주의, resize/blur 닫기 보강).
2. 메뉴 항목 3 + sep. rename/delete 다이얼로그 오픈.
3. 다이얼로그: rename 입력(Enter 저장→로컬 제목 변경) · delete 확인(→로컬 행 제거). 시각 동작만(실 IPC X).
4. CSS. 인라인 색 0.
5. 테스트(단위): more 클릭 → ctx-menu 표시 · 이름 변경 클릭 → sd-input 다이얼로그 · 입력+저장 → 행 제목 갱신 · 삭제 클릭 → 확인 다이얼로그 → 삭제 시 행 사라짐.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: ctx-menu(이름변경/프롬프트/삭제) 표시 · rename 다이얼로그 저장 시 로컬 제목 변경 · delete 확인 시 행 제거 · Esc/바깥클릭 닫기. PASS.
- [ ] scope grep: window.api 세션 CRUD 호출 0(로컬 state).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 Sidebar.tsx L172~256(ctx-menu + 다이얼로그) · REPLICA_GAP F8.
