# REPLICA_GAP — AgentCodeGUI 1:1 완전복제 갭 추적 + 루프 드라이버

> **이 파일은 `/loop`의 durable 드라이버다.** 매 iteration이 이 파일을 읽고(현재 갭/다음 웨이브 확인) → 작업 → 갱신한다. 컨텍스트가 압축돼도 여기서 이어간다.
> 권위 인벤토리: 원본=소스 실측(아래 §원본 기능), 우리=소스 실측(아래 §현황). 타깃 시각 스펙=`docs/UI_FIDELITY.md`. 기능 추적=`docs/FEATURE_MAP.md`.

## 🔁 루프 절차 (사용자 정의)
1. **실측** — AgentCodeGUI와 우리 프로젝트를 각각 측정(버튼·동작·세부 설정창 디테일). 1회차에 전수 인벤토리 작성(완료), 이후엔 작업 영역만 재측.
2. **갭 Phase 계획** — 부족분을 구현할 Phase 분해(`phases/NN_*/`), plan-auditor 검증.
3. **구현** — 도메인 Worker(renderer 중심, 디자인 우선) + TDD.
4. **테스트** — typecheck·단위·e2e·lint 게이트 green.
5. **1:1 검증** — 원본과 시각/구조 대조(스크린샷 육안). 완벽하면 해당 웨이브 ✅. 전 웨이브 ✅ = **루프 탈출**, 아니면 다음 웨이브로 반복.

**전략(사용자 지침)**: **디자인부터 전부 만들어 놓고(시각 셸), 이후 기능만 연결**. 따라서 웨이브 F7~F14는 *시각/구조 우선*(백엔드 실데이터는 placeholder, 실동작은 M3 Git·M4 멀티·M5 배포·LSP 기능 트랙에서 연결). 루프 탈출 조건 = 시각 + 기능 모두 1:1.

**자율 실행 지침(2026-06-22 사용자)**: 남은 디자인 웨이브 **F9~F14를 끝까지 자율로** 수행. 각 웨이브 = phase→plan-auditor→Worker TDD→reviewer→시각검증→커밋→이 드라이버/status/task 갱신→다음 예약. **중간 웨이브마다 사용자 보고 생략**(브리프 로그만). **F14(마지막 디자인 웨이브) 완료 후에만 종합 보고**. 막히면(plan-auditor 🔴 반복·게이트 적색 해소 불가·범위 모호) 그때만 사용자에게 질의.

## 상태 범례
✅ 완료(1:1 검증) · 🚧 진행 · 🟡 시각만/placeholder(동작 미연결) · ⬜ 없음

---

## 📋 웨이브 백로그 (디자인-우선 순서 — 루프가 위에서부터 소진)

> 각 웨이브 = 한 milestone(`phases/NN_*`). 한 iteration이 한 웨이브(또는 그 일부)를 처리. **F1~F6 = 완료(충실도 토대).**

### F7 — 설정 모달 5탭 완성 ✅ (커밋 — iteration #2)
원본 Settings 좌 nav **5탭**(Claude Code·MCP·Skill·Code·Theme) 시각 1:1 복제. 정적 샘플, 새 IPC 0.
- [x] nav 2탭 → 5탭(Claude Code/MCP/Skill/Code/테마 아이콘+라벨).
- [x] **Claude Code 탭**: 「현재 엔진」카드 + 버전 vpick 드롭다운(설치/현재/최신 vtag 행) — 정적, 실설치=M5. 🟡 install-card(진행)=M5 후속.
- [x] **MCP 탭**: scope 탭(전체/전역/로컬+카운트) + 서버 행(이름·scope배지·transport칩·토글) + note — 정적.
- [x] **Skill 탭**: scope 탭 + 스킬 행(이름·scope·설명·토글) + note — 정적.
- [x] **Code 탭(LSP)**: 서버 행(FileBadge ts/py/cs/cpp·언어·ver-chip[내장/설치됨/요구사항]·확장자·설치/삭제) — 정적. 🟡 install-card(진행)=M2-LSP 후속.
- [x] **Theme 탭**: F6 셀렉터 이동(라이트/다크, aria-pressed).
- [x] 공통 ScopeTabs + ToggleSwitch(role=switch) + vpick 드롭다운. knob 색=테마-불변 --knob 토큰.
> 검증: settings-tabs 25 단위 + 8 shell e2e + 탭별 스샷 육안 1:1. reviewer/plan-auditor 통과. **잔여 🟡 = install-card(엔진/LSP 진행 카드) → 실설치 연결(M5/M2-LSP) 때 함께.**

