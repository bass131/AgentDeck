# UI.md — AgentDeck 디자인 시스템 + 셸 (현재 구현 실측 기준)

> *어떻게 보여야 하는지*의 **단일 진실원**. 하네스 프레임워크 Layer 1.
> 이 문서는 **실제 `02.Source/renderer` 코드를 실측**해서 작성됐다(2026-06-26). 추측·타깃이 아니라 *현재 상태*.
> 옛 `UI_GUIDE.md`(원칙)·`UI_FIDELITY.md`(OKLCH 충실도 타깃)를 supersede한다 — 둘은 실제 구현보다 드리프트됨(OKLCH→HEX Clay, 12px→11px, 모노크롬 다크→클레이 다크). 히스토리는 `00.Documents/archive/`.
> 권위 소스(값이 충돌하면 코드가 이김): `02.Source/renderer/src/theme/tokens.css`, `02.Source/renderer/src/layout/Shell.tsx`+`shell.css`, `02.Source/renderer/src/lib/theme.ts`.

## 0. 디자인 원칙

1. **Clay 에디토리얼 테마** — 따뜻한 Claude 클레이/크림 페이퍼 룩. 원본 AgentCodeGUI 충실도(ADR-014)에서 출발했으나 디자인트랙 A2에서 *따뜻한 HEX 팔레트 + serif 에디토리얼*로 확정됨. radius·소프트 섀도우·둥근 카드 셸은 유지.
2. **IDE-grade 밀도** — 정보 밀도 우선, 여백 과다 금지. 본문 13px, 줄높이 1.5. 개발자 도구는 화려함보다 한눈에 보이는 상태.
3. **색은 토큰에서만** — 인라인 색상(hex/rgb 리터럴) 금지. 전부 `tokens.css`의 CSS 변수. 테마 전환이 자동 추종하려면 이 규칙이 필수.
4. **듀얼테마, 기본 dark** — light/dark 둘 다 지원하되 **기본값은 dark**(원본은 light 기본 — 의도적 차이). 기능색(추가/삭제/실행중/에러)은 상태 전달 전용.

## 1. 디자인 시스템 — 토큰 (`theme/tokens.css`)

색은 **HEX**다(OKLCH 아님 — 옛 문서 정정). 라이트가 기본 `:root`, 다크는 `:root[data-theme="dark"]`에서 재선언. `var()` 별칭은 한 곳 선언으로 테마를 자동 추종.

### 표면(elevation) — 따뜻한 크림/페이퍼
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--desktop` | `#EFE7D6` | `#1A1917` | 카드 바깥 데스크톱(참조용 — body는 투명) |
| `--bg` (=`--paper`) | `#FBF8F1` | `#242322` | 메인 카드/패널 |
| `--surface`(+1~+3) | `#F4EFE4 → #E8DFCD` | `#2C2B2A → #3D3B38` | elevation 단계 |
| `--inset` | `#F6F1E7` | `#1E1D1B` | 입력/코드 배경(리세스) |

### 경계선 / 텍스트
- `--line` / `--line-2` / `--line-strong`: 라이트 `#E6DDCB·#DDD3C0·#CFC3A9`, 다크 `#38352F·#45413A·#565049`.
- 텍스트 4단계 강조 `--text`→`--text-4`: 라이트 `#2A2620·#6B6358·#8C8473·#A9A192`, 다크 `#ECE8E1·#B1ABA2·#8B857C·#6E6960`. (`--muted`=`--text-3`)

### 강조색 — 클레이(Claude clay)
- `--accent`: 라이트 `#D97757`, 다크 `#E08763`(다크 대비용 밝은 클레이). `--accent-2`·`--accent-soft`·`--accent-line`.
- `--on-accent`: 라이트 `#FFFFFF`, **다크 `#2A2620`**(다크모드에서 클레이 위 텍스트는 어두운색 — 대비 ↑).
- 시맨틱 별칭 `--clay`/`--clay-2`/… = accent 추종.

