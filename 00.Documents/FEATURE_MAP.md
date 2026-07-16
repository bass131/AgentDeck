# FEATURE_MAP — AgentCodeGUI 완전 복제 추적

> 목표: AgentCodeGUI의 **모든 기능을 1:1 복제(Track 1)**한 뒤 우리 스타일(Track 2). 상태: ⬜ 미착수 / 🚧 진행 / ✅ 완료.
>
> **Track 1 — 완전 복제 (Claude Code 전용)**: M1 핵심루프 → M2 코드인텔리전스 → M3 Git → M4 멀티에이전트·대화고도화 → M5 배포. **M5 끝 = 완전 복제 달성.**
> **Track 2 — 우리 스타일 (복제 이후)**: M6 Codex 듀얼백엔드 → M7+ 우리 확장.
>
> **로드맵 게이트(영호 2026-07-13)**: M5 배포 앞에 **GAP1 코어 패리티 게이트** 삽입 — 배포 게이트 = "AgentDeck 안에서 AgentDeck 개발 가능"(Claude Code CLI 대비 코어 작업 루프 동등). 근거 = `reports/GAP1-Claude-Code-기능격차-감사.html`. (AgentCodeGUI 패리티와 축이 다른 Claude Code 벤치마크 — 추적성 기록, 기존 결정 뒤집기 아님)

## A. 엔진 (Claude Code 단일 — Track 1)

| # | 기능 (AgentCodeGUI) | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| A1 | 로컬 엔진 설치/버전 관리 | ⬜ | M5 | Claude Code 탐지·버전(설정 탭 실동작) |
| A2 | Claude Code 엔진 실행(스트리밍·도구·abort) | ✅ | M1·Phase21 | ClaudeCodeBackend — **@anthropic-ai/claude-agent-sdk `query()`**(ADR-016, Phase 21 ✅; CLI spawn 폐기). 구독 인증·실 contextWindow |
| A4 | (내부) 공통 AgentEvent 정규화 | ✅ | M1 | 얇은 이음 — 사용자 비노출 |

## B. 대화 & 멀티에이전트 (Track 1)

| # | 기능 | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| B1 | 대화 패널 + 스트리밍 | ✅ | M1 | |
| B2 | 도구호출 카드(역할·도구·결과) | ✅ | M1 | 접이식 |
| B5 | 대화/변경/diff/draft 영속화 | ✅ | M1 | JSON 파일(fan-out) · 단일채팅 sessionId 저장(fa9df22)+재시작 resume 회상 라이브 확정(LR1, ADR-029 (a)/(b)) |
| B3 | 멀티에이전트 동시 실행 + 큐 | ✅ | M4-2(큐)/M4-3(동시) | 6패널 독립 usePanelSession(runId 라우팅 격리, Phase 23) — 2패널 동시 독립 실행 라이브 검증 ✅. 큐=B10. 멀티 세션 영속은 후속 |
| B11 | 세션 CRUD(이름변경/삭제/전환) | ✅ | M4-3 | JSON delete/rename(custom_title 보존) + 사이드바 실 목록·select/rename/delete/new(Phase 23b/23c) |
| B4 | 서브에이전트 검사 카드 | ✅ | M4-4 | claude-stream Task/Agent→subagent(running)·parent_tool_use_id→tool_call.parentToolId·tool_result로 done. AgentPanel/SubAgentModal 실배선(Phase 24b) |
| B6 | 슬래시 커맨드(/init /compact /review /ask /security-review) | ✅ | M4-2 | `/clear`·`/ask` 클라이언트 인터셉트, 나머지 raw 전송→SDK 네이티브 실행(Phase 22a). @mention 팔레트·노트 합성(22b) 포함 |
| B7 | 이미지 첨부(붙여넣기/드래그/파일) | ✅ | M4-2 | drop/paste/picker→경로(pathForFile/saveImageData temp)→이미지 노트→에이전트 Read. 비전 인지 라이브 검증 ✅(Phase 22c) |
| B8 | 컨텍스트 토큰 게이지/사용량 분석 | ✅ | M4-1·Phase21(게이지)/Phase26(분석) | 게이지=gaugeCalc(실 contextWindow). 분석=**OAuth 레이트리밋 게이지(5시간·주간)** — getUsage(`~/.claude` 토큰→api/oauth/usage, TTL 5분, 토큰 main 단독·미노출) + ContextStrip 3칩. 원본엔 비용/히스토리 시스템 없음(스킵). 라이브 PASS |
| B9 | 입력창 히스토리 복구(↑↓) | ✅ | M4(Phase 25) | Composer ↑↓ 메모리 히스토리(현재 대화 user 메시지 파생·draft 보존·팔레트 우선·첫/마지막 줄 체크). 원본 Chat.tsx Composer 1:1, renderer 단독·영속 0 |
| B10 | 메시지 큐잉(실행중 추가 입력) | ✅ | M4-2 | 실행 중 Enter→큐 적재(text+이미지+picker 캡처), busy→idle 전이 시 FIFO 1건 자동 전송, abort가 큐 폐기(Phase 22d) |

