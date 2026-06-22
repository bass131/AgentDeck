# Phase 01: gitmodal

## 목표
**GitModal** 시각 1:1(헤더·좌nav·히스토리 뷰·변경 뷰·커밋 컴포저). 정적 샘플 git 데이터. 탐색기 git 버튼 트리거.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통~복잡.

## 의존 Phase
F10(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. git 백엔드(status/log/commit/push/pull)=M3 후속. 정적 샘플).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/lib/gitSampleData.ts`(신규) — GIT_STATUS{repoName,root,branch,ahead,behind,branches[{name,current}],remotes[],tags[],changes[{path,kind}]} + GIT_COMMITS[{hash,shortHash,subject,body,author,date}] + GIT_COMMIT_FILES(해시→변경파일[]). window.api 0.
- `src/renderer/src/components/GitModal.tsx`+CSS(신규) — gitm-overlay>gitm-modal>diff-head(IconGitBranch + repo + ⎇branch ↑/↓ + path + 당겨오기/푸시[시각] + max/close) + gitm-body(gitm-nav[변경 사항/모든 커밋/브랜치/원격/태그] + history 뷰[gitm-filter 검색 + 커밋 rows + gitm-detail gd-*] + changes 뷰[gitm-day + FileRow + gitm-compose subject/body/Claude/커밋]). view state(changes|history). Esc/오버레이 닫기. 리사이즈/최대화는 단순화 가능(고정 크기 + 최대화 토글). **commit/push/pull=시각(no-op/로컬), 실동작=M3.**
- `src/renderer/src/components/FileExplorer.tsx` — 헤더에 git 버튼(IconGitBranch) 추가 → onOpenGit. (또는 Shell 트리거.)
- `src/renderer/src/layout/Shell.tsx` — gitOpen state + GitModal 렌더 + 탐색기 git 버튼 연결. 배치 최소.
- `src/renderer/src/components/icons.tsx` — IconGitBranch(없으면) 추가.

## 작업 단계
1. gitSampleData.ts.
2. GitModal(헤더·nav·두 뷰·컴포저) + CSS(gitm-*). 색 토큰.
3. 탐색기 git 버튼 + Shell open state.
4. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: git 버튼 → GitModal 열림 · diff-head(repo·branch·pull/push) · nav(변경 사항/모든 커밋) · history 뷰 커밋 rows + 선택 시 gd-detail · changes 뷰 FileRow + 커밋 컴포저(subject input) · **최대화 토글 동작**(고정 크기 + max 토글; 자유 리사이즈 핸들은 충실도상 생략) · Esc 닫기. PASS.
- [ ] scope grep: GitModal window.api git 호출 0(샘플).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 GitModal.tsx L258~486 · REPLICA_GAP F11.