### 기능색 (warm-harmonized)
`--green #5E9968`(세이지, diff add/ok) · `--red #C25B4A`(벽돌, diff del/error) · `--blue/--cyan #5E94BC`(더스티 블루) · `--yellow #C99A2E`(앰버, warn) · `--running #5E94BC`(작업중) · `--violet #B07FA8` · `--teal #4F9E94` · `--rose #C2724E` · `--gold #C98A3C`(Fable 5 도트 + REPL 상태 표시등, LR3-06 — `--gold-soft`/`--gold-line` 배경·테두리 짝 동반, 글로우 금지·틴트만). 각 `*-soft`/`*-gut`(diff 거터) 변형. 다크는 밝은 변형.
- `--ultracode`: 라이트 `#7C3AED`, 다크 `#A78BFA` — UltraCode 전용 강렬한 보라(글로우/모션으로 특별, 양 테마 일관).
  - **컴포저 키워드 하이라이트(UC1 P05, ADR-032)**: 컴포저에 "ultracode"/"/workflows" 입력 시 해당 글자에 흐르는 보라 그라데이션(`.orch-kw`, Composer.css). 새 HEX 발명 0 — `oklch(from var(--ultracode) …)` 파생 4-stop linear-gradient + `background-clip:text`, keyframes는 토글 pill의 기존 `ultracode-flow` 재사용. 테마 추종은 토큰 자동(`--ultracode`가 테마별 선언). `prefers-reduced-motion`: 애니·그라데이션 제거, `--ultracode` 단색 폴백.
  - **토글 OFF 뮤트 변형 + 유도 힌트(UC1 P07, ADR-032 v2)**: 토글 OFF + 키워드 감지 시 그라데이션 대신 `.orch-kw--muted` — `--text-4` 무채색 + `--ultracode` 알파(0.35) 밑줄(정적, 애니 0)로 "감지됐지만 비활성" 표시. 동시에 `.composer-orch-hint` 마이크로 힌트 1줄(`--ultracode` 솔리드 — `.orch-toggle .pick-lbl`과 동일 관례, 새 예외 0)로 명시적 사용 유도. "보이는 것 = 전송되는 것" — 키워드는 승격하지 않는다.

**`--gold` 계열 (REPL 상태 표시등, LR3-06)** — Fable 5 도트와 공유하는 기존 `--gold`에 짝 토큰(`--gold-soft`/`--gold-line`)과 형광 pulse 알파(`--gold-glow-1`/`--gold-glow-2`)를 신설. 새 HEX 발명이 아니라 accent/warn과 동일한 패밀리 완성 패턴.

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--gold` | `#C98A3C` | `#D9A24C` | Fable 5 모델 도트(기존) + REPL 상태 표시등(LR3-06 신규 용도) |
| `--gold-soft` | `#F1E2CD` | `rgba(217,162,76,0.16)` | REPL 표시등 점등 시 배경 틴트(신설) |
| `--gold-line` | `#E1BF93` | `rgba(217,162,76,0.36)` | REPL 표시등 점등 시 테두리(신설) |
| `--gold-glow-1` | `0.45` | `0.42` | 형광 pulse 저점 알파(신설) — 숫자 값(색 아님), `oklch(from var(--gold) l c h / var(--gold-glow-1))`로 소비 |
| `--gold-glow-2` | `0.85` | `0.80` | 형광 pulse 고점 알파(신설, UltraCode 코어와 동일 체급) — 라이트가 다크보다 높음(밝은 페이퍼 배경 보정) |

