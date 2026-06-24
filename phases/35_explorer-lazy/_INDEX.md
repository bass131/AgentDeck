# Phase 35 — M7: 탐색기 스케일링 (W5)

> 드라이버: `docs/WEAKNESS_BOOST.md` M7. buildTree가 **전체 재귀**(필터/깊이/MAX 전무) → node_modules 포함 대형 repo에서 **폭발**. lazy 1레벨 로딩으로 전환.
> 등급: **복잡(다도메인)**. shared(FS_LIST_DIR)+main(workspace.ts)+renderer(FileExplorer). 한 커밋 동반.

## 0. 현황 (실측)
- `workspace.ts` buildTree(L98-130): **완전 재귀**(L120), 필터/깊이/MAX **전무**(주석 L91 "MVP 전체 트리"). → 대형 repo 폭발(W5).
- 원본은 탐색기 = **lazy `listDir`**(files.ts L64-81: 1폴더만, **필터 0**(실트리·node_modules 표시), resolveSafe containment, 폴더우선 정렬). @멘션만 `listProjectFiles`(SKIP_DIRS/KEEP_DOT_DIRS/MAX_FILES) 별도.
- 우리 FileExplorer(428줄): buildTree 전체트리를 `node.children` 재귀 렌더(expanded Set=show/hide만, 트리는 upfront 빌드). @멘션 워크 = `src/main/fs/listFiles.ts`(SKIP_DIRS 존재).

## 1. 목표 (왜)
탐색기가 워크스페이스 열 때 전체 트리를 재귀 빌드 → node_modules/대형 repo에서 멈춤·폭발. 원본처럼 **lazy(폴더 펼칠 때 1레벨씩)**로 전환해 즉시 로드.

## 2. 범위 (무엇) — 원본 files.ts/Explorer.tsx 미러
### A. shared `src/shared/ipc-contract.ts`
- `FS_LIST_DIR: 'fs.listDir'` 채널 + 요청 `{ rootId?: string, relDir: string }` + 응답 `{ entries: FileTreeNode[] }`(shallow — name/path/kind, children 미포함).
- **B3(신뢰경계·rootId 해석 확정)**: `rootId`는 **레지스트리 ID만**(`_roots.get(rootId)?.path`, 미지정 → `_currentWorkspaceRoot`). **임의 절대경로 문자열 금지**(FS_READ `index.ts:557` 패턴 동형). 레퍼런스 폴더 lazy 펼침 지원(원본 `root = viewing||cwd`).
- **S4(path 채움)**: 응답 노드 `path` = `relDir` prefix 결합한 **root-상대 POSIX**(`relDir ? relDir+'/'+name : name`). FileExplorer가 node.path로 expanded/changed 룩업하므로 필수.

### B. main `src/main/fs/workspace.ts` + `src/main/ipc/index.ts`
1. **buildTree 루트 1레벨 축소**: WORKSPACE_TREE가 **root + 1레벨 children**만(재귀 제거 — children의 grandchildren 미빌드). 깊이=1. **안전캡**(MAX entries/depth, 단 1레벨이라 사실상 1폴더 readdir).
2. **`listDir(root, rel): FileTreeNode[]`** 신규(원본 files.ts L64-81 미러): resolveSafe containment(우리 resolveSafe 재사용 — `resolveSafe(root, rel)` null이면 `[]`), readdir withFileTypes, **필터 0**(실트리·node_modules 표시, 원본 fidelity), 폴더우선 알파벳 정렬. FileTreeNode[] 반환(children 미포함 shallow).
3. **FS_LIST_DIR 핸들러**: rootId 게이트(WORKSPACE_TREE 동형) + relDir resolveSafe → listDir. 임의 경로 거부.
4. **SKIP_DIRS/KEEP_DOT_DIRS 단일출처화**: listFiles.ts의 상수를 공유 모듈(`src/main/fs/skipDirs.ts` 또는 기존)로 단일정의(멘션 워크 전용 — **탐색기 listDir엔 미적용**, 원본대로). 중복 제거 수준(기능 변경 X).