## C. 코드 인텔리전스 & 파일 (Track 1)

| # | 기능 | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| C1 | 파일 탐색기 + AI-건드린 인디케이터 | ✅ | M1 | |
| C4 | diff 뷰어(삭제 시각화) | ✅ | M1 | |
| C2 | 코드 뷰어(하이라이팅 / 시맨틱 토큰) | ✅ | M2(구문)/M2-LSP(시맨틱) | CodeMirror6 읽기전용+fs.read 단일채널. 구문=M2✅. **시맨틱 토큰=LSP semanticTokens→StateField Decoration(Phase 27)** |
| C3 | 이미지 프리뷰 | ✅ | M2 | data URL `<img>`, 확장자 화이트리스트, 맞춤/실제크기 |
| C5 | LSP(호버·정의이동) | ✅ | M2-LSP(Phase 27) | typescript-language-server+pyright 번들. 02.Source/main/lsp(StdioRpc·manager rootId 게이트+resolveSafe·생명주기). CodeViewer hoverTooltip(300ms)·F12 정의이동(keymap). 실 TS LSP 라이브 PASS. 다운로드형 C#/C++=후속 |
| C6 | 레퍼런스 폴더(읽기전용) | ✅ | M2 | 등록 루트 ID 게이트(임의경로 주입 차단), 루트별 독립 resolveSafe |
| C7 | 마크다운 렌더링 | ✅ | M2 | react-markdown+remark-gfm+rehype-highlight, XSS/원격차단/CSP |
| C8 | 언어별 JetBrains 컬러 스킴 | ✅ | M2 | Darcula(JetBrains) CodeMirror 테마 + hljs 팔레트 매핑 |

## D. Git 통합 (Track 1)

| # | 기능 | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| D4 | 변경 파일 표시(diff 연동) | ✅ | M1/M3 | C4와 연결. M3에서 fs.diff HEAD 스냅샷 버그 수정(빈기준→모두add) |
| D1 | 비주얼 히스토리(3컬럼 fork UI) | ✅ | M3 | GitModal 실데이터(git.ts execFile·status/log/commitDetail/fileAt) — 원본 3컬럼 1:1 |
| D2 | 브랜치/태그 관리 | ✅ | M3 | 읽기 전용 리스트(status에 branches/remotes/tags) — 원본 충실(checkout/create는 원본에도 없음=범위 외) |
| D3 | AI 커밋 메시지 생성 | ✅ | M3 | 활성 에이전트 위임(onAskClaude→컴포저 주입, 원본 동일 패턴) |

## E. 배포 & 플랫폼 (Track 1)

| # | 기능 | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| E4 | 다크/라이트 테마 | 🚧 | M1(다크)/M5(라이트) | |
| E1 | NSIS 설치 패키징(Setup exe) | ⬜ | M5 | electron-builder |
| E2 | electron-updater 자동 업데이트 | ⬜ | M5 | GitHub Releases |
| E3 | Windows 컨텍스트 메뉴 통합 | ⬜ | M5 | |
| E5 | 코드 서명 | ⬜ | 보류 | 비용, ADR-009 |

→ **(목표 조건) A·B·C·D·E가 *모두* ✅가 되면 Track 1 완전 복제 달성.** 현재 미달 — M1·M2·M3 ✅ + M4-1 ✅ + **M4-2 ✅(B6·B7·B10)** + **M4-3 ✅(B3 동시실행·B11 세션 CRUD)** + **M4-4 ✅(B4 서브에이전트 카드·thinking/todo·권한/질문 양방향)** + **B9 ✅(입력 히스토리 ↑↓)** + **B8 ✅(OAuth 레이트리밋 게이지)** + **M2-LSP ✅(C5 호버/정의이동·C2 시맨틱 토큰)**, 잔여: **A1·E1~E3 ⬜, E4 🚧 = 전부 M5(배포)**. → **GAP1 코어 패리티 게이트 진행 중(아래 GAP1 표) → 통과 후 M5(배포)**. (시각 토대 F1~F15 ✅=00.Documents/archive/REPLICA_GAP.md; **시각 ✅ ≠ 기능 완료**.)

## ⛳ GAP1 — 코어 패리티 게이트 (M5 배포 전 삽입, 영호 2026-07-13)

