# CLAUDE.md — AgentDeck

이 파일에는 **모델이 코드를 읽어서 알 수 없는 것만** 적는다. 능력 보정 지시("단계적으로
생각하라", "철저히 하라", "TDD로 하라")는 넣지 않는다 — 그건 약한 모델용 보조바퀴이고, 상주
비용을 내면서 모델 자체 판단과 충돌한다. 코드가 이미 말하는 것도 넣지 않는다(중복은 드리프트가
된다). 판단 기준: **이 줄을 지우면 내가 틀린 행동을 하게 되는가?** 아니면 지운다.

## 무엇인가

Claude Code · Codex 듀얼 백엔드 데스크톱 AI 코딩 IDE. Electron + electron-vite + React 19 +
TypeScript + Zustand + CodeMirror. MIT.

두 백엔드는 `02_Source/main/01_agents/AgentBackend.ts`의 얇은 인터페이스로 갈린다
(`ClaudeCodeBackend` / `CodexBackend` / `EchoBackend`). 어댑터 안쪽에 SDK 고유 형상을 가두고
바깥으로는 공통 `AgentEvent`만 흘린다 — 이 경계를 넘기면 renderer가 SDK 버전에 묶인다.

## 폴더 번호 접두 (파일 트리만 보면 순서를 오해한다)

| 경로 | 내용 |
|---|---|
| `02_Source/main/` | Electron main. `00_ipc/`(채널·핸들러) `01_agents/`(백엔드 어댑터) `02_fs/` `03_lsp/` `04_persistence/` `05_settings/` `06_window/` |
| `02_Source/renderer/src/` | React UI. `components/` `store/`(Zustand) `lib/` `hooks/` `layout/` `theme/` `assets/` |
| `02_Source/shared/` | main·renderer 공용 계약. **electron import 0**(현재 실제로 0 — 하나라도 넣으면 renderer 번들이 깨진다) |
| `02_Source/preload/` | contextBridge 노출면 |
| `99_Others/tests/` | vitest. `agents/` `main/` `shared/` `renderer/` `integration/` `e2e/` + `fixtures/` `_lib/` |
| `99_Others/scripts/` | e2e 러너 등 |

## 환경 — 여기서 실제로 사고가 났다

- **Windows 11 + PowerShell 5.1.** `Get-Content`/`Set-Content`는 BOM 없는 UTF-8 한글 파일을
  깨뜨린다. 이 저장소의 주석·테스트 이름은 대부분 한국어다 → **PowerShell로 소스 텍스트를
  치환하지 마라.** Edit 도구를 쓰거나, `node`에 `readFileSync(p,'utf8')`/`writeFileSync(p,s,'utf8')`
  로 명시해서 돌려라.
- **타입체크가 둘이다.** `typecheck:node`(main) / `typecheck:web`(renderer). 한쪽만 돌리면
  반대쪽 회귀를 놓친다.
- **테스트 스위트는 깨끗한 트리에서도 실패한다** — 기준선 `1807398`에서 14파일/112테스트,
  전부 renderer의 jsdom App 마운트 실패다. 통과가 아니라 기준선과의 차분으로 읽는다.
  판정법과 파일 목록은 `.claude/commands/gate.md`.
- **스위트가 도는 중에 대상 파일을 편집하면 그 측정은 무효다.** 모듈 로드 시점이 갈려서 실패
  수가 부풀어 오른다(실측: 16파일이 68파일로).

## 모델 어휘 — 이 저장소의 정본

full ID(`claude-opus-5`)가 정본이다. 별칭(`opus`·`sonnet`·`haiku`·`fable`)과 wire 접미사
(`[1m]`·날짜)는 **입력으로만** 받고 `normalizeModel`이 full ID로 접는다.

- 정의: `02_Source/shared/knownModels.ts` — `PICKER_MODELS`(UI에 뜨는 것) ⊂ `KNOWN_MODELS`(허용).
  두 목록을 나눈 이유: 합쳐두면 모델 하나 추가할 때마다 신뢰경계를 건드려야 한다.
- effort 표: `02_Source/shared/modelEffort.ts`. 모양을 SDK `supportedEffortLevels`와 맞춰
  라이브 차분 테스트가 가능하다(`99_Others/tests/shared/model-canon.test.ts`, `LIVE=1`일 때만).
- **`KNOWN_MODELS.includes()`로 직접 비교하지 마라.** 별칭이 조용히 떨어진다 — 게이지 분모,
  라이브 전환, 컨텍스트 예산에서 실제로 그렇게 터졌다. `normalizeModel`을 쓴다.
- Opus 5는 `thinking:{type:'disabled'}`를 effort `xhigh`/`max`와 함께 보내면 400으로 거절한다.
  `runArgs.ts`의 `ReasoningPatch` 유니온이 두 키 동시 전송을 타입 수준에서 막는다 — 그 유니온을
  풀지 마라.

## 신뢰경계 (renderer는 신뢰하지 않는다)

renderer가 IPC로 보내는 값은 전부 untrusted다. 검증 지점은 두 곳뿐이고, 새 필드를 추가할 때
이 두 곳을 통과하도록 배선한다:

- `02_Source/main/01_agents/runArgs.ts` — model/effort/mode allowlist. 모르는 값은 필드를 생략한다.
- `02_Source/main/01_agents/permissionCoordinator.ts` — 도구 허용/거부. `canUseTool` 판정 **순서가
  계약**이다(Workflow 게이트가 auto/bypass 조기허용보다 먼저 와야 한다).

경로도 검증한다 — `sdkOptions.resolveSafeCwd`가 실존 절대경로 디렉토리만 통과시킨다.

## 게이트

`.claude/commands/gate.md` 참고. `git push`·PR 생성/머지는 `.claude/hooks/dangerous-cmd-guard.mjs`가
사람 승인으로 잡는다 — 승인 없이 실행되지 않는다.

## 문서

설계 근거는 이 저장소 안에 별 문서로 없다. **코드 주석과 git 이력이 정본이다.** 근거를 남길
일이 생기면 그 코드 옆에 주석으로 쓴다 — 별 문서로 빼면 코드와 갈라지고, 갈라진 문서는 없는
것보다 나쁘다.