**후속 조정(4R~5R, 2026-07-03 — 영호 시안 `ScreenShot/버튼_개선안.png`)**: 점등 시 배경은 soft 틴트가 아니라 **`--gold` 채움**(수직 그라데이션 곡면) + **네온 림**(채움보다 밝은 테두리) + 다층 bloom halo(코어/미드/와이드)로 진화. 텍스트는 대비를 위해 다크 잉크(≈8:1). 좌측에 아이콘 칩(`.toggle-chip`, `>_` 터미널 아이콘) — UltraCode(`</>` 칩·어두운 보라 유리·라벤더 텍스트)와 대칭의 "네온 pill" 공통 문법. `--gold-soft`/`--gold-line`은 stopped 배너 등 다른 gold 계열 표면에서 계속 사용. 라이트=페이퍼 위 플랫 블렌드 HEX, 다크=반투명 rgba 오버레이(accent-soft/warn-soft 관례 준수).

### 신택스(코드 하이라이트)
`--syn-kw/str/num/fn/type/punct/com` — highlight.js 토큰에 매핑. 기능색과 하모니.

### 타이포
- `--font-serif`: **Newsreader**, 'Noto Serif KR', Georgia… (에디토리얼 강조)
- `--font-sans`: **Wanted Sans Variable**, system-ui…
- `--font-mono`: **JetBrains Mono**, … (코드/diff)

### 형태 + 입체(depth)
- `--radius: 11px`.
- 그림자: `--shadow-win`(큰 소프트 워암 섀도우, 카드 외곽), `--shadow-sm/md/lg`, `--shadow`. Clay 입체 = 레이어드 그림자 + 상단 베벨 하이라이트(`--bevel`) + 리세스(`--recess`). `--hover-ring`.

### 패널 덱 6색 (멀티에이전트 슬롯)
`--deck-0`~`--deck-5` + `*-soft`: 클레이·앰버·더스티블루·세이지·모브·테라코타. 멀티 워크스페이스 패널별 색 구분.

### 모션
`--ease-out: cubic-bezier(0.2,0.8,0.2,1)` · `--motion-fast .13s` / `--motion .18s` / `--motion-slow .22s`. 과한 애니메이션 금지(기능적인 것만).

### 레이아웃(셸 골격)
`--titlebar-h: 40px` · `--statusbar-h: 26px` · `--sidebar-w: 248px` · `--explorer-w: 236px` · `--agent-w: 392px`(드래그 리사이즈, localStorage 복원) · `--rail-w: 30px`(접힘 폭).

## 2. 셸 골격 (`layout/Shell.tsx` + `shell.css`)

```
body (투명 — frameless, .win 카드 바깥으로 OS 데스크톱 투과)
└ <div class="win"[.max]>              // 16px inset 둥근 카드, shadow-win. .max → 가득 채움
   ├ <TitleBar/>                       // h:40  'AgentDeck' 상시(+폴더명) / 드래그(IPC) / min·max·close
   ├ <div class="win-body">            // flex row — 4컬럼
   │  ├ ① <Sidebar/>                   // w:248 채팅목록·검색·새채팅·프로필 / 접힘 → .col-rail(30)
   │  ├ ② <aside class="pane explorer"> // w:236 FileExplorer(single 모드만) / 접힘 → rail(30)
   │  ├ ③ <main class="pane chat">      // flex:1 — RecentFiles 탭바 + Conversation
   │  │     (multi 모드면 ②③④ 대신 <MultiWorkspace/>, 사이드바는 유지)
   │  └ ④ <SubAgentSplitView/>          // 우측 도크(single만, GAP1 P14) — 내부에서
   │        <PaneSplitter/> + <aside class="pane agent"> 렌더.
   │        평시 = w:392(--agent-w 드래그) AgentPanel(종전 동일 DOM) /
   │        SubAgent 발생 시 = .sag-split(--split-w, 폴백 640px·65vw 클램프) 스플릿 그리드
   └ <footer class="statusbar">         // h:26  ● 준비됨/실행 중 · 변경 N · main(브랜치)
<ResizeHandles/>(모서리, maximized 아닐 때) + 모달들(아래)
```

