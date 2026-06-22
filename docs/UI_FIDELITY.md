# UI_FIDELITY — AgentCodeGUI 1:1 시각/구조 충실도 타깃

> 목적: Track 1(완전 복제)의 **시각·구조 충실도**를 AgentCodeGUI 실제 소스에 맞추기 위한 타깃 스펙.
> 레퍼런스 원본: **`C:/Dev/AgentCodeGUI`** (UnrealFactory/AgentCodeGUI clone, React19/Electron42/Vite7).
> 토큰 값은 `src/renderer/src/styles.css`(3099줄)에서 추출(검증됨). **className·DOM 세부는 페이즈별로 원본 소스 대조 필수**(이 문서의 일부 구조는 매핑 시점 근사).
>
> 결정(2026-06-22 사용자): **전면 1:1 재작업** + 소스 대조 & (가능 시)live DOM 비교 둘 다. live 빌드는 안전계층 차단 → 사용자 권한 필요.
> ⚠️ 스택 업그레이드(React19/Electron42)는 **ADR 사안(사용자 단독)**. 미정 시 현 스택(React18/Electron31)에서 시각·구조만 일치시킨다.

## 1. 디자인 시스템 (최우선 — 전역 영향)

OKLCH 색공간, **라이트 기본 + `:root[data-theme="dark"]` 오버라이드**. 우리의 hex 토큰(`theme/tokens.css`)을 아래로 대체.

### 라이트 (`:root`)
```
--desktop: oklch(0.90 0.006 75)    /* 카드 바깥 데스크톱 */
--bg:      oklch(0.992 0.002 80)   /* 메인 카드/패널 */
--surface: oklch(0.972 0.004 80)   /* +1 elevation */
--surface-2: oklch(0.948 0.005 80) /* +2 */
--surface-3: oklch(0.915 0.006 80) /* +3 */
--inset:   oklch(0.978 0.003 80)   /* 입력/코드 배경 */
--line: oklch(0 0 0 /0.07)  --line-2: oklch(0 0 0 /0.11)  --line-strong: oklch(0 0 0 /0.20)
--text: oklch(0.27 0.008 60)  --text-2: 0.43  --text-3: 0.56  --text-4: 0.69  (4단계 강조)
--accent: oklch(0.61 0.16 42)      /* 따뜻한 코랄 */  --accent-2: oklch(0.55 0.17 38)
--accent-soft: accent/0.12  --accent-line: accent/0.34  --on-accent: oklch(0.99 0.01 80)
--green:0.56 0.14 158  --blue:0.55 0.13 250  --yellow:0.62 0.13 75  --red:0.58 0.20 25
--violet/teal/cyan/rose/gold ... + *-soft(/0.14) + *-gut(/0.22 diff 거터)
--font-sans: 'Wanted Sans Variable', system-ui, sans-serif
--font-mono: 'JetBrains Mono', 'Wanted Sans Variable', ui-monospace, monospace
--radius: 12px   (우리 현재 5px)
--shadow-win: 0 30px 70px -26px rgba(40,30,20,.30), 0 2px 10px rgba(40,30,20,.06), 0 0 0 1px var(--line)
--shadow-sm: 0 1px 2px rgba(40,30,20,.05)   --hover-ring: inset 0 0 0 1px var(--accent-line), var(--shadow-sm)
```

### 다크 (`:root[data-theme="dark"]`) — 뉴트럴 그래파이트(chroma 0)
```
--desktop: oklch(0.145 0 0)  --bg: oklch(0.196 0 0)  /* ~#1a1a1a, surface 단계로 깊이 표현 */
--surface: 0.228  --surface-2: 0.265  --surface-3: 0.312  --inset: 0.168
--line: oklch(1 0 0 /0.07 → 0.11 → 0.20)
--text: oklch(1 0 0 /0.92)  --text-2:/0.64  --text-3:/0.46  --text-4:/0.34
--accent: oklch(0.90 0 0)  /* 니어-화이트(모노크롬) */  --accent-2: oklch(1 0 0 /0.96)
--on-accent: oklch(0.17 0 0)   기능색은 저채도 밝은 버전
--shadow-win: 0 26px 60px -28px rgba(0,0,0,.78), 0 0 0 1px var(--line)
```

### 테마 전환 (lib/theme.ts)
`document.documentElement.setAttribute('data-theme', theme)` 한 줄로 전체 즉시 전환. prefs(`ui-prefs.json`) 저장 + `prefers-color-scheme` 폴백.

## 2. 셸 골격 (App.tsx) — 치수는 원본 styles.css로 재확인

