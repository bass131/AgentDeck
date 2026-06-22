# Phase 01: recentfiles-tabbar

## 목표
코드 패널 위 **RecentFiles 파일 탭바**(`.chat-files`). 실 opened-files(renderer state) 연결. 드래그 재정렬·컨텍스트 메뉴·변경 마커.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F9(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. store는 renderer Zustand — main 무관).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/store/appStore.ts` — `recentFiles: string[]` 상태 + openFile 시 최신순 누적(dedup, cap 20) + `removeRecentFiles(paths)`·`reorderRecentFiles(files)` 액션 + selectRecentFiles 셀렉터. **renderer state만, 새 IPC/채널 0.**
- `src/renderer/src/components/RecentFiles.tsx`(신규) — `.chat-files` 탭바: cf-tab(FileBadge size15 + cf-name basename + cf-x) · activePath(openedFile) .on · 드래그 재정렬(FLIP useLayoutEffect + 중간점 스왑) · 휠클릭/x 제거 · onContextMenu → ctx-menu(닫기/다른 탭/오른쪽/모두 — 모두 닫기는 기존 IconTrash, 좌표 클램프, 바깥/Esc/resize/blur 닫기). files 빈 배열 → null. **⚠️ 변경 마커(exp-chg N/M)는 라이브 비대상**: store changedFiles=Set<string>(경로만, tag 없음) → cf-tab 마커 미렌더(라이브). tag 기반 N/M 마커는 M4(diff 데이터) 후속.
- `src/renderer/src/components/RecentFiles.css`(신규) — chat-files/cf-tab(.on/.dragging)/cf-name/cf-x. ctx-menu는 Sidebar(F8) 클래스 재사용. exp-chg는 기존/신규. 색 토큰.
- `src/renderer/src/components/icons.tsx` — IconChevsRight·IconCloseOthers·IconX2(없으면) 추가.
- `src/renderer/src/layout/Shell.tsx` — 코드 패널(centerTab 'code') 콘텐츠 위에 `<RecentFiles>` 렌더. 탭 클릭→openFile, 제거→removeRecentFiles, 재정렬→reorderRecentFiles, activePath=openedFile, changed=changedFiles. **이 배치 외 Shell 로직 변경 최소.**

## 작업 단계
1. store: recentFiles + 액션 + openFile 누적.
2. RecentFiles 컴포넌트(FLIP 재정렬·중간점 스왑·ctx-menu).
3. Shell 코드 패널에 배치.
4. CSS. 인라인 색 0(FLIP transform 인라인 style은 허용 — 색 아님).
5. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: 파일 2개 openFile → recentFiles 누적(최신순·dedup) · RecentFiles 탭 2개 렌더(badge+name) · activePath .on · x 클릭 → removeRecentFiles · 우클릭 → ctx-menu(닫기/모두 닫기) · 빈 배열 → null. **재정렬은 `reorderRecentFiles` 액션 호출 + 배열 순서 단위 단언으로 검증**(FLIP 애니메이션 자체는 육안/스샷). PASS.
- [ ] scope grep: store recentFiles 관련 window.api/ipc 0(renderer state).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 RecentFiles.tsx 전체 · REPLICA_GAP F10 · 기존 Sidebar ctx-menu(F8).