- **워크스페이스 모드**: `single`(4컬럼) ↔ `multi`(MultiWorkspace가 탐색기+대화+에이전트 대체, 사이드바 유지). store `workspaceMode`, prefs 영속.
- **접힘**: 사이드바·탐색기는 rail(30px)로 접힘. `--agent-w`는 드래그 리사이즈 + localStorage 복원.
- **우측 도크 분기(GAP1 P14, `components/05_agent/SubAgentSplitView.tsx`)**: `state.subagents`에 표시 대상(running/queued)이 생기면 우측이 **SubAgent 스플릿 그리드**로 전환. 배정 정책은 `lib/splitView.ts` 순수 함수(시간 주입, 계약 테스트 잠금) — 최대 2컬럼×컬럼당 3행(동시 6, 채움 = 컬럼1 위→아래 먼저), 초과분 FIFO **대기열 탭 스트립**(표시 전용 — 수동 승격 없음), 완료 창은 4초(`CLOSE_LINGER_MS`) 린저 후 자동 닫힘→대기열 승격, 스트림 활동 셀은 `rowWeights`→flex-grow(활성 2:1) **자동 확대**(CSS transition으로 완화). 셀 = `SubAgentCell`(헤더 dot·이름·상태 pill + 창별 활성/비활성 토글, 본문 freeze) + tail-follow 자동 스크롤(위로 스크롤 시 해제). 헤더 스트립 토글로 **상태 패널(AgentPanel) ↔ 분할 그리드** 전환. 그리드 폭은 `--split-w`(localStorage `splitW`) PaneSplitter 드래그 — 셀 0이면 기존 AgentPanel DOM 그대로(무회귀).
- **진입 게이트**: `App → AppGate`(getProfile IPC 부트 → 온보딩 또는 Shell 직행).

### 모달/오버레이 (Shell이 소유, fixed 레이어)
FileModal · SettingsModal · GitModal · AskModal · ImageViewer(라이트박스) · WhatsNew(온보딩) · UpdateNotes · EngineUpdateNotice · AppUpdateGate · Profile · QuestionModal. 부트 자동 트리거: 첫 실행 WhatsNew / 마이너 업데이트 UpdateNotes / 엔진 새 버전 알림(seen-key 도장으로 1회).
> **권한 요청은 모달이 아니다(ADR-030, BF3-06)** — 옛 PermissionModal(원본 미러 중앙 오버레이)은 삭제. 권한 요청은 컴포저 바로 위 **인라인 `PermissionCard`**(`components/07_notice/`)로 렌더 — 원본 AgentCodeGUI 대비 의도적 이탈(사유: 권한 대기 중 ■ 중단 접근·대화 맥락 보존·멀티패널 배선. ADR-030에 명문화). `.q-overlay` 계열 공유 CSS는 QuestionModal 전용으로 잔존.

### 전역 단축키 (`useGlobalShortcuts`)
Ctrl+N 새 채팅 · Ctrl+O 폴더 열기 · Esc 실행 중단(모달 열림·multi 모드면 스킵) · Shift+Tab 피커 모드 순환 · Ctrl+사이드바 토글.

## 3. 영역별 컴포넌트 (`components/`)