### C. renderer `src/renderer/src/components/FileExplorer.tsx`
1. **lazy 펼침**: buildTree 1레벨 → 폴더 expand 시 미로드면 `window.api.fsListDir({rootId, relDir: node.path})` → childrenCache(Map<path, FileTreeNode[]>) 저장·렌더. **S3(빈vs미로드 구분)**: cache에 key 존재=로드됨, 없음=미로드(빈 폴더 오인 방지 — 원본 entries Map 패턴). **S3(race 가드)**: `genRef`로 stale async 무시(빠른 펼침/접기/워크스페이스 전환 시 stale children 삽입 차단, 원본 Explorer.tsx:85/110).
2. **B1(검색 경로 전환·CRITICAL)**: 검색은 lazy 트리가 아닌 **`window.api.listFiles()` 플랫 배열** 기반(원본 hits 미러 — 우리 LIST_FILES 핸들러 `index.ts:568`·`appStore.ts:1055` 재사용). `filterFiles(트리)`/`treeFilter.ts`는 **검색 경로에서 제거**(깊은 파일 검색 보존). treeFilter.test.ts는 dead면 삭제·검색 테스트는 listFiles 기반 재작성. 검색 인덱스(allFiles)는 refreshKey 시 무효화(원본 L150).
3. **S2(prefs 깊은 경로 lazy 복원·CRITICAL)**: expanded prefs 경로 형식을 **root-상대 POSIX로 통일**(listDir relDir과 일치). 절대경로 저장 기존 prefs는 하위호환(루트 prefix strip 또는 신규 키). 마운트 복원 시 저장된 각 rel을 **개별 fsListDir 로드 + 조상 폴더 children도 로드**(깊은 폴더 트리 연결 — 부모 children 없으면 자식 미렌더). 조상이 expanded에 포함되도록 보장.
4. **변경점 조상 폴더 롤업**(원본 Explorer.tsx L87-102 미러): changed 파일 → files Map + 조상 dir Map(walk-up, new 우선). 폴더 노드 변경 점 배지.
5. **refreshKey**: 화면에 보이는 것만 재로드(루트 + expanded 각 폴더 fsListDir, 원본 L146-152) + allFiles 무효화(B1 연계).

### OUT
- 탐색기 SKIP_DIRS 필터(원본은 실트리 표시 — 필터 안 함). 단일출처화는 멘션 워크 한정.
- 가상 스크롤·대용량 폴더 페이지네이션 — 후속(listDir가 1폴더라 1차 완화).

## 3. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| shared-ipc | `src/shared/ipc-contract.ts`(FS_LIST_DIR)·`src/preload/index.ts`(fsListDir 노출) | W |
| main-process | `src/main/fs/workspace.ts`(buildTree 축소·listDir)·`src/main/ipc/index.ts`(핸들러)·`src/main/fs/listFiles.ts`(상수 단일출처) | W |
| renderer | `src/renderer/src/components/FileExplorer.tsx`(lazy·롤업·refreshKey)·CSS | W |
| qa | `tests/**`(workspace.test.ts 재귀 4건 **lazy 1레벨로 개정**·treeFilter.test.ts 거취·검색 listFiles 재작성) | W |
| 불변(확인) | LSP/diff/git = buildTree 무관(grep 0, 안전). **reference.tree도 buildTree 사용** → 같은 lazy 전환(레퍼런스 폴더). | 검증·동반 |

## 4. 의존성 순서
1. 실패 테스트 먼저(listDir resolveSafe 거부·1레벨·폴더우선·path 상대POSIX·buildTree 1레벨·**workspace.test.ts 재귀 4건 개정**·FileExplorer lazy 펼침·검색 listFiles·조상 롤업·prefs 상대복원·race 가드) → 2. shared FS_LIST_DIR(rootId 레지스트리) → 3. preload → 4. workspace listDir + buildTree 축소 + 상수 단일출처 → 5. FS_LIST_DIR 핸들러(rootId 게이트·resolveSafe) → 6. FileExplorer lazy/검색전환/prefs상대/롤업/refreshKey/race → 7. typecheck 양쪽 green → 단위 green → 8. **실 런타임 e2e**(node_modules repo 즉시로드·lazy 펼침·검색 깊은파일) → reviewer → commit.
**착수 전 grep 완료(plan-auditor)**: buildTree 소비자 = FileExplorer(렌더+검색)·reference.tree. LSP/diff/git 무관(안전). 검색(filterFiles→treeFilter)·기존 workspace 재귀 테스트가 충돌 → B1/B2로 편입.

