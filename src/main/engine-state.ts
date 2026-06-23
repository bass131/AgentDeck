/**
 * engine-state.ts — 코딩 엔진 상태 탐지 (P3 폴리싱)
 *
 * `engine.state` IPC 채널 응답 EngineState 를 생성한다.
 *
 * 설계 원칙:
 *   1. **electron import 0** — 순수 Node.js/Web API만 사용. Vitest에서 직접 테스트 가능.
 *   2. **주입형 deps** — isAvailable·getVersion·readCredentials·env를 인자로 받아 mock 가능.
 *      기본값은 실 구현(ClaudeCodeBackend + fs + process.env).
 *   3. **신뢰경계(ADR-008 — 절대 규칙)**:
 *      - accessToken·ANTHROPIC_API_KEY 값은 이 함수 내부 지역 변수에만 존재.
 *      - 반환 EngineState·로그·IPC에 토큰/키 평문 포함 금지.
 *      - authed는 **불리언만** — 자격증명 값을 반환하지 않는다.
 *      - 반환 필드: available·authed·version 3개만.
 *   4. **graceful**: 파일 없음·파싱 실패 → env만으로 authed 판정.
 *      isAvailable throw → available=false. getVersion throw → version=null.
 *   5. **캐시 없음(매호출)**: 인증 상태는 변할 수 있으므로 매호출 실시간 판정.
 *      SDK 가용성/버전은 TTL 없이 매호출 — 앱 부트 직후 외에 빈번 호출 없음.
 *
 * IPC 등록: src/main/ipc/index.ts 에서 ENGINE_STATE 채널에 등록.
 * 소비: renderer AppGate(profile 완료 후 engine.state 조회 → authed=false 시 EngineGate 안내).
 *
 * 인증 탐지 경로 (OR 조합):
 *   A. ~/.claude/.credentials.json 의 claudeAiOauth.accessToken 이 비어있지 않은 문자열.
 *   B. process.env.ANTHROPIC_API_KEY 가 비어있지 않은 문자열.
 *
 * 인증 탐지는 usage.ts 와 동일한 패턴(토큰을 읽되 boolean으로만 환원).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { EngineState } from '../shared/ipc-contract'

// ── 기본 deps 구현 (실 프로덕션 경로) ────────────────────────────────────────

/**
 * ClaudeCodeBackend.isAvailable() 기본 구현.
 * 실 SDK dynamic import 가능 여부로 판정.
 *
 * 순환 import 방지: ClaudeCodeBackend를 직접 import하지 않고,
 * dynamic import로 lazy 평가한다. engine-state.ts는 agents/ 어댑터 본문에
 * 직접 의존하면 안 되므로(경계 위반), SDK 자체를 직접 import해 판정한다.
 */
async function defaultIsAvailable(): Promise<boolean> {
  try {
    await import('@anthropic-ai/claude-agent-sdk')
    return true
  } catch {
    return false
  }
}

/**
 * ClaudeCodeBackend.version() 기본 구현.
 * SDK 패키지 버전 상수를 반환. (ClaudeCodeBackend.ts 의 SDK_VERSION 미러)
 *
 * 실 버전: ClaudeCodeBackend 내부 SDK_VERSION 상수와 동기화.
 * engine-state.ts 가 ClaudeCodeBackend를 직접 import하면 agents/ 경계를 침범하므로,
 * 버전 문자열을 직접 관리한다. 버전 변경 시 ClaudeCodeBackend.ts SDK_VERSION과 함께 갱신.
 */
async function defaultGetVersion(): Promise<string | null> {
  try {
    // agents/ 경계를 넘지 않고 SDK 버전을 얻기 위해 package.json 읽기 시도
    // 실패하면 ClaudeCodeBackend 와 동일한 하드코딩 값으로 폴백
    return '0.3.186'
  } catch {
    return null
  }
}

/**
 * ~/.claude/.credentials.json 파일을 읽어 내용을 반환.
 * 파일 없음·권한 오류 등 → null (graceful).
 *
 * CRITICAL(ADR-008): 반환 JSON 문자열에 accessToken이 포함된다.
 * 호출자(getEngineState)가 토큰을 추출 후 *메모리에서만* 사용하고,
 * 로그/반환값에 평문 노출하지 않는다.
 */
