# AgentDeck Codex Review

작성일: 2026-06-28

## 총평

AgentDeck은 Claude Code와 장기적으로 협업하며 만든 프로젝트치고는 상당히 탄탄하다. 품질 리스크의 중심은 "기능이 안 버틴다"보다 "프로젝트가 빠르게 커지면서 생긴 큰 파일, 문서 드리프트, 유지보수 비용" 쪽에 가깝다.

현재 상태 기준으로는 **8/10** 정도로 평가한다. 테스트와 ADR 기록이 강하고, Electron 보안 경계도 의식적으로 설계되어 있다. 다음 효율 좋은 작업은 새 기능 추가보다 큰 덩어리 분해, lint warning 제거, 문서 현재화다.

## 확인한 결과

- `npm run typecheck`: 통과
- `npm run lint`: 에러 0개, warning 33개
- `npm test`: 221 files / 3619 tests 통과
- `npm run build`: 통과
- `git status`: 워킹트리 깨끗함

이번 평가는 `test:e2e`는 실행하지 않았다.

## 강점

- 테스트 범위가 넓다. IPC, Git, LSP, 에이전트 스트림, 권한/질문 응답, persistence, renderer 동작까지 회귀망이 잘 깔려 있다.
- `docs/ADR.md`, `docs/FEATURE_MAP.md`, `CLAUDE.md` 등 장기 개발 의사결정 기록이 풍부하다.
- Electron 신뢰 경계가 코드와 문서 양쪽에서 반복적으로 관리되고 있다.
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - preload 화이트리스트
  - CSP
  - rootId / `resolveSafe` 기반 경로 방어
- Claude SDK, persistent session, LSP, Git, multi-agent 같은 복잡한 기능을 공통 계약 뒤에 숨기려는 방향이 좋다.
- TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`가 켜져 있어 타입 기본기가 좋다.

## 주요 리스크

### 1. 큰 파일이 너무 큼

가장 큰 유지보수 리스크다. 아래 파일들은 변경 충돌, 회귀, 리뷰 비용의 중심이 될 가능성이 높다.

- `src/main/01_agents/ClaudeCodeBackend.ts`: 2266 lines
- `src/shared/ipc-contract.ts`: 2097 lines
- `src/renderer/src/components/00_shell/MultiWorkspace.tsx`: 1477 lines
- `src/main/00_ipc/index.ts`: 1331 lines
- `src/renderer/src/components/01_conversation/Composer.tsx`: 1173 lines

특히 `ClaudeCodeBackend.ts`, `00_ipc/index.ts`, `MultiWorkspace.tsx`는 앞으로 기능 추가보다 먼저 분해하는 편이 좋다.

### 2. React hook warning이 남아 있음

`npm run lint` 기준 warning 33개가 남아 있다. 에러는 아니지만 UI 핵심 파일에 `react-hooks/exhaustive-deps` 경고가 있어 stale closure나 재렌더링 관련 버그 후보가 될 수 있다.

대표 파일:

- `src/renderer/src/components/00_shell/MultiWorkspace.tsx`
- `src/renderer/src/components/01_conversation/Composer.tsx`
- `src/renderer/src/components/03_viewer/ImageViewer.tsx`
- `src/renderer/src/components/06_prompt/QuestionModal.tsx`
- `src/renderer/src/hooks/useInputPalettes.ts`
- `src/renderer/src/lib/useGlobalShortcuts.ts`

### 3. 문서가 일부 현재 상태보다 앞서 있음

README와 ARCHITECTURE에는 `electron-builder`, `electron-updater`, `npm run package`, `electron-builder.yml`이 현재 구성처럼 보이는 문장이 있다. 하지만 실제 `package.json`에는 패키징 스크립트와 관련 의존성이 아직 없다.

반면 `docs/FEATURE_MAP.md`는 M5 배포 항목이 미완료라고 정확히 말한다. 따라서 README/ARCHITECTURE 쪽을 "현재 구현"과 "M5 예정"으로 분리하면 혼란이 줄어든다.

### 4. IPC 검증이 수작업 패턴에 많이 의존함

IPC 채널이 많고, 입력 검증은 대부분 `typeof`, `Array.isArray`, 수작업 정규화로 되어 있다. 지금은 테스트가 받쳐주고 있지만 채널 수가 늘수록 누락 위험이 커진다.

공통 validator/helper를 도입하면 아래 이점이 있다.

- handler 본문이 얇아짐
- 검증 정책이 반복되지 않음
- 테스트 포인트가 명확해짐
- 신뢰 경계 리뷰가 쉬워짐

### 5. renderer 번들이 큼

`npm run build` 기준 renderer JS가 약 2.86 MB로 Vite chunk size warning이 나온다. Electron 앱이라 당장 치명적이지는 않지만, CodeMirror, 마크다운, viewer 계열은 lazy split 후보로 보인다.

## 추천 우선순위

1. lint warning 33개를 0으로 만들기.
2. `ClaudeCodeBackend.ts`를 세부 모듈로 분리하기.
   - SDK query/load
   - stream mapping
   - permission/question handling
   - persistent session pump
   - supported commands cache
3. `src/main/00_ipc/index.ts`를 도메인별 register 함수로 나누기.
   - workspace/fs
   - agent
   - conversation
   - git
   - lsp
   - settings
   - engine
4. `MultiWorkspace.tsx`와 `Composer.tsx`에서 hook/state/view helper를 분리하기.
5. README/ARCHITECTURE의 패키징 관련 표현을 현재 상태에 맞게 정리하기.
6. IPC validator/helper를 공통화하기.
7. M5 진입 전에 `electron-builder`, `asarUnpack` for LSP 서버, updater, 코드서명 전략을 별도 phase로 잡기.

## 결론

AgentDeck은 "AI가 여기저기 덧붙인 실험 앱"이라기보다, 테스트와 의사결정 기록을 계속 쌓아온 실제 제품형 코드베이스에 가깝다. 지금 필요한 것은 기능을 더 얹는 것보다, 커진 덩어리를 다시 사람이 다룰 수 있는 크기로 접는 작업이다.

다음 단계로는 RF1 cleanup 흐름과 맞춰서 큰 파일 분해, hook warning 제거, 문서 현재화를 하나의 정리 트랙으로 진행하는 것이 가장 좋아 보인다.