### F8 — 사이드바 세션 + 멀티 토글 ✅ (커밋 — iteration #3)
정적 샘플 세션 + 로컬 state CRUD(시각). 세션 CRUD/모드전환/새대화 실동작=M4.
- [x] **단일/멀티 에이전트 토글**(`.sb-mode` 단일 IconSquare/멀티 IconGrid, 로컬 state, 라벨 시각 전환) — 모드 실동작=M4.
- [x] **세션 목록 행**: 상태 점(idle/done/run/err) + 제목 + 프롬프트 글리프(pr-mark) + 상태 부텍스트 + more 메뉴. 정적 샘플 5 + 빈/검색없음.
- [x] **세션 컨텍스트 메뉴**: 이름 변경/프롬프트 설정/삭제(danger) — 좌표 클램프, 바깥클릭/Esc/resize/blur 닫기.
- [x] **이름 변경 다이얼로그**(로컬 제목 변경) + **삭제 확인 다이얼로그**(로컬 행 제거, 되돌릴 수 없습니다).
- [x] 새 대화 버튼 활성(시각, 생성=M4) + 검색 필터(로컬, 제목 부분일치).
- [x] 프로필 풋 동적화(샘플 아바타 색+이니셜+닉네임, sb-foot=설정 트리거). 실 Profile 연동=F12.
> 검증: sidebar-sessions 35 단위 + shell.e2e F8 + 스샷 육안 1:1. Sidebar props 무변경(내부 로컬 state)·Shell.tsx 무변경. plan-auditor(🔴2→반영)·reviewer CRITICAL0.

### F9 — 컴포저 리치 트레이 ✅ (커밋 — iteration #4)
정적 샘플 + 로컬 state. 실행/해석/저장/큐드레인=M4.
- [x] **슬래시 커맨드 메뉴**(`/`): 명령어(ask/init/clear/compact/review/security-review + 설명) + 스킬 섹션. ↑↓/Enter/Tab/Esc. 실행=M4.
- [x] **@mention 팔레트**: @token 샘플 파일/폴더 브라우즈·필터·dir 드릴다운(상위 복귀). @path 삽입. 해석=M4.
- [x] **이미지 첨부 트레이**: attach→샘플 썸네일(data URL) + 드롭 오버레이 + 썸네일+X. 저장=M4.
- [x] **예약 큐 스트립**(optional queued prop, "예약된 메시지 N" + 취소) — 큐 드레인=M4.
- [x] placeholder 3-상태(busy/started[hasStarted]/신규).
> 검증: composer-trays 31 단위 + visual-viewer F9 e2e(슬래시/멘션/첨부 스샷) + 육안 1:1. 큐/드롭/busy=단위 전담. plan-auditor(🟡4 반영)·reviewer CRITICAL0. 495 단위+20 e2e.

### F10 — RecentFiles 탭바 + 에이전트 패널 todo/서브에이전트 ✅ (커밋 — iteration #5)
RecentFiles=실 opened-files(renderer state); 패널 populated=optional prop+샘플(라이브 빈상태, M4 데이터).
- [x] **RecentFiles 탭바**(코드 패널 위): FileBadge+basename+X. 좌클릭 열기·중클릭/X 닫기·드래그 재정렬(FLIP)·우클릭 메뉴(닫기/다른탭/오른쪽/모두). cap 20. 🟡 변경마커 N/M=M4(tag 데이터 부재).
- [x] **할 일 섹션 강화**: 진행바(done/total%) + 체크박스(완료 IconCheck/running spin) + todo 행(.done/.running/.planned). optional prop, 데이터=M4.
- [x] **서브에이전트 카드**: 역할 아이콘+이름+역할부제+상태(running/done/queued)+chev → **SubAgentModal**(활동/도구 섹션). optional prop, 데이터=M4.
- [x] **변경된 파일 FileRow**: FileBadge+path+stat(add/del/tag optional)+chev. 라이브=경로만(diff add/del/tag=M4 샘플 시연).
> 검증: recentfiles 13 + agentpanel-detail 19 단위 + RecentFiles 탭바 e2e + 스샷 1:1. 패널 populated=단위 전담(라이브 빈상태). 새 IPC 0·Shell 최소변경·AgentPanel 무인자. plan-auditor(🟡2 반영)·reviewer CRITICAL0. 527 단위+21 e2e.

