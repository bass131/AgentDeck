/**
 * ClaudeCodeBackend.ts — Claude Agent SDK 어댑터 (Phase 21b ADR-016 · RF1-followup P03 분해)
 *
 * AgentBackend 구현: @anthropic-ai/claude-agent-sdk query() 사용.
 * SDK가 yield하는 SDKMessage → AgentEvent push-queue로 정규화하는 실행 핸들은
 * ClaudeAgentRun(claudeAgentRun.ts)이 담당하며, start()가 인스턴스를 생성한다.
 *
 * 핵심 책임(이 파일): AgentBackend 표면 구현 — isAvailable/version/latestVersion/start/
 *   listSupportedCommands. 엔진 고유 출력 정규화·권한·옵션·펌프는 협력 모듈로 위임한다:
 *   - claudeAgentRun.ts      : 실행 핸들(펌프·push-queue·abort 생명주기)
 *   - permissionCoordinator.ts: 권한/질문 결정(canUseTool)
 *   - sdkOptions.ts          : SDK query 옵션 조립 + refusal-fallback 핸들러
 *   - queryFn.ts             : query 함수 해석(lazy import) + supportedCommands 캡처
 *   - eventNormalizer.ts     : 상태 기반 이벤트 정규화
 *
 * 엔진 분기는 registry.ts에서만 수행한다.
 * 이 클래스를 직접 import하는 곳은 registry.ts 하나뿐이어야 한다(+ 테스트).
 *
 * API 키: 환경변수(ANTHROPIC_API_KEY)에서 SDK가 자동 처리. 코드·로그 평문 노출 절대 금지.
 *
 * 설계 (ADR-016, 결정 #1~#9):
 * - CLI spawn/taskkill 제거 → SDK query() 사용.
 * - lazy query injection (결정 #8): 생성자에서 queryFn 주입 가능.
 * - isAvailable: SDK 하드 의존성 → true (결정 #7).
 * - version: SDK 패키지 버전 문자열 (결정 #7).
 *
 * 공개 표면 보존(RF1-followup P03): QueryFn 타입과 ORCHESTRATION_SYSTEM_GUIDE 상수는
 *   협력 모듈로 이전됐으나, 기존 import 경로(이 파일에서 가져오던 소비처·테스트)를 위해
 *   re-export한다.
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getDefaultQueryFn } from './queryFn'
import { ClaudeAgentRun } from './claudeAgentRun'
import { createSkillsStore } from '../05_settings/skills'
import { createMcpStore } from '../05_settings/mcp'
import type { QueryFn } from './queryFn'
import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { SlashCommandInfo } from '../../shared/ipc-contract'

// ── 공개 표면 re-export (RF1-followup P03 분해 — 기존 import 경로 보존) ──────────
// QueryFn: 테스트 다수가 `import type { QueryFn } from './ClaudeCodeBackend'`로 가져온다.
// ORCHESTRATION_SYSTEM_GUIDE: orchestration-sdkoptions.test가 이 파일에서 import한다.
export type { QueryFn } from './queryFn'
export { ORCHESTRATION_SYSTEM_GUIDE } from './sdkOptions'

// ── SDK 버전 상수 ─────────────────────────────────────────────────────────────

/**
 * SDK 패키지 버전 폴백 상수.
 * version()이 런타임 package.json 읽기에 실패했을 때 반환한다.
 * 삭제 금지 — graceful fallback 보존.
 */
const SDK_VERSION = '0.3.186'

/**
 * npm registry URL — ClaudeCodeBackend 내부에만 격리(ADR-003).
 * 인터페이스/타 도메인/renderer에 절대 노출하지 않는다.
 */
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk'

