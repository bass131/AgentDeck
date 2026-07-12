### ADR-018: 런타임 멀티버전 SDK 설치 + 동적 로드 (엔진 인-앱 업데이트) ⭐
**결정**: 코딩 엔진(`@anthropic-ai/claude-agent-sdk`)을 앱 내에서 **새 버전으로 업데이트**하는 흐름을 추가한다. 원본 AgentCodeGUI `src/main/engine/versions.ts`를 미러하되 신규 폴더 없이 `src/main/engine-versions.ts`(engine-state.ts 옆 sibling 파일)로 둔다.
- **설치**: `npm install @anthropic-ai/claude-agent-sdk@<ver> --prefix <userData>/engines/<ver>` 를 main 단독 child_process spawn, stdout/stderr 라인을 `engine.installProgress` 이벤트로 스트리밍.
- **활성화**: `<userData>/engine-config.json` 의 activeVersion 기록(setActive).
- **동적 로드**: `loadActiveQuery()` 가 활성 설치본 entry를 동적 import해 `query` 를 반환(`{version, query}` 캐시, setActive 시 캐시 무효화). 실패 시 null → 번들 SDK 폴백. `ClaudeCodeBackend.getDefaultQueryFn()` 가 loadActiveQuery 우선 → 번들 폴백.
- **UI**: `EngineUpdateNotice` 를 prompt("나중에"/"업데이트") → installing(스트리밍 로그 카드) → done(setActive)/error(다시 시도) phase 흐름으로 확장(원본 EngineGate 미러).
- **신규 IPC**: `engine.install` / `engine.installProgress`(event) / `engine.setActive` / `engine.versionState`. 타입 `EngineVersionState{package,bundled,active,installed[]}` 는 기존 `EngineState`(authed 전용)와 **별개**.

**이유**: ① 원본이 정확히 이 멀티버전 설치/동적로드를 구현 → Track 1 완전 복제(PRD A-1 "버전 관리"). ② 패키지 앱(asar)은 자기 node_modules를 수정할 수 없어, side-folder 설치 + 동적 로드가 **인-앱 엔진 업데이트의 유일한 경로**. ③ 사용자 직접 지시("업데이트까지 할지 묻고 과정 로그 표시").

**트레이드오프 / 신뢰 표면(CRITICAL)**: "다운로드한 코드를 런타임 실행"하는 새 신뢰 표면이 생긴다. 완화책:
- **다운로드 코드 실행**: 동일 패키지(`@anthropic-ai/claude-agent-sdk`)의 *다른 버전*만 — query 인터페이스 동일(ADR-016 정합). loadActiveQuery 실패 시 번들 폴백(안전망). 설치 버전과 번들의 **major 불일치 시 동적 로드 거부**(API shape 드리프트 가드).
- **npm spawn(child_process)**: main 단독. version(untrusted, renderer 유래)을 **strict semver 검증**(`^\d+\.\d+\.\d+(-[\w.]+)?$`)으로 arg/경로 주입 차단 + `<userData>/engines/<ver>` 경로 **containment 2단 방어**(resolve 후 enginesDir 내부 확인). 자식 env는 **화이트리스트**(PATH·시스템 변수만, ANTHROPIC_API_KEY 등 미주입). progress 라인은 renderer 전달 전 **시크릿 마스킹**(`_authToken`/`:_password`/`Bearer` 패턴). Windows `.cmd` shell 인용(CVE-2024-27980 미러).
- **경로 선택**: `<userData>/engines` — 앱 재설치 시 소실되나 재설치로 복구 가능한 캐시 성격(수용).
- **범위**: EngineGate 흐름(=latest 1개 설치)만. uninstall·Settings 버전 목록·임의 버전 선택은 **이번 범위 제외**(후속).
- ADR-003(versions=Claude 고유 main 인프라, 어댑터가 versions를 단방향 import — 역방향 금지)·ADR-008(신뢰경계)·ADR-016(SDK 단일 경로, 동일 패키지 버전 차이만)와 정합. 신규 npm 의존성 0(child_process·fs·node:url=stdlib).

**현황(2026-06-24)**: (a)체크+팝업·(b)설치·(c)동적로드 구현 완료(커밋 e7fa5ae·7d50e34·c70c924·c85662f). 실 Electron e2e PASS.

