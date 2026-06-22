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

### F9 — 컴포저 리치 트레이 ⬜
- [ ] **슬래시 커맨드 메뉴**(`/`): 명령어 섹션(ask/init/clear/compact/review/security-review + 설명) + 스킬 섹션. ↑↓/Enter/Tab/Esc. *실행=M4*.
- [ ] **@mention 팔레트**: @token 시 파일/폴더 브라우즈·필터·드릴다운. ↑↓/Enter/Esc. *해석=M4*.
- [ ] **이미지 첨부 트레이**: 버튼 onClick(파일 피커 시각) + 드롭 오버레이("이미지를 여기에 놓으세요") + 썸네일+X 트레이. *저장=M4*.
- [ ] **예약 큐 스트립**(컴포저 위 "예약된 메시지 N" 리스트 + 취소) — *큐 실행=M4*.
- [ ] placeholder 상태별 변경(busy/시작됨/신규).

### F10 — RecentFiles 탭바 + 에이전트 패널 todo/서브에이전트 ⬜
- [ ] **RecentFiles 탭바**(채팅 헤더 아래): FileBadge+basename+변경마커(N/M)+X. 좌클릭 열기·중클릭/X 닫기·드래그 재정렬(FLIP)·우클릭 메뉴(닫기/다른탭/오른쪽/모두). 최대 20.
- [ ] **할 일 섹션 강화**: 진행바(done/total%) + 체크박스(완료 IconCheck/running 스피너) + todo 행(.done/.running/.planned). *데이터=M4*.
- [ ] **서브에이전트 카드**: 역할 아이콘+이름+역할부제+상태(running/done/queued)+chevron → **SubAgentModal**(활동/도구 섹션). *데이터=M4*.
- [ ] **변경된 파일 강화**: +N/−M 수치 + NEW/EDIT 태그 + chevron(현재 단일 dot).

### F11 — 모달 군 1 (Git·폴더전환·프롬프트·Ask) ⬜
- [ ] **GitModal**: 헤더(레포·브랜치 ahead/behind·pull/push) + 좌nav(변경/히스토리/브랜치/원격/태그) + 히스토리 리스트(일자그룹·커밋행) + 커밋 상세(파일 리스트) + 변경뷰(커밋 컴포저·Claude 메시지 생성). *git 백엔드=M3*.
- [ ] **FolderSwitchDialog**: "작업 폴더를 변경할까요?" 취소/변경(danger).
- [ ] **PromptModal**: IconSpark+"프롬프트 설정" textarea(4000자 카운터)+비우기/취소/저장.
- [ ] **AskModal**: `/ask` 분리 대화(orb 헤더·휘발성 pill·최소화 알약·스레드·컴포저). *엔진=M4*.

### F12 — 모달 군 2 (ImageViewer·온보딩·게이트·로그인) ⬜
- [ ] **ImageViewer 라이트박스**: 오버레이(파일명·카운터·기본앱열기·닫기) + 다중(좌우 chevron·썸네일 필름스트립) + 클릭 줌 토글. (현재는 중앙 pane 인라인뿐.)
- [ ] **WhatsNew 스플래시**: 6슬라이드 온보딩 데크(배경 비디오·칩 네비·CTA). 첫 설치 1회.
- [ ] **UpdateNotes**: 메탈 그라디언트 "WHAT'S NEW"+키워드 마퀴+번호 리스트.
- [ ] **EngineGate** + **AppUpdateGate**: 설치/업데이트 진행 카드(스피너/체크/경고·로그·상태바). *실동작=M5*.
- [ ] **Profile/로그인 온보딩**: 2분할(브랜드 패널 / 닉네임+아바타 색 12종 그리드+입장하기). *진입 게이트=후속 결정.*

### F13 — 멀티에이전트 워크스페이스 ⬜
- [ ] **MultiWorkspace 그리드**: 2~6 패널(헤더 숫자 탭, 그리드 열 변동) + 패널(슬롯번호·상태·제목·pill 타이머·폴더·프롬프트·컨텍스트 링·스레드·"크게 보기"·RunPickers·PanelComposer) + 일괄 폴더 + 확장 모달. *동시 실행=M4.*

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