```
<div class="win"[.max]>                      // 데스크톱 위 둥근 카드, inset:16px, radius:12, shadow-win
                                              //   .max → inset:0; radius:0; shadow:none
  <TitleBar/>                                 // h:42  브랜드 마크+타이틀 / 드래그 / min·max·close
  <div class="win-body">                      // flex row
    <Sidebar/>                                // w:248 (채팅목록/검색/새채팅/프로필) — 접힘 30
    <Explorer/>                               // w:236 (폴더·검색·lazy 트리·파일타입 컬러아이콘) — 접힘 30(rail)
    <div class="chat">                        // flex:1
      <ChatHeader/>(h:52) <RecentFiles/>(파일 탭바) <ZoomBadge/>
      <div class="chat-scroll"><div class="thread" max-width:clamp(760px,88%,1400px)>…메시지…</div></div>
      <SelectionToolbar/> <Composer/>         // 모델/effort 피커 + 첨부 + 슬래시메뉴 + 큐
    </div>
    <AgentPanel/>                             // w:392 (상태 pill / 할일+progress / 서브에이전트 / 변경파일)
  </div>
  <Modals/>(Git·File·Image·SubAgent·Question·Settings·Ask·Prompt) <ResizeHandles/>(모서리 16px)
```

리사이즈: 패널 접힘(248↔30, 236↔30), `useMaximized`, ResizeHandles 모서리 드래그. 채팅 본문은 가변폭(clamp), 컴포저는 고정폭 760.

## 3. 영역별 핵심 (원본 컴포넌트)
- **TitleBar** 브랜드 마크(정사각 badge, 모노 첫글자)+윈도우컨트롤(close hover=red). 드래그=IPC, 더블클릭=max.
- **Sidebar** 채팅목록(.sb-item active=좌측 3px accent bar, dot pulse), 새채팅(⌘N), 검색, 우클릭 컨텍스트(rename/delete), 프로필 풋.
- **Explorer** 폴더리스트(MAIN 칩 + 레퍼런스 + 폴더추가), 파일검색, lazy 트리(펼침 prefs 저장), 변경 색(edit=yellow/new=green), 파일타입 컬러 아이콘(fileType/icons).
- **Chat** 메시지(아바타+name+time+Markdown), 툴그룹(.t-row read/write/bash/web/…, verb→target→result), Bash 접이식 로그, 코드블록(head: fn+lang). **Composer**: suggest 칩 / slash-menu / img-tray / 큐(sched) / textarea / bar(모델·effort·mode 피커 + 첨부 + send/stop).
- **AgentPanel** status pill(idle/working/done/error, dot pulse) / 할일(progress bar+체크) / 서브에이전트 카드 / 변경파일(+add/−del, new/edit 태그, hover tooltip).
- **CmEditor** CodeMirror + 줄번호/폴드/검색 + LSP 시맨틱색(sem-*) + diff 마킹 + Ctrl+wheel 줌(--z).
- **Markdown** hljs 코드 + 표(헤더 surface bg) + 인용/리스트/inline code, HTML sanitize.
- **ImageViewer** 오버레이 라이트박스(idx, prev/next). **RecentFiles** 파일 탭 칩(드래그 정렬).

## 4. 우리 대비 격차 TOP (충실도 임팩트 순)
1. 토큰 시스템: hex→**OKLCH 60+ 변수, 라이트/다크 듀얼** (전역)
2. **라이트 테마 전무** → 추가
3. 셸: 평면 풀윈도우 → **데스크톱 위 둥근 카드(radius12)+소프트섀도우+ResizeHandles**
4. 좌측: 탐색기만 → **사이드바(채팅목록)+탐색기 분리, 접힘 rail, 파일타입 컬러아이콘, 검색**
5. 중앙: 기본입력 → **리치 컴포저(모델/effort 피커·첨부·슬래시·큐) + 파일 탭바 + 리치 툴카드(아바타/타임스탬프)**
6. 우측: 플레이스홀더 → **할일+progress / 서브에이전트 카드 / 변경파일(+/−, 태그)**
7. 텍스트 4단계 강조, 8. 커스텀 얇은 스크롤바, 9. 모달 blur backdrop, 10. LSP 시맨틱 색(M2-LSP)

> 격차의 상당수(서브에이전트·Git·설정·모달·멀티에이전트·LSP)는 **로드맵상 M3/M4/M5 기능** — 충실도 트랙과 기능 로드맵이 병합된다. **공통 토대(디자인시스템+셸)부터** 잡으면 이후 모든 기능이 올바른 비주얼로 올라온다.

## 5. 구현 순서(제안 페이즈)
- **F1 디자인시스템+셸**: OKLCH 듀얼테마 토큰 + 라이트테마 + 둥근카드/섀도우/radius/스크롤바 + 셸 레이아웃(rail·접힘). (renderer, ADR 무관)
- **F2 사이드바+탐색기**: 채팅목록 사이드바 + 탐색기 개편(파일타입 아이콘·검색·접힘).
- **F3 대화+컴포저+툴카드**: 리치 메시지/툴카드 + 컴포저(피커·첨부·슬래시) + 파일 탭바.
- **F4 우측 에이전트 패널**: 할일/서브에이전트/변경파일.
- **F5 뷰어/모달 정합**: 코드/마크다운/이미지 + 모달 blur.
- **F6 라이트/다크 토글 + 폴리시**.