- **TitleBar** — 브랜드 + 윈도우 컨트롤(close hover=red). 드래그=IPC, 더블클릭=maximize.
- **Sidebar** — 채팅목록(active=좌측 accent bar) · 새채팅(⌘N) · 검색 · 단일/멀티 토글 · 프로필 풋.
- **FileExplorer** — 메인 작업 폴더(Ctrl O)·폴더추가(Ctrl F) · 파일검색 · lazy 트리(펼침 prefs) · 변경 색(edit/new) · 파일타입 컬러 배지(`lib/fileType`·`icons.tsx`).
- **Conversation** — 메시지(아바타+name+time+Markdown) · 툴그룹 카드(`ToolGroup`·`ToolCallCard`, verb→target→result, 접이식) · `OrchestrationCard`/`SubAgentInline`(워크플로 라이브) · `CmdResultCard` · 스트리밍(`SmoothMarkdown`).
- **Composer** — textarea + 하단 바(모델 피커·effort 피커·모드 피커·이미지 첨부·send/stop) + 슬래시 메뉴·큐·이미지 트레이. 컨텍스트 게이지(`ContextStrip`, 실 usage 연결).
- **AgentPanel** (w392) — status pill(idle/working/done/error) · 할 일(progress) · 서브에이전트 카드 · 변경 파일(+add/−del, new/edit 태그).
- **뷰어** — `CodeViewer`(CodeMirror 6 + 줄번호/폴드/검색 + LSP 시맨틱색 + Ctrl+wheel 줌) · `MarkdownView`(react-markdown + remark-gfm + rehype-highlight) · `ImageViewer`(라이트박스).
- **LoopIndicator/LoopRunningIndicator** — 앱 레벨 `/loop` 진행 표시.
- **컴포저 위 배너 슬롯**(`07_notice/`) — Conversation·PanelView의 컴포저 바로 위 한 자리 패턴: `LoopStatusBanner`(sdk>goal>stopped 단일 배너) + `PermissionCard`(권한 요청 인라인 카드, ADR-030 — 허용/항상 허용/거부 3버튼 + 숫자키 1·2·3·Esc, 카드 컨테이너 스코프 키보드. 권한 대기 중 WorkingIndicator 억제·■ 중단 상시 노출). 멀티패널도 패널별 동일 마운트.
- **HookTimeline**(`07_notice/HookTimeline.tsx`, GAP1 P05) — 훅 생명주기 타임라인. 컴포저 위 배너 슬롯과 동일 위치(단일챗·멀티패널 양쪽 마운트). 소음 억제로 **기본 접힘**(요약 배지 한 줄: "훅 N건" + 실행중/오류 카운트), 펼침 시 개별 훅 행(이름·이벤트·상태·exit code). 소스는 store `hookRuns`(reducer/cockpit.ts `handleHookLifecycle`)를 부모가 셀렉터 구독해 prop으로 — 순수 prop 렌더. hookRuns 비면 null(빈 껍데기 0).
- **PermissionCard plan 승인 변형**(GAP1 P07) — `pending.planReview`(ExitPlanMode) 존재 시 기존 PermissionCard가 확장 렌더(신규 모달 발명 0): 계획 본문 마크다운 + `planFilePath` 표기 + 버튼셋을 PLAN_CHOICES(실행 승인/계속 계획)로 전환. planReview 없는 대다수 도구는 기존 3버튼 그대로(회귀 0).
- **확장 사고 블록**(GAP1 P06) — `thinking_delta` 라이브 증분·redacted 구간 `estimatedTokens`(러닝 토탈)를 열린 thinking 아이템에 반영하고, `thinking` 전문 도착 시 확정(replace, 권위). reducer/text.ts — 표시 전용, 순수 함수.
- **턴 신뢰성 배너/마커**(GAP1 P04, reducer/reliability.ts) — `api_retry`→LoopStatusBanner 재시도 변형(attempt/maxRetries 표시, 산출물 도착 시 clear) · `compact`(status)→'compacting' 한정 압축 중 배너 · `compact`(boundary)→Conversation thread 인라인 `compact-boundary` 마커 · `session_state`→`sdkSessionState` 권위 필드(옵트인 env 세션만).
- **MCP verb 라벨**(GAP1 P01c·P02, `lib/toolKind.ts`) — `mcp__server__tool` 원시 이름을 `mcpToolLabel`이 '서버 · 도구' 사람읽기 라벨로 변환해 ToolCallCard verb에 표시(패턴 불일치 시 원본 폴백). P02(a)로 신형 SDK 도구 10종 매핑 + `'git'` kind(Worktree, `--teal`) 신설 — 'other' 폴백 해소.
- **SearchResultView**(`01_conversation/SearchResultView.tsx`, GAP1 P08) — `search_result` 이벤트(어댑터가 top-level tool_use_result를 정규화)만 소비하는 구조화 검색 결과 렌더(raw 텍스트 파싱 0). 4모드: content=파일 그룹 헤더+라인번호 매치 행 · files_with_matches/count/glob=파일 목록 행(+total·잘림 표기). 행 클릭→store `openFile`(IPC 경유)로 기존 FileModal/CodeViewer 점프. ToolCallCard 펼침에 부착 — 렌더 가능한 matches/files 없으면 기존 raw `<pre>` 폴백 그대로(렌더 깨짐 0).
- **BackgroundTaskView + 배경 셸 배지**(`01_conversation/BackgroundTaskView.tsx`, GAP1 P09) — ToolCallCard가 `background=true` 카드 행에 pill 배지(`.t-bg-badge`, cron-badge pill 관례 축소판) 상시 표시, `bgTask` 부착 시 클릭/펼침 없이 라이브 tail 뷰 상시 렌더(모노스페이스·max-height 260px·새 조각 자동 하단 스크롤·상한 절단 안내). 정지 버튼은 실행 중에만 — `window.api.agentTaskStop` IPC, 결과는 bg_task notification(status 'stopped')으로 회수돼 버튼 자연 소멸(단방향).

