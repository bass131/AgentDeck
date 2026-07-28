/**
 * knownModels.ts — 허용된 모델 picker id 어휘 (shared 도메인 상수, RS1 P03)
 *
 * IPC 채널이 아니다 — `modelEffort.ts`와 같은 **순수 도메인 상수 모듈**이다.
 * `ipcContract.ts` 배럴에 등록하지 않는다(계약 버전 bump 대상 아님). main·renderer
 * 양쪽에서 직접 경로(`02_Source/shared/knownModels`)로 import한다.
 *
 * CRITICAL: Node 전용 API 금지(fs·process·path 등) — 이 파일은 renderer 번들에도
 * 로드되므로 순수 상수/타입만 둔다. `02_Source/main/**`을 import하지 않는다(역의존 금지).
 *
 * ADR-003(엔진 중립) 메모: 이 어휘는 **우리 앱의 picker id**이며, 동시에 SDK가 받는
 * 짧은 별칭(alias)이기도 하다(이중 역할). full 모델 ID('claude-opus-4-8' 등)는 여기
 * 담지 않는다 — 엔진 고유 ID ↔ 이 어휘의 매핑은 어댑터(ClaudeCodeBackend) 내부 몫이다.
 * 같은 어휘가 이미 shared 두 곳(`modelEffort.ts`의 MODEL_EFFORT_SUPPORT ·
 * `ipc/agent.ts`의 MODEL_CONTEXT_WINDOW)에 키로 상주해 온 선례를 따른다.
 *
 * 원본: `02_Source/main/01_agents/runArgs.ts:34-35`(Phase 21b, ADR-016)에서 값·JSDoc
 * 원형 그대로 승격(RS1 P03). **정의는 이 파일이 단일 원본**이고, runArgs.ts는 이 모듈을
 * import해 re-export만 한다(정의 단일화 — C#의 type forwarding 유사, `modelEffort.ts`와
 * 동일 패턴). 기존 소비처의 `./runArgs` import 경로·거동은 불변이다.
 */

/**
 * 허용된 모델 picker id (SDK alias — full 모델 ID 아님).
 * KNOWN_MODELS와 MODEL_CONTEXT_WINDOW(shared) 키 집합이 동일해야 한다(드리프트 금지).
 * 권위 확인(claude-code-guide, 2026-07-04): opus=Opus4.8, sonnet=Sonnet5,
 * haiku=Haiku4.5, fable=Fable5.
 * sonnet 별칭 라이브 실측(model-alias-sonnet5-live-probe.test.ts, LIVE_SDK=1,
 * SDK@0.3.201): 'sonnet' → message.model='claude-sonnet-5' 확인(SDK@0.3.186에서는
 * 'claude-sonnet-4-6'이었음 — bump로 해소, 별도 ID 매핑 불요).
 */
export const KNOWN_MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const

/** `KNOWN_MODELS`의 리터럴 유니온 — 모델 키 테이블의 키 타입(드리프트를 컴파일러가 잡는다). */
export type KnownModel = (typeof KNOWN_MODELS)[number]
