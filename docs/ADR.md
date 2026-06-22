# Architecture Decision Records — AgentDeck

> *왜 이렇게 만드는지*. 각 결정 = 뭘 골랐고 / 왜 / 뭘 포기했는지 3줄. **트레이드오프가 핵심** — AI가 나중에 "X로 바꿀까요?" 제안을 못 하게 못박는다.

---

### ADR-001: 셸 — Electron (Tauri 아님)
**결정**: Electron + electron-vite.
**이유**: 목표가 AgentCodeGUI의 *배포 과정까지 벤치마킹*. AgentCodeGUI는 Electron이라 NSIS 설치·electron-updater·컨텍스트메뉴 경로를 그대로 재사용 가능. React 생태계(코드뷰어/diff) 재사용.
**트레이드오프**: 번들 크기·메모리는 Tauri보다 크다. 그러나 배포 파이프라인 재현성과 레퍼런스 일치가 우선.

### ADR-002: UI — React + TypeScript
**결정**: renderer는 React + TS.
**이유**: AgentCodeGUI 레퍼런스 일치, 코드뷰어/diff/마크다운 등 성숙한 React 라이브러리 활용.
**트레이드오프**: Svelte/Solid 대비 런타임 약간 무겁다. 생태계 깊이를 택함.

### ADR-003: 엔진 추상화 — Adapter 패턴 (`AgentBackend`) ⭐
**결정**: 모든 코딩 엔진을 `AgentBackend` 인터페이스 뒤에 둔다. 엔진별 출력은 공통 `AgentEvent`로 정규화.
**이유**: "Codex도 활용 + 듀얼 백엔드 전환" 요구. UI/영속화가 엔진을 모르게 하면 엔진 추가 = 어댑터 1개. 단일엔진 종속(AgentCodeGUI의 한계)을 구조적으로 회피.
**트레이드오프**: 공통 이벤트 모델이 *최소공배수*라 엔진 고유 기능(예: Claude의 sub-agent 카드 메타)을 100% 노출 못 할 수 있음 → 어댑터에 `raw` 패스스루 필드를 둬 완화.

### ADR-004: Claude Code 연동 — Agent SDK 우선, `claude -p` 폴백
**결정**: `@anthropic-ai/claude-agent-sdk`(또는 동등 SDK)를 1순위, 헤드리스 `claude -p` JSON 스트림을 폴백 어댑터로.
**이유**: SDK는 구조화된 이벤트/툴 메타를 주어 정규화가 쉽다. CLI 폴백은 SDK 부재 환경 호환.
**트레이드오프**: SDK 버전 변동 추적 비용. 어댑터 경계가 흡수.
**Note**: Anthropic/Claude 관련 작업 전 `claude-api` 스킬 + 최신 모델 ID 확인 의무(CLAUDE.md).

### ADR-005: 상태관리 — Zustand
**결정**: renderer 전역상태는 Zustand.
**이유**: 대화 스트리밍처럼 고빈도 부분갱신에 보일러플레이트 적고 가벼움.
**트레이드오프**: Redux DevTools 생태계 대비 디버깅 도구 빈약. 규모상 불필요.

### ADR-006: 영속화 — better-sqlite3
**결정**: 대화/diff/draft는 better-sqlite3(동기 API, main 프로세스).
**이유**: 임베디드·트랜잭션·쿼리 가능, 파일 한 개. AgentCodeGUI의 "대화/변경 영속화" 요구 충족.
**트레이드오프**: 네이티브 모듈이라 electron-rebuild/abi 관리 필요. JSON 파일 대비 운영비용 ↑이나 쿼리·복구 능력이 그만한 값.

### ADR-007: 보안 — main 단독 권한 + contextIsolation
**결정**: `nodeIntegration:false`, `contextIsolation:true`. fs/proc/db/network은 main만. preload는 화이트리스트 IPC만 노출.
**이유**: renderer는 untrusted(웹 콘텐츠/마크다운 렌더). 하네스 "도구 경계" 기둥의 코드화.
**트레이드오프**: 모든 권한작업이 IPC 왕복 → 코드량 ↑. 보안·하네스 정합이 우선.

### ADR-008: API 키 저장 — OS 자격증명 / `.env`(git-ignored)
**결정**: 키는 OS 자격증명 저장소 또는 `.env`. 코드·DB·로그에 평문 금지.
**이유**: 유출 방지(CLAUDE.md CRITICAL).
**트레이드오프**: keytar류 네이티브 의존. MVP는 `.env`로 시작, 자격증명 저장소는 마일스톤 04.

### ADR-009: 패키징 — electron-builder(NSIS) + electron-updater
**결정**: electron-builder NSIS 타깃, electron-updater + GitHub Releases.
**이유**: AgentCodeGUI 배포 경로 동일. 위저드 설치 + 자동 업데이트.
**트레이드오프**: 코드 서명 부재 시 SmartScreen 경고("More info→Run"). MVP/초기엔 서명 보류(비용), 후속 도입.