## 4. 테마 전환 (`lib/theme.ts`)
- `applyTheme(theme)` = `document.documentElement.setAttribute('data-theme', theme)` 한 줄 → tokens.css가 전 토큰 재선언으로 즉시 전환.
- 영속: `localStorage['agentdeck.theme']`. 기본값 `dark`. `applyTheme()`는 첫 페인트 전(main.tsx)에 호출 — 다크 사용자에게 라이트 카드 깜빡임 방지.

## 5. AI 슬롭 안티패턴
> 원칙: **원본/우리 테마가 *쓰는* 건 슬롭이 아니다.** 임의 장식만 금지.
- ✅ 허용(테마 사용): radius 11px · 소프트 워암 섀도우 · Clay 입체(베벨/리세스) · 모달 backdrop blur(절제) · serif 에디토리얼 강조.
- ❌ 보라색/무지개 **그라데이션 텍스트**(단, UltraCode 전용 보라 글로우는 의도된 예외 — **컴포저 UltraCode 키워드 하이라이트(`.orch-kw`) 포함**, UC1 P05·ADR-032 waiver).
- ❌ **네온 글로우**(소프트 섀도우 ≠ 네온). 단, **REPL·UltraCode 토글 pill + 컴포저 UltraCode 키워드 하이라이트 한정 네온/글로우/그라데이션 텍스트는 명시적 예외**(pill: 영호 승인 2026-07-03, 시안 `ScreenShot/버튼_개선안.png` / 키워드 하이라이트: ADR-032, UC1 P05) — 기능 활성 표시등으로, 새 색 발명 없이 기존 `--gold`/`--ultracode` 알파·oklch 파생(형광 pulse·bloom halo·flow 그라데이션)만 쓴다.
- ❌ 이모지를 *기능* 아이콘으로 — 벡터 아이콘(`icons.tsx`).
- ❌ 과한 애니메이션(≤ `--motion-slow`, 기능적인 것만).
- ❌ 중앙 정렬 히어로/랜딩페이지풍(이건 IDE다).
- ❌ **인라인 색상 리터럴** — 토큰만.

## 6. 접근성
- 명도대비 WCAG AA(본문 4.5:1).
- 전 기능 키보드 접근(탐색기 ↑↓, 입력창 히스토리, 단축키). 포커스 링은 `:focus-visible`만(`--accent-line`, 마우스 클릭엔 안 뜸).
- 읽기 콘텐츠(`.content`/`.markdown-view`/툴 결과)는 `user-select: text`로 복사 가능(앱 셸은 `user-select:none`).
