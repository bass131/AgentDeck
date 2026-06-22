# Phase 19 — M3 Git 백엔드 (GitModal 실데이터 연결)

> 시각 셸(F11 GitModal) 위에 실 git 백엔드 연결. **원본 AgentCodeGUI git 구현을 직접 미러**(시니어 구현, 사용자 지침).
> 야간 자율 루프 Wave 3. 신뢰경계 CRITICAL — git/child_process는 main 단독, renderer는 IPC만.

## 설계 결정 (원본 레퍼런스 기반)
- **git 실행 = `execFile('git', ...)` 직접 호출**(라이브러리 0). simple-git/isomorphic-git 불필요 → **의존성 추가 0 = ADR 불필요**. `-c core.quotepath=false`, timeout(read 30s/write 120s), maxBuffer 16MB, windowsHide.
- **AI 커밋 메시지 = 활성 에이전트 위임 패턴**(원본 동일, 별도 AI 모듈 X). GitModal "Claude에게" → onAskClaude(prompt) 콜백으로 컴포저/대화에 주입. → **별도 ADR 불필요**.
- **브랜치/태그 = 읽기 전용 리스트**(원본 미러, status에 포함). checkout/create는 원본에도 없음 → 범위 외.
- **데이터 shape 정규화**: gitSampleData `kind:'add'|'modify'|'delete'` → 원본 `status:'M'|'A'|'D'|'R'` + add/del numstat.
- **diff HEAD 스냅샷**: `git show HEAD:relPath` vs 디스크. HEAD 없으면(새 파일) 모두 add. 현재 fs.diff "빈 기준" 버그를 HEAD 조회로 수정.
- **신뢰경계**: 새 `src/main/git.ts`는 **순수 모듈(electron import 금지)**. IPC 핸들러(ipc/index.ts)에서만 호출. renderer는 `window.api.git.*`.

## 추가 계약 (shared/ipc-contract.ts, 9채널)
GIT_ROOT/STATUS/LOG/COMMIT_DETAIL/FILE_AT/WORKING_FILE/COMMIT/PUSH/PULL + 타입 GitChange{path,status,add,del}·GitStatus{root,branch,ahead,behind,changes,branches,remotes,tags}·GitCommit{hash,shortHash,subject,body,author,date,tags,pushed}·GitFileAt{content,diff,error?}·GitOpResult{ok,error?}. preload `api.git.*`(네스팅) + main 9 핸들러.

## main/git.ts 함수 (9)
gitRoot(cwd,force)[캐시] · gitStatus(root)[porcelain v2+branch+remote+tag+numstat] · gitLog(root,limit)[+unpushed @{upstream}..HEAD] · gitCommitDetail(root,hash) · gitFileAt(root,hash,path) · gitWorkingFile(root,path)[HEAD 스냅샷] · gitCommit(root,subject,body)[add -A+commit] · gitPush(root)[upstream 미설정 -u 재시도] · gitPull(root)[--ff-only]. ⚠ **gitPush 실행(실제 origin push)은 무인 금지 — 인간 게이트. 코드/IPC는 구현하되 테스트는 로컬 더미 remote만.**

## 서브웨이브
- **3a (read)**: shared 계약(9채널+타입) + main/git.ts read 함수(root/status/log/commitDetail/fileAt/workingFile) + preload api.git + ipc 핸들러 + qa(임시 git repo 픽스처 통합테스트). GitModal 미연결(샘플 유지).
- **3b (write)**: git.ts gitCommit/gitPush/gitPull + ipc 핸들러/preload. AI 커밋 위임(onAskClaude). 테스트=로컬 더미 remote(실 origin push 금지).
- **3c (UI 연결)**: GitModal 샘플→실 IPC(refresh status/log, commitDetail lazy, fileAt/workingFile, commit/push/pull). gitSampleData shape 정규화. fs.diff HEAD 버그 수정. 시각+기능 검증(실 repo=CustomGUI_Agent 자기 자신).

## 검증
- 각 서브웨이브 = Worker(shared-ipc→main-process→qa, 3c는 renderer) TDD → reviewer(**신뢰경계 CRITICAL**: git.ts electron import 0·child_process main 한정·renderer IPC만) → typecheck/단위/e2e green → conventional commit.
- 완료조건: GitModal이 실 repo의 status/브랜치/커밋 히스토리/diff 표시 + 커밋 동작. push/pull IPC 존재(실 push는 게이트).