/**
 * 설치된 SDK의 실 버전을 package.json에서 읽는다(폴백 없음 — 성공=버전, 실패=null).
 *
 * ⚠️ exports 제약 회피: `@anthropic-ai/claude-agent-sdk`의 package.json `exports`에는
 * './package.json' 서브패스가 없어 `require('@anthropic-ai/claude-agent-sdk/package.json')`은
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`로 throw한다(라이브 검증으로 발견). 그래서 **메인 엔트리만
 * resolve**(exports에 노출됨)한 뒤, 그 디렉토리에서 위로 올라가며 package.json을 직접 fs로
 * 읽어 name이 일치하는 패키지 루트를 찾는다. fs 직접 읽기는 exports 제약을 받지 않는다.
 *
 * 신뢰경계: 버전 문자열만 반환 — 시크릿 0.
 */
export function readInstalledSdkVersion(): string | null {
  try {
    const require = createRequire(import.meta.url)
    // 메인 엔트리는 exports에 노출 → resolve 가능. 거기서 패키지 루트로 거슬러 올라간다.
    let dir = dirname(require.resolve('@anthropic-ai/claude-agent-sdk'))
    for (let i = 0; i < 8; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (pkg?.name === '@anthropic-ai/claude-agent-sdk') {
          const ver: unknown = pkg.version
          return typeof ver === 'string' && ver.length > 0 ? ver : null
        }
      } catch {
        /* 이 디렉토리에 package.json 없음/불일치 → 상위로 */
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  } catch {
    return null
  }
}

// ── ClaudeCodeBackendDeps (주입 가능 의존성) ─────────────────────────────────

/**
 * ClaudeCodeBackend 생성자 4번째 파라미터 — 주입 가능 의존성.
 *
 * 테스트 격리 전용:
 *  - fetchImpl: latestVersion() 내부 fetch 대체. 기본=globalThis.fetch.
 *  - resolvePackageVersion: version() 내부 package.json 읽기 대체.
 *    정상 → 버전 문자열 반환, 실패 → throw(SDK_VERSION 폴백으로 처리).
 *
 * 신뢰경계(ADR-008): fetch는 이 어댑터(main 프로세스) 내부에서만 호출.
 * 테스트가 mock을 주입해 실 네트워크 의존을 0으로 만든다.
 */
export interface ClaudeCodeBackendDeps {
  fetchImpl?: typeof fetch
  resolvePackageVersion?: () => string | null
}

// ── ClaudeCodeBackend ─────────────────────────────────────────────────────────

/**
 * Claude Agent SDK 어댑터.
 * AgentBackend 인터페이스 구현.
 *
 * 주입형 queryFn으로 테스트 격리 지원 (결정 #8).
 * 기본값은 lazy dynamic import → mock 테스트가 실 SDK를 평가하지 않음.
 *
 * 4번째 파라미터 deps(ClaudeCodeBackendDeps)로 fetch·package.json 읽기를 주입 가능하게 해
 * latestVersion()/version() 단위 테스트가 실 네트워크/파일시스템 의존 0으로 동작한다.
 */
export class ClaudeCodeBackend implements AgentBackend {
  readonly id = 'claude-code' as const

  private _queryFn: QueryFn | null
  private _skillOverridesProvider: () => Record<string, 'off'> | null
  private _mcpDeniedProvider: () => { serverName: string }[] | null
  private _fetchImpl: typeof fetch
  private _resolvePackageVersion: () => string | null
  /**
   * workspaceRoot → SlashCommandInfo[] 인스턴스 캐시 (ADR-019).
   * 키 = req.workspaceRoot ?? '' (빈 문자열 = 전역).
   * run 종료 후 fire-and-forget이 완료될 때 기록됨.
   * 동기 조회만(listSupportedCommands). IO 없음.
   */
  private readonly _commandsCache = new Map<string, SlashCommandInfo[]>()

  /**
   * @param queryFn 선택적 query 함수 주입 (테스트용).
   *   미전달 시 null → start() 시점에 lazy dynamic import.
   * @param skillOverridesProvider 선택적 skillOverrides 소스 주입 (테스트용).
   *   미전달 시 기본값 = () => createSkillsStore().disabledSkillOverrides()
   *   (실 userData/skills-disabled.json 읽음, run 시작 시 1회 평가).
   *   ADR-003: Claude SDK 고유 개념 → 이 클래스 내부에만. AgentBackend 인터페이스 미노출.
   * @param mcpDeniedProvider 선택적 deniedMcpServers 소스 주입 (테스트용).
   *   미전달 시 기본값 = () => createMcpStore().deniedMcpServers()
   *   (실 userData/mcp-disabled.json 읽음, run 시작 시 1회 평가).
   *   ADR-003: Claude SDK 고유 개념 → 이 클래스 내부에만. AgentBackend 인터페이스 미노출.
   *   best-effort: SDK 인라인 발효는 managed 컨텍스트 의존 가능 — 차단 단정 금지.
   * @param deps 선택적 의존성 주입 (테스트용).
   *   - fetchImpl: latestVersion() fetch 대체 (기본=globalThis.fetch).
   *   - resolvePackageVersion: version() package.json 읽기 대체.
   */
  constructor(
    queryFn?: QueryFn,
    skillOverridesProvider?: () => Record<string, 'off'> | null,
    mcpDeniedProvider?: () => { serverName: string }[] | null,
    deps?: ClaudeCodeBackendDeps
  ) {
    this._queryFn = queryFn ?? null
    this._skillOverridesProvider = skillOverridesProvider
      ?? (() => {
        try {
          // 실 userData(app.getPath)에서 skills-disabled.json 읽기.
          // 테스트 환경(electron 미초기화)에서는 graceful null 반환.
          return createSkillsStore().disabledSkillOverrides()
        } catch {
          return null
        }
      })
    this._mcpDeniedProvider = mcpDeniedProvider
      ?? (() => {
        try {
          // 실 userData(app.getPath)에서 mcp-disabled.json 읽기.
          // 테스트 환경(electron 미초기화)에서는 graceful null 반환.
          return createMcpStore().deniedMcpServers()
        } catch {
          return null
        }
      })

    // fetch 주입: 테스트 시 mock 주입 → 실 네트워크 의존 0.
    // 기본값은 globalThis.fetch(Node 18+/Electron 제공).
    this._fetchImpl = deps?.fetchImpl ?? globalThis.fetch.bind(globalThis)

    // package.json 버전 읽기 주입: 테스트 시 mock 주입 → 파일시스템 의존 0.
    // 기본값 = readInstalledSdkVersion(메인 엔트리 resolve → 상위 package.json 탐색).
    this._resolvePackageVersion = deps?.resolvePackageVersion ?? readInstalledSdkVersion
  }

  /**
   * SDK 가용성 확인.
   * SDK는 하드 의존성(npm install 필수)이므로 dynamic import가 성공하면 true.
   * (결정 #7)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await getDefaultQueryFn()
      return true
    } catch {
      return false
    }
  }

  /**
   * SDK 패키지 버전 반환 (런타임 package.json 읽기).
   *
   * 하드코딩 제거: _resolvePackageVersion()으로 런타임에 읽어 드리프트 차단.
   * 읽기 실패(미설치·경로 오류 등) 시 SDK_VERSION 상수로 graceful fallback.
   * SDK_VERSION 상수는 폴백 보존을 위해 삭제하지 않는다.
   * (결정 #7, version() 드리프트 차단)
   */
  async version(): Promise<string | null> {
    // 활성 설치 버전 우선(ADR-018) — getVersionState는 fs/config 읽기 포함.
    // 테스트(electron 미초기화)에서 throw 가능 → try/catch로 graceful 폴백.
    // ADR-003: engine-versions 단방향 import만.
    try {
      const { getVersionState } = await import('../engine-versions')
      const active = getVersionState().active
      if (typeof active === 'string' && active.length > 0) return active
    } catch {
      /* engine-versions 미가용 또는 getVersionState 실패 → 번들 버전 경로로 폴백 */
    }
    // 번들 버전 경로: _resolvePackageVersion(실 package.json) → SDK_VERSION 폴백 상수.
    try {
      const ver = this._resolvePackageVersion()
      if (typeof ver === 'string' && ver.length > 0) {
        return ver
      }
      // null 반환(읽기 성공했지만 빈/비정상) → 폴백
      return SDK_VERSION
    } catch {
      // 읽기 실패 → 폴백 상수
      return SDK_VERSION
    }
  }

  /**
   * npm registry에서 @anthropic-ai/claude-agent-sdk의 최신 가용 버전을 조회.
   *
   * ADR-003: registry URL·패키지명은 이 메서드 내부에만 격리. 인터페이스는 generic.
   * 신뢰경계(ADR-008): 버전 문자열만 반환 — 토큰/키/시크릿 절대 미포함.
   *
   * 구현 세부:
   *  - 8s AbortController 타임아웃.
   *  - 모든 오류(네트워크 throw / non-OK / JSON 파싱 실패 / 타임아웃) → null(graceful).
   *  - fetchImpl 주입 가능 → 단위 테스트 실 네트워크 의존 0.
   */
  async latestVersion(): Promise<string | null> {
    // 8초 타임아웃 AbortController
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    try {
      let response: Response
      try {
        // NPM_REGISTRY_URL은 이 파일 최상단 상수로 격리(ADR-003).
        response = await this._fetchImpl(NPM_REGISTRY_URL, {
          signal: controller.signal
        })
      } catch {
        // 네트워크 throw / abort(타임아웃) → null
        return null
      }

      if (!response.ok) {
        // non-OK HTTP (404, 5xx 등) → null
        return null
      }

      let json: unknown
      try {
        json = await response.json()
      } catch {
        // JSON 파싱 실패 → null
        return null
      }

      // dist-tags.latest 추출 (구조 검증)
      const distTags = (json as Record<string, unknown>)?.['dist-tags']
      const latest = (distTags as Record<string, unknown>)?.['latest']
      if (typeof latest !== 'string' || latest.length === 0) {
        // 필드 부재 또는 비문자열 → null
        return null
      }

      return latest
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 에이전트 실행 시작.
   * AgentRun을 즉시 반환 (비동기 스트리밍은 events 소비 시 시작).
   *
   * ADR-019: 캐시 setter 콜백(onCommandsCaptured)을 ClaudeAgentRun에 주입한다.
   * run 내부에서 supportedCommands가 캡처되면 wsKey별 _commandsCache에 기록.
   */
  start(req: AgentRunInput): AgentRun {
    const wsKey = req.workspaceRoot ?? ''
    const onCommandsCaptured = (cmds: SlashCommandInfo[]): void => {
      this._commandsCache.set(wsKey, cmds)
    }
    return new ClaudeAgentRun(
      req,
      this._queryFn,
      this._skillOverridesProvider,
      this._mcpDeniedProvider,
      onCommandsCaptured
    )
  }

  /**
   * 엔진이 실제 지원하는 슬래시 커맨드 목록(캡처된 캐시) 반환 (ADR-019).
   *
   * 동기 — _commandsCache 조회만(IO 없음).
   * 캡처 전·미지원이면 빈 배열(graceful).
   * workspaceRoot null/undefined → 빈 문자열 키(전역 캐시) 조회.
   *
   * CRITICAL(신뢰경계): 반환값은 캡처 시 이미 sanitize된 SlashCommandInfo[].
   * name·description(cap+개행 제거)·argHint·scope(='builtin')만. 시크릿/경로 0.
   */
  listSupportedCommands(workspaceRoot?: string | null): SlashCommandInfo[] {
    const key = workspaceRoot ?? ''
    return this._commandsCache.get(key) ?? []
  }
}
