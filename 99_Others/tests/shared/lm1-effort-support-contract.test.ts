/**
 * lm1-effort-support-contract.test.ts — LM1 P06 MODEL_EFFORT_SUPPORT shared 승격 (TDD RED).
 *
 * TDD 순서: 이 파일이 먼저 작성(실패) → shared-ipc가 02.Source/shared/model-effort.ts를
 * 생성(표 + EffortSupport 값 타입 export) → agent-backend가 run-args.ts에서 표 정의를
 * 제거하고 shared에서 import + re-export → 이 파일이 GREEN.
 *
 * 대상(R only — 구현은 shared-ipc·agent-backend Worker 몫):
 *   02.Source/shared/model-effort.ts (신규) — `MODEL_EFFORT_SUPPORT` 상수 +
 *     값 타입 `EffortSupport`({ supports:boolean; xhigh?:boolean }). 순수 도메인 상수 모듈
 *     (IPC 채널 아님 · Node 전용 API 금지 · main·renderer 양쪽 import 대상).
 *   02.Source/main/01_agents/run-args.ts — 기존 :54 정의를 제거하고 shared에서
 *     import + re-export(소비처 import 경로 불변 · 거동 불변).
 *
 * 계약 핀(LM1 P06, 영호 확정 2026-07-17 — 거동 불변 승격이라 임의 변경 금지):
 *   1) 형상: shared 표의 각 값 = { supports:boolean, xhigh?:boolean } (구조적 typeof —
 *      런타임 단언은 타입 이름에 결합하지 않는다. EffortSupport 타입 export는 별도 컴파일
 *      계약으로 잠근다).
 *   2) 현행 내용 보존: opus·fable·sonnet = supports:true·xhigh:true / haiku = supports:false
 *      (haiku엔 xhigh 키가 없거나 falsy). effortToOptions 클램프·special-case 거동 불변의
 *      상수 측 근거.
 *   3) 키 집합 3자 동일: keys(MODEL_EFFORT_SUPPORT) ≡ [...KNOWN_MODELS] ≡
 *      keys(MODEL_CONTEXT_WINDOW). run-args.ts:25·:146의 "드리프트 금지" 주석 계약을
 *      테스트로 승격(주석은 사람이, 테스트는 기계가 지킨다). 순서 무관 — 각각 .sort() 후
 *      집합 동일.
 *   4) re-export 동일 참조: run-args가 re-export할 MODEL_EFFORT_SUPPORT === shared 원본
 *      (정의가 두 곳으로 갈라지지 않았음 — C#의 type forwarding 유사).
 *
 * 현재(RED) 이유: 02.Source/shared/model-effort.ts 모듈 미존재 → 아래 값 import 자체가
 *   해석 실패("Failed to load url .../model-effort" / "Cannot find module") → 스위트 로드
 *   단계에서 FAIL. 모듈이 생기고 run-args가 re-export하면 4단언이 그 구현 계약을 잠근다.
 *
 * import 경로 관례:
 *   - MODEL_CONTEXT_WINDOW: 배럴 02.Source/shared/ipc-contract 경유(ipc-contract.ts:51의
 *     `export * from './ipc/agent'`가 re-export). zoom-readonly-contract.test.ts:22의
 *     배럴 import 관례 미러.
 *   - KNOWN_MODELS: main run-args 직접 import(lm1-set-model-handler.test.ts:47 확립 패턴 —
 *     테스트 파일은 Node 실행이라 번들 무관, main import 허용. 프로덕션 shared 모듈은
 *     main을 import하지 않는다[역의존 금지]).
 */
import { describe, it, expect } from 'vitest'
import {
  MODEL_EFFORT_SUPPORT as fromShared,
  type EffortSupport,
} from '../../../02.Source/shared/model-effort'
import {
  MODEL_EFFORT_SUPPORT as fromRunArgs,
  KNOWN_MODELS,
} from '../../../02.Source/main/01_agents/run-args'
import { MODEL_CONTEXT_WINDOW } from '../../../02.Source/shared/ipc-contract'