각 페이즈: 원본 `C:/Dev/AgentCodeGUI` 해당 컴포넌트 className/CSS 정밀 대조 → 우리 구조로 이식 → 스크린샷 시각검증(visual-viewer e2e) → reviewer.

## 6. 라이브 관찰 (2026-06-22, 원본 직접 구동 — `artifacts/acg/*.png`)

원본을 빌드·구동(Playwright)해 실제 렌더를 확인했다(로그인 통과 → 워크스페이스 자동로드). F3~F6 *실제* 타깃:

### 로그인/온보딩 (앱 진입 게이트 — 우리 미구현, 후속 검토)
- 풀윈도우 2분할: 좌=브랜드 마크(`<>` badge)+히어로 카피+기능 4줄, 우=프로필("다시 오셨네요" / 닉네임 입력 / **아바타 색 12종 그리드** / "입장하기 →"). `.lg-*` 클래스. → 우리는 셸 직행(프로필=후속).

### F3 — 대화/컴포저 (중앙) ★최우선 체감
- **빈 채팅 상태**: 중앙 asterisk 로고 + "무엇을 도와드릴까요, {닉}님?" + 부제 + **추천 칩 2×2**(아이콘+텍스트: 구조설명/버그수정/성능개선/테스트작성).
- **컨텍스트 게이지 3종**(컴포저 위, pill): 현재 컨텍스트 `0/1M 토큰`(원형%) · 5시간 한도(원형%+리셋시각) · 주간 한도(원형%+리셋).
- **리치 컴포저**: textarea("오늘 어떤 도움을 드릴까요?") + 하단 바 = [이미지 첨부 아이콘] · **모델 피커**(Opus 4.8 ▾) · **Effort 피커**(매우 높음 ▾) · **모드 피커**(자동 ▾) · 우측 **send(↑)**. 슬래시/큐/첨부 트레이는 입력 시.
- **메시지(대화 시)**: 아바타+name+time+Markdown, 툴그룹 카드(verb→target→result). (빈 상태라 라이브 미확인 — 소스 Chat.tsx 대조.)

### F4 — 에이전트 패널 (우측 w392)
- 헤더 "에이전트" + **상태 pill `● 대기 중`**(우상단). 섹션 3: **할 일 `0/0`**("아직 할 일이 없어요") · **서브에이전트 `0/0`** · **변경된 파일 `0`**. 각 섹션 헤더+카운트+빈 메시지.

### F5 — 모달/뷰어
- **설정 모달**: 중앙 카드 + backdrop 딤, "설정" 타이틀+X, **좌측 nav**(Claude Code/MCP/Skill/Code/Theme 아이콘+라벨) + 우측 콘텐츠(엔진 버전 셀렉터 등). radius·소프트.
- **WHAT'S NEW(업데이트 노트)**: 풀스크린 스플래시 — 큰 그라데이션 "WHAT'S NEW" + 버전 + 마퀴(코드에디터·심볼분석·C#·ROSLYN…) + 넘버링 섹션(01/02…) 스크롤. (앱 시작 시 1회.)

### 셸/사이드바/탐색기 (F1·F2 — 라이브로 우리 구현 정합 확인됨)
- 사이드바: 브랜드(AgentCodeGUI/Coding Agent·버전) + **단일/멀티 에이전트 토글**(`.sb-mode`) + 새 채팅(Ctrl N) + 채팅 검색 + 최근채팅("아직 채팅이 없어요") + 프로필 풋(Y/YYH). ⟶ 우리 F2 사이드바와 구조 유사(멀티에이전트 토글=M4).
- 탐색기: "탐색기"+git아이콘+접기 / **메인 작업 폴더**(Ctrl O)+폴더추가(Ctrl F) / 파일검색(Ctrl F) / 트리(폴더 chevron+아이콘, 파일 **타입 컬러 배지** TS/JS/GIT/MD/{}). ⟶ 우리 F2 탐색기 정합 확인.
- 에이전트 패널 우측, 4컬럼 = 사이드바|탐색기|대화|에이전트. ⟶ 우리 F1-b 셸 정합 확인.

> 스크린샷: `artifacts/acg/{01-initial,02-main(whatsnew),03-shell,04-settings,c-sidebar/explorer/chat/agent}.png`. 재구동: `node artifacts/explore-acg.cjs`(원본 빌드 필요 시 `cd C:/Dev/AgentCodeGUI && npm run build`).