> AgentCodeGUI 패리티(A~E)와 축이 다른 **Claude Code CLI 벤치마크** — 배포 게이트 = "AgentDeck 안에서 AgentDeck 개발 가능". Phase 정의 = `01.Phases/17_GAP1-core-parity/`, 근거 = `reports/GAP1-Claude-Code-기능격차-감사.html`. (상태 5차 갱신 2026-07-15 — **구현 16/16 완료**(P13~P15 확장분[영호 확장 2026-07-14] + P16 턴 연속성·훅 배지[마감 후 편입 — 영호 육안 피드백 2026-07-15] 포함))

| Phase | 내용 | 상태 |
|---|---|---|
| P01 | quick win 렌더 재사용 3건(MCP verb 라벨 포함) | ✅ |
| P02 | toolKind 신형 도구 10종·TaskStop 재분류·모델 영속 | ✅ |
| P03 | AgentEvent 계약 일괄 정의(신규 9종, ADR-035) | ✅ |
| P04 | 턴 신뢰성 신호 배선(api_retry·compact·session_state 권위) | ✅ |
| P10 | turn-id 상관자 — misfire 부재 실측·봉쇄 회귀 잠금(turnId 철회) | ✅ |
| P05 | 훅 콕핏(hook_lifecycle → HookTimeline) | ✅ |
| P06 | 확장 사고 전문 표시(thinking_delta) | ✅ |
| P07 | Plan 모드 승인 UI(planReview 카드) | ✅ |
| P11 | send-token 턴 귀속 회계(자율 done 카운터 탈취 봉합) | ✅ |
| P12 | RunManager 고아 pump 종결 | ✅ |
| P08 | Grep/Glob 결과 IDE 렌더 | ✅ |
| P09 | 백그라운드 셸 라이브 테일 | ✅ |
| P13 | REPL 진행 중 세션 권한 모드 전환 실지원(모드 피커 no-op 봉합) | ✅ |
| P14 | SubAgent 스플릿 뷰(단일채팅모드 우측 분할 그리드) | ✅ |
| P15 | Playwright 라이브 버그 헌팅 루프(라운드제 배포 게이트) — 4R 수렴(연속 2라운드 신규 결함 0), 원장 = `01.Phases/17_GAP1-core-parity/15-rounds-log.md` | ✅ |
| P16 | 턴 연속성 + 훅 빨간 배지(표면 3종 — **마감 후 편입**, 영호 육안 피드백) — 사고↔답변 연속성 연출 + 훅 차단 턴 assistant 빨간 배지, shared 계약 무접촉 | ✅ |

## ➕ Track 2 — 우리 스타일 (복제 이후, AgentCodeGUI엔 없음)

| # | 기능 | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| X1 | Codex 듀얼 백엔드 실동작 | ⬜ | M6 | 얇은 이음에 어댑터 끼움 |
| A3 | 백엔드 전환 UI(대화/전역) | ⬜ | M6 | Claude ↔ Codex |
| X2 | 프로젝트에 하네스 씌우기(스캐폴드 생성) | ⬜ | M7+ | |
| X3 | 백엔드별 토큰/비용 비교 | ⬜ | M7+ | |
| X4 | UltraCode 멀티에이전트 오케스트레이션 | ✅ | — | **ADR-021**(원본 미존재 확장). Workflow+Task 서브에이전트 "둘 다" · 결과 메인 복귀(F-B) · 진행 라이브 카드(F-C) · 서브에이전트 채팅 인라인+라이브 상세(F-G/E) · 2초 제거(F-D). 2026-06-26, 단위 3417 green |
| TG1 | 사고 GUI Desktop 스타일(턴 블록 통합·한 줄 상태 라인) + 공식 pinwheel 아바타 | 🚧 | TG1 | 진행 중(2026-07-16 착수) · Track 순서 예외 근거 = 영호 확정 2026-07-15·M5 배포 전 선행(GAP1 게이트 삽입 선례) · Phase 정의 = `01.Phases/18_TG1-thinking-gui/` |

---

## 진행 요약
- **M1 (핵심 루프) ✅ 완료**: A2 · A4 · B1 · B2 · B5 · C1 · C4 · D4 · E4(다크) 전부 구현·검증(135 테스트 green) → M1 Phase 01~06.
  - 검증: 단위·통합 138 테스트 + **Playwright Electron e2e 4개(`npm run test:e2e`)** — 앱 런치·폴더열기·대화 스트리밍·도구카드·파일변경·diff 전 루프 + `agent.run→webContents.send` 결합부까지 **실제 Electron 런타임에서 자동 검증**(echo 백엔드로 결정론). "듀얼 ABI는 스크립트가 자동 관리(node↔electron)"는 **M1 당시 서술** — 이후 sqlite 제거(ADR-006 supersede)로 네이티브 의존 0, 듀얼 ABI 관리 자체가 사라짐.
  - ⚠️ 사용자 확인 권장: 실제 `claude` CLI 연결(현재 e2e는 echo 백엔드) + `npm run dev` 시각 확인. ("`npm run rebuild:native` 선행"은 **M1 당시 서술** — sqlite 제거로 해당 스크립트·선행 절차가 현재 없음.)
