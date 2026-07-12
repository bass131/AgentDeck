# 프로젝트: AgentDeck

> **헌법(Constitution)** — AI가 코딩할 때 *제일 먼저 읽는 파일*. 하네스 3층 구조(ADR-034)의 **Claude 어댑터 + 프로젝트 진입점**.
> 안전 규칙의 *의미* 정본 = [`00.Documents/harness/CORE.md`](00.Documents/harness/CORE.md)(CORE-01~13) — 본 파일은 절대 규칙의 요지(CRITICAL 라벨)와 *Claude가 그걸 어떻게 강제하는가*(훅·정책·조직론)만 소유한다. 기획/구조/결정의 *근거*는 `00.Documents/`.

여러 AI 코딩 에이전트(Claude Code · Codex)를 하나의 데스크톱 IDE에서 조종하는 Electron 앱. [UnrealFactory/AgentCodeGUI](https://github.com/UnrealFactory/AgentCodeGUI) 벤치마킹 + 듀얼 백엔드.

## 응대 원칙 (사용자 컨텍스트) — 의미 정본 = CORE-13
영호는 학부생, 멘토링 받으며 학습 중. 응답 시 다음을 지킨다:
- **친절·인내심** — "당연한 거 아냐?" 가정 금지(학부 커리큘럼에 없을 가능성 높음). 같은 질문 두 번 OK, 멍청한 질문은 없음. "이해했어" 답엔 중요 개념을 확인 질문으로 점검.
- **전문 용어 첫 사용 시 풀어쓰기** — 예: "직렬화(serialization, 객체를 바이트로 변환)". 영어 약어도 한 번은 풀이("TCP(Transmission Control Protocol)"). 두 번째부터 OK. 외래어 음차 금지.
- **결정엔 항상 trade-off** — "A를 골랐다"가 아니라 "A vs B 중 A, 이유는…, 단점은…". "정답" 단정 X — "이 상황에선 보통 이게 좋아요" 정도.
- **완성된 한국어 문장** — 함축·전보체 금지. 대화형으로 완성된 문장으로만.
- **작업 보고** — 등급별(단순/보통 = work-pin + commit / 복잡 이상 = -DONE.md + 5단계 보고). 상세 = `.claude/policies/reporting-format.md`.

## 문서 지도 (작업 전 필독)
- `00.Documents/harness/CORE.md` — **엔진 중립 안전 정본(CORE-01~13)** + `core-manifest.json`(조항×어댑터 conformance 선언) — 본 헌법은 이 코어의 Claude 어댑터 (ADR-034)
- `00.Documents/PRD.md` — 뭘 만드는지 + **MVP 제외 사항**
- `00.Documents/ARCHITECTURE.md` — 디렉토리/패턴/데이터흐름
- `00.Documents/ADR.md` — 결정과 트레이드오프 **인덱스** (본문 = `adr/` 1결정 1파일 — 바꾸려면 ADR부터)
- `00.Documents/UI.md` — 디자인 시스템·셸 골격·컴포넌트·**안티슬롭** (현 `02.Source/renderer` 실측 기준)
- `00.Documents/FEATURE_MAP.md` — AgentCodeGUI 벤치마킹 추적 (M1~M4·B8·B9·M2-LSP ✅ · M5 배포만 남음)
- `00.Documents/REPL_TRANSITION.md` — 지속 세션(REPL) 전환 (**구현 완료·기본 활성** `replMode=true` 세션별 스코프, ADR-024 — watchdog auto-revive(4b)만 드롭. 라이브 e2e 사인오프 완료 — LR4 종결)
- `.claude/policies/INDEX.md` — 정책 카탈로그 (등급·리뷰 Tier·work-pin·루프·PR 게이트 — 헌법 외부화)
- `.claude/agents/_routing.md` — 작업 → 에이전트 매핑 (+ `_escalation.md` 실패 흐름)
- `.claude/CHANGELOG.md` — 헌법/ADR/하네스/공유계약 변경 이력 (compact·세션 경계 기억 대체)

## 기술 스택 (ADR 없이 변경 금지)
> **엔진(현황)**: `@anthropic-ai/claude-agent-sdk` `query()` 단일 사용(`ClaudeCodeBackend`) — ADR-016 전환 **완료**(Phase 21). `claude -p` CLI spawn/taskkill 전면 제거(폴백 없음, SDK 하드 의존, 원본 기반).
> **원본 일치(ADR-013)**: Electron 42·electron-vite 5·Vite 7·React 19·TS 6·CodeMirror 6·react-markdown·remark-gfm·highlight.js·(배포)electron-builder·electron-updater. **AgentDeck 확장(원본 미존재)**: Zustand(ADR-005)·JSON 파일 영속화(원본 maStore 미러 — ADR-006[better-sqlite3]는 superseded, sqlite 제거)·Vitest·Playwright(`_electron`)·rehype-highlight·ESLint.
- **Electron 42** + **electron-vite 5** + **Vite 7** (main / preload / renderer 3 타깃)
- **React 19 + TypeScript 6** (renderer) — React19 JSX는 `React.JSX`(전역 `JSX` 네임스페이스 제거)
- **Zustand** (상태) · **JSON 파일 영속화** (`02.Source/main/persistence` + `multiStore` — 원본 maStore 미러, sqlite 제거로 네이티브 ABI 마찰 0)
- **코드 인텔리전스(M2, ADR-012)**: CodeMirror 6(코드뷰어) · react-markdown+remark-gfm+rehype-highlight+highlight.js(마크다운) · 이미지 data URL. fs.read 단일채널
- **electron-builder(NSIS)** + **electron-updater** (배포 — **M5 예정, 아직 미설치**)
- **Vitest 3** (단위) · **Playwright `_electron`** (e2e + 시각검증 `visual-viewer`, B-tier)
- **충실도 레퍼런스(ADR-014)**: 원본 클론 `C:/Dev/AgentCodeGUI` + 디자인 스펙 `00.Documents/UI.md`(현 실측 — Clay 에디토리얼 HEX 듀얼테마·radius 11px·serif. 옛 OKLCH 타깃에서 진화)

## 아키텍처 규칙 (CRITICAL) — 상세 정본 = CORE
- **CRITICAL: 신뢰 경계 불가침** — 권한 작업(fs·자식프로세스·DB·네트워크)은 main 프로세스 단독, renderer는 untrusted·화이트리스트 IPC만. → CORE-01
- **CRITICAL: 엔진 추상화 우회 금지** — 엔진 호출은 `AgentBackend` 인터페이스 경유, 엔진 고유 출력은 어댑터에서 공통 `AgentEvent`로 정규화. → CORE-02 (ADR-003)
- **CRITICAL: API 키·시크릿 하드코딩 금지** — 코드·로그·영속 데이터에 평문 X, `.env*`·`secrets/**`는 읽지 않음. → CORE-03 (ADR-008)
- **CRITICAL: IPC 계약 단일 정의** — 채널명·타입은 `02.Source/shared` 한 곳에서 정의하고 양쪽이 import, 변경 후 양쪽 typecheck green. → CORE-04
- 디렉토리 경계 준수·새 최상위 폴더·의존성 추가 = ADR 선행(트레이드오프 기록). → CORE-08

## 개발 프로세스 (CRITICAL)
- **CRITICAL: 새 기능 구현 시 테스트 먼저(TDD)** — 실패하는 테스트 → 통과 구현 순서. → CORE-05 (`tdd-guard` hook이 강제)
- **CRITICAL: Anthropic/Claude 관련 작업 전 `claude-api` 스킬 참조** — 모델 ID·SDK·가격은 기억으로 답하지 말 것. 최신 모델: Opus 4.8(`claude-opus-4-8`), Sonnet 5(`claude-sonnet-5`), Haiku 4.5(`claude-haiku-4-5-20251001`), Fable 5(`claude-fable-5`).
- 커밋 = 검증 후 명시 파일만 스테이징 + conventional commits(`feat:`/`fix:`/`docs:`/`refactor:`/`test:`). → CORE-09
- 비가역 작업(push / PR / merge / 배포 / `package` 릴리스)은 **사람 게이트(`ask`)** 보존 — 무인 실행 금지. → CORE-06
- 파괴 명령(`git reset --hard`·force push·`git clean`·`git add .` 류) 에이전트 실행 금지. → CORE-07 (`dangerous-cmd-guard` 강제)
- Phase 작업은 `00.Documents/ARCHITECTURE.md` 디렉토리 경계 + 해당 Phase 범위 안에서만. 범위 밖 발견 시 보고 후 중단.

## 멀티에이전트 분담 (ClaudeDev식, ADR-010)
| 도메인 | Worker | 영역(R/W) |
|---|---|---|
| Electron 메인(엔진 라이프사이클·IPC 핸들러·JSON 영속·fs·git·lsp[ADR-017]) | `main-process` | `02.Source/main/**` |
| 백엔드 추상화(Claude/Codex 어댑터) | `agent-backend` | `02.Source/main/01_agents/**` |
| React UI | `renderer` | `02.Source/renderer/**` |
| IPC 계약/공통 이벤트 타입 | `shared-ipc` | `02.Source/shared/**` + `02.Source/preload/**` |
| 테스트 | `qa` | `99.Others/tests/**` |
| 운영 잡무(게이트 실행·커밋·work-pin/CHANGELOG·DONE 초안·실측 심부름) | `secretary` | `01.Phases/**`·`00.Documents/reports/**` + `.claude/state/current-pin.txt`·`.claude/CHANGELOG.md`(예외 2파일) — **코드 수정 절대 X** |
| 분해·위임·통합 | `coordinator` | (위임만, R only) |
| 점검 | `reviewer` / `plan-auditor` | (R only) |

- **메인 세션 = Supervisor 전임(영호 지시 2026-07-04)** — 방향 결정·위임 지시문·게이트 판단·사람 소통만. 잡무(게이트 실행·커밋·pin/CHANGELOG·문서 플립·실측 심부름)는 `secretary`, 코드/테스트는 도메인 Worker. 메인이 직접 편집하는 것은 하네스(영호 단독 통제 대행)뿐.
- 등급: **단순**(secretary 또는 Worker 1 위임 — 메인 직접 X) / **보통**(Worker 1) / **복잡**(coordinator+Worker 1~2 +reviewer 조건부) / **대규모**(coordinator+Worker 3~4 +plan-auditor 사전 +reviewer 통합).
- 재귀 차단: coordinator→Worker 1단계만. Worker→Worker 직접 호출 X(escalate).
- 헌법/ADR/policies/하네스 자체 변경은 **사용자 단독 통제** — 에이전트 위임 X, 유지보수 창 + 재봉인 + CHANGELOG. → CORE-11

## 운영 모드 (loop-driven)
> 기본 운영 = **사람은 방향+게이트, 엔진(AI)이 매 스텝 구동**. 상세 = `.claude/policies/loop-driver.md` · `work-judge.md`.

- **Phase로 모호함이 해결된 작업은 매 스텝 확인 없이 자율 진행**한다. "이거 할까요?"를 반복하지 않는다 — 방향은 Phase 정의 + 사용자 목표로 이미 정해짐. 잘게 쪼개 되묻는 건 throughput을 깎는 안티패턴.
- **멈추는 지점은 work-judge 3버킷 중 둘뿐**:
  - **(c) 판단·비가역** — 설계 분기 / `push`·PR·merge·배포 / IPC 계약 버전 bump / JSON 영속 스키마 마이그 / trust-boundary → **사람 GO 대기** (의미 정본 = CORE-06).
  - **(b) 취향·육안** — renderer 시각·UI(`ui-visual`) → 기능은 진행하고 사람 육안 검토 병행(무인 commit X).
  - **(a) 기계 판정** — typecheck·test·lint·e2e·reviewer → **자율 진행, 안 멈춤**.
- **done 판사 = CI 회귀 게이트**(기계 통과/실패). 사람 신뢰 아님 — 게이트 출력이 트랜스크립트에 남게 실행.
- 모호함이 *작업 도중* 새로 드러나면 그때 1회 확인. 단 Phase에서 이미 해결된 건 재확인하지 않는다.
- **무인 배치(영호 부재)는 금지** — 본 모드는 *attended 루프*(영호 감독 하 자율 진행)다.

## 명령어
```bash
npm install              # 의존성
npm run dev              # 개발(electron-vite HMR)
npm run typecheck        # 타입검사 (main+renderer)
npm run test             # Vitest 단위
npm run lint             # ESLint
npm run build            # 번들
# npm run package        # NSIS 설치 exe — M5 배포 예정(electron-builder 미설치). 비가역 릴리스 ask 게이트
```
> **Phase 작업**: `/work-plan <목표>` → `01.Phases/{milestone-slug}/`에 Phase 정의 생성 (work-pin 시드 + plan-auditor 검증). 완료된 마일스톤 폴더(-DONE.md·ScreenShot 포함)는 **기록·참고용으로 보존**(빈 폴더 원칙 폐기 — 영호 2026-07-03). 운영 정책 = `.claude/policies/`.

## 하네스 게이트 (자동 강제)
- **hooks** (`.claude/settings.json`, 9종): pin-injector(work-pin 주입) / supervisor-guard(Supervisor 전임·하네스 봉인) / dangerous-cmd-guard / tdd-guard / risk-detector(위험깃발) / circuit-breaker / reviewer-auto-trigger / phase-gate-validator / convention-size-guard. 본문 = `.claude/hooks/`.
- **엔진별 Hook 격리** — Claude는 `.claude/hooks/**`·`.claude/state/**`만, Codex는 `.codex/hooks/**`·`.codex/state/**`만. 상호 읽기·쓰기·실행 금지, 공유는 정책 의미(코어)뿐. → CORE-12
- **Windows Hook 실행**: Claude shell Hook은 Git Bash에서 실행하며 `.gitattributes`가 `.claude/hooks/**`를 LF 줄바꿈으로 고정한다. 표준 Git for Windows 설치는 자동 탐지하고, portable 설치만 `CLAUDE_CODE_GIT_BASH_PATH`를 사용자 환경에 지정한다.
- **정책** (`.claude/policies/`): 등급·위험깃발·리뷰 Tier·work-pin·루프·PR 게이트 — 헌법 외부화 (`INDEX.md` 카탈로그).
- **슬래시**: `/session:start|end|review`(세션 2종) · `/harness-review`(하네스 자체 점검) · `/review`(코드 변경 규칙 점검) · `/refactor-sweep`(attended 자동 리팩토링 스윕).
- **Skill** (`.claude/skills/`): `/work-plan`(큰 목표 → Phase 분해) · `/work-run`(미착수 Phase loop-driven 실행). work 시리즈는 자동발화(description 자동 인지)·`allowed-tools` 제어를 위해 Skill — `/work-plan`↔`/work-run`은 분해·실행 짝.