## 5. 측정가능 완료조건 (AC)
- [ ] **listDir resolveSafe 단위(신뢰경계 CRITICAL·S1)**: `listDir(root, '../escape')`·절대경로·`..` → `[]`(resolveSafe null **반드시 체크**). 정상 rel → 1레벨 entries, path=root-상대 POSIX(S4). 폴더우선 정렬.
- [ ] **FS_LIST_DIR rootId 게이트(B3)**: 미등록 rootId → `[]`. 임의 절대경로 rootId 거부(레지스트리 ID만). 미지정 → 워크스페이스.
- [ ] **buildTree 1레벨 단위 + 기존 테스트 개정(B2)**: buildTree(root) → root + 1레벨(child.children 부재). **workspace.test.ts 재귀 4건을 1레벨 검증으로 개정**(재귀 가정 제거). 개정 후 green.
- [ ] **검색 깊은파일(B1·CRITICAL)**: 검색이 `listFiles` 플랫 기반 → 깊은 파일(`src/index.ts`) 검색됨(lazy 트리 무관). treeFilter 검색 경로 제거 후에도 검색 동작.
- [ ] **FileExplorer lazy 단위**: 폴더 expand → 미로드면 fsListDir → 렌더. 재expand 캐시(중복0). **빈vs미로드 구분**(cache key)·**race 가드**(genRef stale 무시).
- [ ] **prefs 깊은복원(S2)**: root-상대 prefs 저장/복원. 깊은 폴더(`a/b/c`) 복원 시 조상 children 로드되어 트리 연결. 절대경로 기존 prefs 하위호환.
- [ ] **조상 롤업 단위**: changed=[{path:'a/b/c.ts', tag:'new'}] → dirs Map에 'a'·'a/b' green. edit는 edit, new 우선.
- [ ] **node_modules 폭발0 e2e(핵심·실 런타임)**: node_modules 포함 repo(또는 test project) 열기 → 탐색기 **즉시 로드**(전체 재귀 0·멈춤 0). node_modules는 1레벨 항목으로 표시되되 미펼침(클릭 시에만 1레벨 로드).
- [ ] **lazy 펼침 e2e**: 폴더 클릭 → 1레벨 children 로드 DOM. 조상 dot 롤업 표시.
- [ ] **회귀 0**: 기존 explorer/tree/workspace 테스트 green. typecheck 양쪽 green. m4-4-* 2건 증가 0.

## 6. 검증 3층
- ① 단위 TDD: listDir resolveSafe/1레벨/정렬 · buildTree 축소 · FileExplorer lazy/롤업.
- ② 스모크: (선택) workspace.ts listDir 실 디렉토리 직접.
- ③ 실 런타임 e2e: node_modules repo 즉시로드(폭발0) + lazy 펼침 + 조상 롤업 DOM.

## 7. 리스크·롤백
- **신뢰경계(CRITICAL)**: listDir relDir untrusted → resolveSafe containment(우리 기존 함수) 필수. 임의 경로 readdir 0. WORKSPACE_TREE rootId 게이트 동형.
- **buildTree 소비자 회귀(CRITICAL)**: 축소가 LSP/diff/tree 전체트리 가정 깨면. 완화 = grep으로 소비자 전수 + 깨지면 그 소비자는 별 경로(전체 워크 필요시 listProjectFiles) 또는 lazy 미들스텝. **착수 전 grep 필수.**
- **lazy UX**: 펼침 지연·로딩 상태 미표시 시 빈 폴더 오인. 완화 = 로딩 인디케이터/캐시.
- **IPC 4면**: shared 단일정의 + typecheck 양쪽.
- **롤백**: FS_LIST_DIR 신규·buildTree 축소가 핵심 → revert 1커밋. buildTree를 재귀로 되돌리면 Phase A 동작(단 폭발 복귀).

## 8. ADR
- 불요. IPC 깃발(FS_LIST_DIR 신규) + 충실도 복원(원본 listDir 미러). _INDEX 흔적 + reviewer.