### ADR-010: 멀티에이전트 개발 분담 — ClaudeDev식 coordinator/worker
**결정**: 본 저장소 개발은 coordinator(분해·위임·통합) → 도메인 Worker(main-process / agent-backend / renderer / shared-ipc / qa) → reviewer/plan-auditor 자동 호출. 권한 경계 + 재귀 차단 + 등급별 동원.
**이유**: `C:\Dev\ClaudeDev` 검증된 패턴 착안. 컨텍스트 보존 + 경계코드 일관성.
**트레이드오프**: 위임 오버헤드(단순 작업엔 과함) → 등급 "단순"은 메인 직접 처리로 완화.

### ADR-011: Phase 실행 — `scripts/execute.py` 헤드리스 순차
**결정**: 마일스톤을 Phase로 쪼개 `execute.py`가 `claude -p`로 순차 실행, Phase별 새 세션 + 상태(`status.json`) 추적 + 자동 커밋.
**이유**: 하네스 프레임워크 Layer 3. 각 Phase 범위가 문서로 제한 → 에이전트가 범위 밖 작업 안 함.
**트레이드오프**: 헤드리스 자동실행은 사람 게이트가 약해질 위험 → 비가역(push/PR/배포)은 `ask` 게이트 보존(settings.json).

### ADR-012: 코드 인텔리전스 스택 — CodeMirror 6 + react-markdown (M2)
**결정**: 코드뷰어=**CodeMirror 6**(읽기전용, Darcula 테마), 마크다운=**react-markdown + remark-gfm + rehype-highlight + highlight.js**, 이미지=data URL `<img>`. `fs.read` 단일 채널(text+binary)로 뷰어 라우팅. 원본 AgentCodeGUI와 동일 스택.
**이유**: 원본 충실도 + 성숙한 React 생태계. 마크다운 신뢰경계(rehype-raw 미사용·data URL만·CSP img-src/connect-src/object-src).
**트레이드오프**: highlight.js 문법 번들(~750KB) → 데스크톱 앱 허용. **시맨틱 토큰(LSP 호버/정의이동)은 M2-LSP 마일스톤으로 분리**(typescript-language-server/pyright).

### ADR-013: 스택 버전 — 원본 AgentCodeGUI와 동일 업그레이드 ⭐
**결정**: **React 19 · Electron 42 · Vite 7 · electron-vite 5 · TypeScript 6** + @vitejs/plugin-react 5 · vitest 3 · @testing-library/react 16 · @types/react 19 · @types/node 24. (이전 암묵 React18/Electron31/Vite5/TS5 → 상향.)
**이유**: Track 1 = **완전 복제**. 런타임/빌드가 원본과 동일해야 동작·배포·미래기능(LSP·Agent SDK) 정합. 원본의 *동작하는* electron.vite/tsconfig를 미러링해 마이그레이션 위험을 줄임.
**트레이드오프**: Electron 11개 메이저 등 대규모 업그레이드 → React19 JSX 네임스페이스(`JSX.Element`→`React.JSX`)·testing-library 16·better-sqlite3 ABI 재빌드 등 breaking 대응 필요. **사용자 승인(2026-06-22)**. ADR-001/002의 "Electron+React+TS" 결정은 불변, 버전만 고정.

### ADR-014: 충실도 1:1 복제 방식 — 원본 클론 레퍼런스 + OKLCH 디자인시스템 ⭐
**결정**: 원본 repo를 **`C:/Dev/AgentCodeGUI`에 클론**(git 미포함, 레퍼런스 전용). 컴포넌트 소스/`styles.css`/`docs/*.png` 스크린샷을 **페이즈별 대조**. 디자인시스템 = **OKLCH 듀얼테마(라이트/다크)** 이식(이전 hex 토큰·다크 전용 대체). 타깃 스펙 = `docs/UI_FIDELITY.md`. **충실도 트랙 F1~F6**(디자인시스템+셸 → 사이드바/탐색기 → 대화/컴포저/툴카드 → 우측패널 → 뷰어/모달 → 라이트테마/폴리시).
**이유**: 기능맵 기반 구현이 원본 완성도(셸·디자인·컴포넌트 밀도)에 못 미침 → *정답지(소스)* 대조가 충실도의 정공법. 격차 상당수(서브에이전트·Git·설정·LSP)는 M3/M4/M5 기능과 병합.
**트레이드오프**: 외부 코드 참조·실행은 **신뢰경계 주의** — live 빌드/실행은 **사용자 권한 하에서만**(외부 lifecycle 스크립트 실행 위험). 소스+스크린샷 정적 대조가 기본.