// ── 타입 다리 ─────────────────────────────────────────────────────────────────────
// shared 표를 EffortSupport 값 타입으로 조회(EffortSupport export 계약을 컴파일타임에 잠금).
// 런타임 단언은 아래에서 구조적 typeof로 수행 — 타입 이름에 결합하지 않는다.
const shared: Record<string, EffortSupport> = fromShared

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 형상 단언 — 각 값이 { supports:boolean, xhigh?:boolean } (구조적 typeof)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P06 — MODEL_EFFORT_SUPPORT shared 형상 (RED)', () => {
  it('각 값이 { supports:boolean, xhigh?:boolean } 형상이다 (구조적 typeof)', () => {
    // RED: shared/model-effort 모듈 미존재 → import 해석 실패로 이 스위트가 로드되지 않는다.
    for (const [model, entry] of Object.entries(shared)) {
      expect(entry, `${model} entry`).toBeTypeOf('object')
      expect(entry, `${model} entry non-null`).not.toBeNull()
      expect((entry as { supports: unknown }).supports, `${model}.supports`).toBeTypeOf('boolean')
      // xhigh는 optional — 존재하면 boolean, 없으면 undefined(둘 다 형상 위반 아님).
      const xhigh = (entry as { xhigh?: unknown }).xhigh
      if (xhigh !== undefined) {
        expect(xhigh, `${model}.xhigh`).toBeTypeOf('boolean')
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 현행 내용 단언 — 거동 불변 승격(상수 값이 이동 전후로 동일)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P06 — 현행 내용 보존 (거동 불변 승격)', () => {
  it('opus·fable·sonnet = { supports:true, xhigh:true }', () => {
    for (const m of ['opus', 'fable', 'sonnet'] as const) {
      // 정확 일치 — effort 전 단계 + xhigh/max 지원 모델(권위 확인 claude-code-guide).
      expect(shared[m], m).toEqual({ supports: true, xhigh: true })
    }
  })

  it('haiku = supports:false 이고 xhigh는 없거나 falsy (effort 미지원 → 키 생략)', () => {
    expect(shared['haiku'].supports).toBe(false)
    // 키 부재(undefined) 또는 명시 false 모두 허용 — 어느 쪽도 "xhigh 미지원".
    expect(shared['haiku'].xhigh ?? false).toBeFalsy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 키 집합 3자 동일 — 드리프트 잠금(주석 계약의 테스트 승격)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P06 — 키 집합 3자 동일 (드리프트 잠금)', () => {
  it('keys(MODEL_EFFORT_SUPPORT) ≡ [...KNOWN_MODELS] ≡ keys(MODEL_CONTEXT_WINDOW)', () => {
    // 순서 무관 — 각각 .sort() 후 deepEqual로 집합 동일성만 단언(현재 셋 다 {opus,sonnet,haiku,fable}).
    const effortKeys = Object.keys(fromShared).sort()
    const knownKeys = [...KNOWN_MODELS].sort()
    const ctxKeys = Object.keys(MODEL_CONTEXT_WINDOW).sort()

    expect(effortKeys).toEqual(knownKeys)
    expect(effortKeys).toEqual(ctxKeys)
    // 삼단 전이(effort=known, effort=ctx)로 known=ctx도 함의 — 명시 단언으로 실패 지점 명확화.
    expect(knownKeys).toEqual(ctxKeys)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. re-export 동일 참조 — 정의 단일화(두 곳으로 갈라지지 않음)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P06 — run-args re-export 동일 참조 (정의 단일화)', () => {
  it('run-args.MODEL_EFFORT_SUPPORT === shared/model-effort.MODEL_EFFORT_SUPPORT', () => {
    // RED: shared 모듈 미존재로 이 스위트 로드 자체가 실패.
    // GREEN 후: run-args가 shared를 import + re-export하므로 동일 객체 참조(toBe = ===).
    // 복제/재정의였다면 toEqual은 통과해도 toBe는 실패 → 정의 이원화를 잡는다.
    expect(fromRunArgs).toBe(fromShared)
  })
})