- **M2 (코드 인텔리전스) ✅ 완료**: C2(구문)·C3·C6·C7·C8 — CodeMirror6 코드뷰어 + `fs.read` 단일채널(text+binary) + 마크다운 렌더(react-markdown/remark-gfm/rehype-highlight, XSS·원격차단·CSP) + 이미지 프리뷰 + 레퍼런스 폴더(읽기전용, 등록 루트 ID 게이트) → M2 Phase 01~04.
  - 검증: **286 단위·통합 테스트** + **Playwright e2e 7개**(core-loop 4 + visual-viewer 3=마크다운/이미지/레퍼런스). `99.Others/tests/e2e/visual-viewer.e2e.ts`가 실제 Electron 구동→DOM단언+스크린샷(`artifacts/screenshots/`) — UI Phase 표준 시각검증. 첫 실행 창=FHD 기준.
  - C2 시맨틱 토큰 · C5 LSP(호버/정의이동)는 **M2-LSP 마일스톤으로 분리**.
- **충실도 트랙(2026-06-22, ADR-013/014)**: 원본 완성도 격차 → **전면 1:1 시각/구조 재작업** + **스택 원본 일치 업그레이드**(React19/Electron42/Vite7/TS6). 원본 클론 `C:/Dev/AgentCodeGUI` 대조, 타깃=`00.Documents/UI.md`(옛 OKLCH 타깃에서 Clay 에디토리얼 HEX 듀얼테마로 진화), 페이즈 F1~F6(디자인시스템+셸 토대 먼저). 이후 기능(M3 Git·M4 멀티에이전트·M5 배포)은 충실도 비주얼 위에 구현.
- **충실도 트랙 F1~F15 ✅ 완료** + 시각 audit 완료(상세=00.Documents/archive/REPLICA_GAP.md). **M3 Git ✅**(D1~D4) · **M4-1 ✅**(단일 에이전트 실 실행·토큰 게이지) · **엔진 SDK 전환 ✅**(ADR-016, Phase 21 — claude-agent-sdk query(), 실 contextWindow) · **M4-2 ✅(Phase 22)**(슬래시 실행·@mention 실데이터·이미지 첨부+비전 인지 라이브 검증·큐 드레인; 커밋 560645d/52e7356/74ea489/18def9c; 단위 1235 green) · **M4-3 ✅(Phase 23)**(멀티 6패널 동시실행[usePanelSession runId 격리·2패널 동시 독립 라이브 검증]·세션 CRUD[delete/rename custom_title 보존·사이드바 실 목록]; 커밋 627f229/f74ff70/5ae1033/57b0efd/add3d59; 단위 1344 green) · **M4-4 ✅(Phase 24)**(thinking·todo[24a]·subagent B4 카드[24b]·권한 응답 양방향[24c: ClaudeAgentRun push-queue 리팩터+canUseTool+AgentRun.respond]·질문 응답[24d: handleAskQuestion]; 커밋 f6be012/1e722c4/23d7fb4/a4aed8c; 단위 1583 green; **권한·질문 백엔드 직접 라이브 스모크 PASS**) · **B9 ✅(Phase 25)**(입력 히스토리 ↑↓, 커밋 c5831b4, 단위 1602) · **B8 ✅(Phase 26)**(OAuth 레이트리밋 게이지 5시간·주간, 커밋 8cea0c0, 단위 1651, 토큰 미노출 reviewer 🔴 0·라이브 실%수신 PASS). **M2-LSP ✅(Phase 27, ADR-017)**: typescript-language-server+pyright 번들, 02.Source/main/lsp(StdioRpc·manager rootId 게이트+resolveSafe·생명주기), CodeViewer hoverTooltip/F12 정의이동/시맨틱 StateField, 커밋 4f7a606, 단위 1734, reviewer(백엔드+렌더) 🔴 0, **실 TS LSP 라이브 PASS**. → **🏁 Track 1 기능 트랙 완료 — GAP1 구현 16/16 완료(위 GAP1 표, P16 = 마감 후 편입) → 게이트 통과 판정 후 M5(배포=A1·E1~E3·E4 라이트).**
- 갱신 규칙: Phase 완료 시 행 상태 갱신. reviewer가 누락 점검. **M5 완료 시 "완전 복제 달성" 마킹.**