### F11 — 모달 군 1 (Git·폴더전환·프롬프트·Ask) ✅ (커밋 — iteration #6)
정적 샘플 + 자기완결 트리거(F8/F9 계약 무파손). git 백엔드=M3·ask 엔진=M4.
- [x] **GitModal**: 헤더(레포·⎇브랜치 ahead/behind·pull/push) + 좌nav(변경/히스토리/브랜치/원격/태그) + 히스토리 리스트(일자그룹·커밋행) + 커밋 상세(파일 리스트·해시 복사) + 변경뷰(커밋 컴포저·Claude). 고정크기+최대화 토글. 탐색기 git 버튼 트리거. git 실동작=M3.
- [x] **FolderSwitchDialog**: "작업 폴더를 변경할까요?" 취소/변경(danger). 단위 전용(라이브 트리거=M4).
- [x] **PromptModal**: IconSpark+"프롬프트 설정" textarea(4000자 카운터)+비우기/취소/저장. 사이드바 ctx-menu 트리거(Sidebar 내부 로컬).
- [x] **AskModal**: `/ask` 분리 대화(orb 헤더·휘발성 pill·최소화 알약·컴포저, 빈상태 기본). Composer onSlashAsk(하위호환). 엔진=M4.
> 검증: gitmodal 32 + dialogs-f11 51 단위 + visual-viewer F11 e2e(Git/Prompt/Ask 스샷) + GitModal 육안 1:1. 새 IPC 0·Sidebar props 무변경·composer 하위호환. plan-auditor(🔴3→4 Phase 분리·자기완결 트리거 반영)·reviewer CRITICAL0. 610 단위+22 e2e. 🟡 exp-act CSS 소유권(비차단).

### F12 — 모달 군 2 (ImageViewer·온보딩·게이트·로그인) ✅ (커밋 — iteration #7)
정적 샘플. ImageViewer=라이브 트리거(첨부); 5개=라이프사이클(Shell open state default off, 라이브 트리거=M5, 단위 시각 검증).
- [x] **ImageViewer 라이트박스**: 오버레이(파일명·카운터·기본앱열기[no-op]·닫기) + 다중(좌우 chevron·썸네일 필름스트립) + 클릭 줌. 컴포저 첨부 트리거(라이브 e2e).
- [x] **WhatsNew 스플래시**: 6슬라이드 온보딩 데크(wn-scrim·칩 네비·CTA). open prop, 자동표시 off.
- [x] **UpdateNotes**: 메탈 그라디언트 hero+키워드 마퀴+번호 리스트.
- [x] **EngineGate** + **AppUpdateGate**: install-card 진행 카드(스피너/체크/경고·로그·상태바, phase별). 실동작=M5.
- [x] **Profile/로그인 온보딩**: 2분할(브랜드 패널 / 닉네임+아바타 색 12종 그리드+입장하기). 자체 TitleBar 미렌더. 진입 게이트=M5.
> 검증: imageviewer 21 + onboarding 24 + gates-profile 60 단위 + ImageViewer e2e(엘리먼트 스샷 다크 라이트박스 1:1) + 라이프사이클 5개 런치 미표시 단정. 새 IPC 0·자동표시 off·Profile TitleBar 중첩 회피. plan-auditor(🟡4 반영)·reviewer CRITICAL0. 715 단위+23 e2e. 🟡 ImageViewer onOpenImage 단위 약함(e2e가 트리거 커버).

