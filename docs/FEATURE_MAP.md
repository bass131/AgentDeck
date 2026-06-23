# FEATURE_MAP — AgentCodeGUI 완전 복제 추적

> 목표: AgentCodeGUI의 **모든 기능을 1:1 복제(Track 1)**한 뒤 우리 스타일(Track 2). 상태: ⬜ 미착수 / 🚧 진행 / ✅ 완료.
>
> **Track 1 — 완전 복제 (Claude Code 전용)**: M1 핵심루프 → M2 코드인텔리전스 → M3 Git → M4 멀티에이전트·대화고도화 → M5 배포. **M5 끝 = 완전 복제 달성.**
> **Track 2 — 우리 스타일 (복제 이후)**: M6 Codex 듀얼백엔드 → M7+ 우리 확장.

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
| B5 | 대화/변경/diff/draft 영속화 | ✅ | M1 | sqlite |
| B3 | 멀티에이전트 동시 실행 + 큐 | ⬜ | M4 | |
| B4 | 서브에이전트 검사 카드 | ⬜ | M4 | |
| B6 | 슬래시 커맨드(/init /compact /review /ask /security-review) | ⬜ | M4 | |
| B7 | 이미지 첨부(붙여넣기/드래그/파일) | ⬜ | M4 | |
| B8 | 컨텍스트 토큰 게이지/사용량 분석 | ✅ 게이지 / ⬜ 분석 | M4-1·Phase21(게이지)/M4 | gaugeCalc — **실 contextWindow(SDK modelUsage) 우선**·MODEL_CONTEXT_WINDOW fallback(Phase 21c)·Composer ContextStrip. 사용량 히스토리·비용=잔여 |
| B9 | 입력창 히스토리 복구(↑↓) | ⬜ | M4 | |
| B10 | 메시지 큐잉(실행중 추가 입력) | ⬜ | M4 | |

## C. 코드 인텔리전스 & 파일 (Track 1)

| # | 기능 | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| C1 | 파일 탐색기 + AI-건드린 인디케이터 | ✅ | M1 | |
| C4 | diff 뷰어(삭제 시각화) | ✅ | M1 | |
| C2 | 코드 뷰어(하이라이팅 / 시맨틱 토큰) | ✅ 구문 / ⬜ 시맨틱 | M2(구문)/M2-LSP(시맨틱) | CodeMirror6 읽기전용+fs.read 단일채널. 구문=M2✅, 시맨틱 토큰=LSP 마일스톤 |
| C3 | 이미지 프리뷰 | ✅ | M2 | data URL `<img>`, 확장자 화이트리스트, 맞춤/실제크기 |
| C5 | LSP(호버·정의이동) | ⬜ | M2-LSP | M2에서 분리(다음 마일스톤). typescript-language-server/pyright |
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

→ **(목표 조건) A·B·C·D·E가 *모두* ✅가 되면 Track 1 완전 복제 달성.** 현재 미달 — M1·M2·M3 ✅ + M4-1 ✅, 잔여: A1·B3·B4·B6·B7·B9·B10·C5(LSP)·E1~E3 ⬜, E4 🚧. (시각 토대 F1~F15 ✅=REPLICA_GAP; **시각 ✅ ≠ 기능 완료**.)

## ➕ Track 2 — 우리 스타일 (복제 이후, AgentCodeGUI엔 없음)

| # | 기능 | 상태 | 마일스톤 | 비고 |
|---|---|---|---|---|
| X1 | Codex 듀얼 백엔드 실동작 | ⬜ | M6 | 얇은 이음에 어댑터 끼움 |
| A3 | 백엔드 전환 UI(대화/전역) | ⬜ | M6 | Claude ↔ Codex |
| X2 | 프로젝트에 하네스 씌우기(스캐폴드 생성) | ⬜ | M7+ | |
| X3 | 백엔드별 토큰/비용 비교 | ⬜ | M7+ | |

---

## 진행 요약
- **M1 (핵심 루프) ✅ 완료**: A2 · A4 · B1 · B2 · B5 · C1 · C4 · D4 · E4(다크) 전부 구현·검증(135 테스트 green) → `phases/01_mvp` Phase 01~06.
  - 검증: 단위·통합 138 테스트 + **Playwright Electron e2e 4개(`npm run test:e2e`)** — 앱 런치·폴더열기·대화 스트리밍·도구카드·파일변경·diff 전 루프 + `agent.run→webContents.send` 결합부까지 **실제 Electron 런타임에서 자동 검증**(echo 백엔드로 결정론). 듀얼 ABI는 스크립트가 자동 관리(node↔electron).
  - ⚠️ 사용자 확인 권장: 실제 `claude` CLI 연결(현재 e2e는 echo 백엔드) + `npm run dev` 시각 확인(`npm run rebuild:native` 선행).
- **M2 (코드 인텔리전스) ✅ 완료**: C2(구문)·C3·C6·C7·C8 — CodeMirror6 코드뷰어 + `fs.read` 단일채널(text+binary) + 마크다운 렌더(react-markdown/remark-gfm/rehype-highlight, XSS·원격차단·CSP) + 이미지 프리뷰 + 레퍼런스 폴더(읽기전용, 등록 루트 ID 게이트) → `phases/02_code-intelligence` Phase 01~04.
  - 검증: **286 단위·통합 테스트** + **Playwright e2e 7개**(core-loop 4 + visual-viewer 3=마크다운/이미지/레퍼런스). `tests/e2e/visual-viewer.e2e.ts`가 실제 Electron 구동→DOM단언+스크린샷(`artifacts/screenshots/`) — UI Phase 표준 시각검증. 첫 실행 창=FHD 기준.
  - C2 시맨틱 토큰 · C5 LSP(호버/정의이동)는 **M2-LSP 마일스톤으로 분리**.
- **충실도 트랙(2026-06-22, ADR-013/014)**: 원본 완성도 격차 → **전면 1:1 시각/구조 재작업** + **스택 원본 일치 업그레이드**(React19/Electron42/Vite7/TS6). 원본 클론 `C:/Dev/AgentCodeGUI` 대조, 타깃=`docs/UI_FIDELITY.md`, 페이즈 F1~F6(디자인시스템+셸 토대 먼저). 이후 기능(M3 Git·M4 멀티에이전트·M5 배포)은 충실도 비주얼 위에 구현.
- **충실도 트랙 F1~F15 ✅ 완료** + 시각 audit 완료(상세=docs/REPLICA_GAP.md). **M3 Git ✅**(D1~D4) · **M4-1 ✅**(단일 에이전트 실 실행·토큰 게이지) · **엔진 SDK 전환 ✅**(ADR-016, Phase 21 — claude-agent-sdk query(), 실 contextWindow). **다음**: M4-2(슬래시/@mention/이미지/큐 — SDK가 헤드리스 제약 해소) → M4-3/4 → M2-LSP → M5.
- 갱신 규칙: Phase 완료 시 행 상태 갱신. reviewer가 누락 점검. **M5 완료 시 "완전 복제 달성" 마킹.**