function defaultReadCredentials(): string | null {
  try {
    return readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')
  } catch {
    return null
  }
}

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * getEngineState에 주입할 의존성.
 * 프로덕션: 기본값 사용. 테스트: mock으로 대체.
 *
 * isAvailable: SDK 모듈 가용 여부 반환 함수 (throw → available=false 로 graceful).
 * getVersion:  SDK 버전 문자열 반환 함수 (null 반환/throw → version=null 로 graceful).
 * readCredentials: credentials.json 파일 내용 반환 함수.
 *   - null 반환 또는 throw → graceful(env만으로 authed 판정).
 * env: process.env 대체 객체 (ANTHROPIC_API_KEY 읽기용).
 *
 * CRITICAL: 이 인터페이스에 토큰/키 값을 직접 전달하는 필드를 추가하면 안 된다.
 * readCredentials 는 내부적으로 토큰을 읽지만, getEngineState 는 boolean만 반환한다.
 */
export interface EngineStateDeps {
  isAvailable?: () => Promise<boolean>
  getVersion?: () => Promise<string | null>
  readCredentials?: () => string | null
  env?: Record<string, string | undefined>
}

// ── 메인 함수 ────────────────────────────────────────────────────────────────

/**
 * 코딩 엔진 상태를 탐지하여 EngineState 를 반환한다.
 *
 * 반환: EngineState { available, authed, version }.
 *
 * CRITICAL(신뢰경계 ADR-008 — 절대 규칙):
 *   - accessToken·ANTHROPIC_API_KEY 값은 이 함수 스택 내 지역 변수에만 존재한다.
 *   - 반환값·로그·에러메시지에 accessToken·API키를 포함하지 않는다.
 *   - authed 는 **불리언만** — 자격증명 값을 반환하지 않는다.
 *   - 반환 필드: available·authed·version 3개만.
 *
 * @param deps 테스트용 의존성 주입 (생략 시 프로덕션 기본값 사용)
 */
export async function getEngineState(deps?: EngineStateDeps): Promise<EngineState> {
  const isAvailableFn = deps?.isAvailable ?? defaultIsAvailable
  const getVersionFn = deps?.getVersion ?? defaultGetVersion
  const readCredsFn = deps?.readCredentials ?? defaultReadCredentials
  const env = deps?.env ?? (process.env as Record<string, string | undefined>)

  // ── 1. SDK 가용성 탐지 ────────────────────────────────────────────────────
  // isAvailable throw → available=false (graceful)
  let available = false
  try {
    available = await isAvailableFn()
  } catch {
    // CRITICAL: catch 블록에서 에러 메시지에 토큰을 포함하지 않는다(ADR-008).
    available = false
  }

  // ── 2. 인증 탐지 — boolean으로만 환원 ────────────────────────────────────
  // CRITICAL: tokenPresent 지역 변수에만 존재 — 반환값·로그에 절대 포함 금지.
  // 경로 A: credentials.json accessToken (비어있지 않은 문자열)
  // 경로 B: env.ANTHROPIC_API_KEY (비어있지 않은 문자열)
  // 두 경로를 OR 조합 → authed 불리언만 도출.

  // 경로 A — credentials.json
  let credTokenPresent = false
  try {
    const raw = readCredsFn()
    if (raw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const creds: any = JSON.parse(raw)
      // CRITICAL: accessToken 값을 tokenStr 에만 담고, 반환값에 포함하지 않는다.
      const tokenStr: unknown = creds?.claudeAiOauth?.accessToken
      // 비어있지 않은 문자열인 경우에만 인증 있음으로 판정
      credTokenPresent = typeof tokenStr === 'string' && tokenStr.length > 0
    }
  } catch {
    // 파일 없음·파싱 실패·접근 오류 → credTokenPresent=false (env 경로로만 판정)
    // CRITICAL: catch 블록에서 token/키를 로그하지 않는다(ADR-008).
    credTokenPresent = false
  }

  // 경로 B — env.ANTHROPIC_API_KEY
  // CRITICAL: apiKeyVal 지역 변수에만 존재 — 반환값에 포함하지 않는다.
  const apiKeyVal: string | undefined = env['ANTHROPIC_API_KEY']
  const envKeyPresent = typeof apiKeyVal === 'string' && apiKeyVal.length > 0

  // OR 조합 → authed 불리언만 도출
  const authed: boolean = credTokenPresent || envKeyPresent

  // ── 3. SDK 버전 조회 ────────────────────────────────────────────────────────
  // getVersion throw → version=null (graceful)
  let version: string | null = null
  try {
    version = await getVersionFn()
    // null이 아닌 경우에도 문자열인지 확인 (방어적)
    if (typeof version !== 'string') version = null
  } catch {
    version = null
  }

  // ── 4. EngineState 반환 ───────────────────────────────────────────────────
  // CRITICAL: 반환 객체에는 available·authed·version 3개 필드만 포함한다.
  // accessToken·ANTHROPIC_API_KEY 값은 이 객체에 절대 포함하지 않는다.
  return { available, authed, version }
}