### F13 — 멀티에이전트 워크스페이스 ✅ (커밋 — iteration #8)
정적 샘플 패널 + store mode 트리거(자기완결). 동시 실행=M4.
- [x] **MultiWorkspace 그리드**: 2~6 패널(헤더 숫자 탭 COLS{2:2,3:3,4:2,5:3,6:3}, 그리드 열 변동) + 패널(슬롯번호·상태·제목·pill·폴더·프롬프트·컨텍스트 링 conic·빈 스레드·"크게 보기"·RunPickers·PanelComposer) + 일괄 폴더(FolderSwitch)·확장 모달. 사이드바 단일/멀티 토글(store mode)→Shell 메인 영역 교체(사이드바 유지). 동시 실행·패널별 엔진=M4.
> 검증: multiagent-f13 42 단위 + shell.e2e F13(멀티 토글→그리드·count 탭·확장 모달) + 2×2 그리드 스샷 1:1. store mode(Sidebar props 무변경)·새 IPC 0(window.api.multi 미사용)·store 누수 차단. plan-auditor(🟡3 반영)·reviewer CRITICAL0. 757 단위+24 e2e.

### F14 — 폴리시/디테일 ⬜
- [ ] **ZoomBadge**(Ctrl+휠 줌 ±0.1, "120%" 일시 배지) — 채팅/코드/이미지.
- [ ] **PermissionModal**(도구 승인: 허용/항상/거부, 숫자키 1·2·3) + **QuestionModal**(AskUserQuestion: 번호 옵션·스텝·잠깐 내려두기 알약) — 스레드 중앙 모달. *연결=M4.*
- [ ] **메시지 타임스탬프**(메타에 시간) + **브랜드 마크**(asterisk → 원본 IconClaude 대조) + 선택 툴바(복사/더 자세히) + thinking/notice 아이템.
- [ ] **전역 단축키**: Ctrl+N/O/F, `` ` ``(사이드바), Shift+Tab(모드 순환), ↑↓(히스토리), Esc(중지) — *동작=각 기능 트랙, 핸들러 골격.*
- [ ] **창 스냅 존**(좌/우/모서리 스냅 + 고스트 프리뷰) — main geometry 확장.

---

## 🔌 기능 연결 트랙 (디자인 완료 후 — 별도 milestone)
> 시각 셸(F7~F14) 위에 실데이터/실동작을 연결. 루프 탈출엔 이것도 필요.
- **M3 Git**: GitModal 백엔드(git.* 핸들러, status/log/commit/push/pull, AI 커밋), fs.diff HEAD 스냅샷(현재 빈 기준 → 모두 add 버그).
- **M4 멀티·대화고도화**: 모델/effort/mode를 agent.run에 전달, 컨텍스트 게이지 실데이터(usage API), 슬래시 실행, @mention 해석, 이미지 첨부 저장, 큐잉/히스토리, 세션 CRUD(전환/rename/삭제 IPC), todo/서브에이전트 이벤트, 멀티 6패널 동시실행, 권한/질문 응답.
- **M2-LSP**: 호버/정의이동/시맨틱 토큰 + LSP 서버 설치(Code 탭 실동작).
- **M5 배포**: NSIS 패키징, electron-updater, 엔진 버전 관리(Claude Code 탭 실동작), MCP/Skill 실토글, ui-prefs IPC 영속, WhatsNew/UpdateNotes 트리거, Profile 진입.

---

## 📜 Iteration 로그
- **#1 (2026-06-22)** — 실측 전수 완료(원본·우리 양쪽 소스 인벤토리). 본 드라이버 작성. 갭을 웨이브 F7~F14(디자인) + 기능트랙(M3/M4/M5/LSP)으로 구조화. **다음: F7(설정 5탭) 분해·구현.**
- **#2 (2026-06-22)** — **F7 ✅**. 설정 5탭(Claude Code 버전 vpick / MCP·Skill scope+토글 / Code LSP / 테마) 시각 1:1, 정적 샘플, 새 IPC 0. 3 Phase(`09_fidelity-f7`), plan-auditor 승인·reviewer CRITICAL0. settings-tabs 25 단위 + 8 shell e2e + 탭별 스샷 육안검증. 잔여 🟡=install-card(M5/LSP). ⚠️ env: store.test 11건 better-sqlite3 ABI 잠금(실행 중 앱) — node ABI 복구 필요. **다음: F8(사이드바 세션+멀티 토글).**
- **#3 (2026-06-22)** — env 정상화(앱 닫음→`rebuild:node`, store.test 11/11 green). **F8 ✅**. 사이드바 단일/멀티 토글·세션 목록(5 샘플)·컨텍스트 메뉴·rename/삭제 다이얼로그·프로필 풋 설정 트리거. 정적 샘플+로컬 CRUD(시각), 세션 실동작=M4. Sidebar props 무변경(내부 로컬 state)·Shell.tsx 무변경. 3 Phase(`10_fidelity-f8`), plan-auditor(🔴2 반영)·reviewer CRITICAL0. 464 단위 + 19 e2e + 스샷 육안 1:1. **다음: F9(컴포저 트레이: 슬래시/@멘션/첨부/큐).**
- **#4 (2026-06-22, 자율)** — **F9 ✅**. 컴포저 슬래시 메뉴(6 커맨드+스킬)·@멘션 팔레트(샘플 트리, dir 드릴/상위복귀)·이미지 첨부 트레이(샘플 썸네일)·드롭 힌트·예약 큐 스트립(optional prop)·placeholder 3-상태(hasStarted). 실행/해석/저장/드레인=M4. 새 IPC 0. 3 Phase(`11_fidelity-f9`), plan-auditor(🟡4 반영)·reviewer CRITICAL0. 495 단위 + 20 e2e + 슬래시 스샷 육안 1:1. **다음: F10(RecentFiles 탭바 + 패널 todo/서브에이전트).**
- **#5 (2026-06-22, 자율)** — **F10 ✅**. RecentFiles 탭바(코드 패널 위, 실 opened-files=store recentFiles, FLIP 재정렬·ctx-menu) + AgentPanel 강화(Todos progress·SubAgent 카드·SubAgentModal·FileRow). 패널 populated=optional prop+샘플(라이브 빈상태, M4). 새 IPC 0·Shell 최소변경·AgentPanel 무인자. 3 Phase(`12_fidelity-f10`), plan-auditor(🟡2 반영)·reviewer CRITICAL0. 527 단위 + 21 e2e + 탭바 스샷 1:1. e2e 상태오염(leftTab) 수정. **다음: F11(모달군1: Git/폴더전환/프롬프트/Ask).**
- **#8 (2026-06-23, 자율)** — **F13 ✅**. 멀티에이전트 워크스페이스 그리드(2~6 패널 헤더 count 탭·열 변동·패널[슬롯·상태·컨텍스트 링·RunPickers·PanelComposer]·확장 모달·일괄 폴더). store workspaceMode 트리거(Sidebar mode 로컬→store, props 무변경)·Shell multi 분기(메인 영역 교체·single 상태 보존). 새 IPC 0(window.api.multi 미사용). 3 Phase(`15_fidelity-f13`), plan-auditor(🟡3)·reviewer CRITICAL0. 757 단위+24 e2e. afterEach store reset 동기화. **다음: F14(폴리시 — 마지막 디자인 웨이브) → F14 후 종합 보고.**
- **#7 (2026-06-22, 자율)** — **F12 ✅**. 모달군2: ImageViewer 라이트박스(첨부 트리거·줌·필름스트립) + WhatsNew(6슬라이드) + UpdateNotes(마퀴·번호) + EngineGate/AppUpdateGate(install-card) + Profile(2분할 로그인). ImageViewer=라이브 e2e; 5개=라이프사이클 단위 시각(default off·트리거 M5). iv-overlay absolute→fixed 수정. 4 Phase(`14_fidelity-f12`), plan-auditor(🟡4)·reviewer CRITICAL0. 715 단위+23 e2e. **다음: F13(멀티에이전트 워크스페이스 그리드).**
- **#6 (2026-06-22, 자율)** — **F11 ✅**. 모달군1: GitModal(헤더·5nav·일자별 커밋 히스토리·커밋 상세·변경뷰 컴포저) + PromptModal(4000 카운터) + AskModal(orb·휘발성·최소화 알약) + FolderSwitchDialog. 자기완결 트리거(GitModal=탐색기 git버튼, PromptModal=Sidebar 내부 로컬, AskModal=Composer onSlashAsk 하위호환, FolderSwitch=단위). 정적 샘플, git=M3·ask=M4. 4 Phase(`13_fidelity-f11`), plan-auditor(🔴3→자기완결+4분리 반영)·reviewer CRITICAL0. 610 단위+22 e2e + GitModal 스샷 1:1. e2e 워크스페이스 보장 위해 visual-viewer로 이동. **다음: F12(모달군2: ImageViewer/WhatsNew/UpdateNotes/게이트/Profile 로그인).**
