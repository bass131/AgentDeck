/**
 * settings/mcp.ts — MCP 서버 목록 발견 + disabled 오버레이 영속화 (P5b)
 *
 * 원본: AgentCodeGUI/src/main/mcp.ts 참고 (읽기 로직 — 단, 원본 detail 노출 버그는
 *       이식 금지: 원본은 args/url 전체를 detail에 노출하는 버그가 있음).
 *
 * 설계 원칙:
 *   1. **electron import 0** — homedir·userData·fs를 주입받아 Vitest에서 직접 테스트 가능.
 *   2. **주입형 deps** — readFile·writeFile·mkdirSync를 인자로 받아 mock 가능.
 *      기본값은 실 node:fs + os.homedir() + app.getPath('userData').
 *   3. **동기 API** — 파일 읽기/쓰기는 짧은 동기 호출(skills.ts와 동일 패턴).
 *   4. **graceful** — 파일 없음·JSON 파싱 실패·필드 없음 → 해당 출처 건너뜀 (throw 0).
 *   5. **신뢰경계(CRITICAL)**:
 *      - 🔴 마스킹(화이트리스트): McpServerInfo.detail에는 시크릿 0.
 *        stdio → command basename만 (args·env 절대 미접촉).
 *        http/sse → URL.host만 (path·query·hash·userinfo·headers 버림).
 *        unknown → detail=''.
 *      - ~/.claude.json 및 .mcp.json는 **읽기만** — 절대 수정 금지.
 *      - disabled 오버레이는 userData(앱 전용)에만 기록.
 *      - name은 untrusted IPC 입력 → setMcpEnabled에서 비어있음 검증.
 *
 * IPC 등록: src/main/ipc/index.ts 에서 MCP_LIST·MCP_SET_ENABLED 채널에 등록.
 * 소비: renderer SettingsModal McpView.
 * 백엔드 통합: deniedMcpServers() → P5b backend의 SDK settings.deniedMcpServers에 spread.
 *   (이 모듈은 값만 반환 — SDK 미접촉. agent-backend 소관.)
 */

import {
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  mkdirSync as nodeMkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir as nodeHomedir } from 'node:os'
import { app } from 'electron'
import type { McpServerInfo } from '../../shared/ipc-contract'

// ── origin rank 상수 ─────────────────────────────────────────────────────────
// user(0)→project(1)→local(2) 정렬 기준.
// 동명 서버가 여러 출처에 존재할 때 이 rank로 정렬하여 출처를 구분한다.

const ORIGIN_RANK: Record<'user' | 'project' | 'local', number> = {
  user: 0,
  project: 1,
  local: 2,
}

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * createMcpStore에 주입할 의존성.
 * 테스트 환경에서 electron/fs를 mock으로 대체한다.
 * skills.ts의 SkillsDeps와 동일 패턴.
 */
export interface McpDeps {
  /** os.homedir() 반환값. 기본: 실 os.homedir(). */
  homedir?: () => string
  /** app.getPath('userData') 반환값. 기본: 실 app.getPath('userData'). */
  getUserData?: () => string
  /**
   * 파일 내용 읽기 (동기, utf8). ENOENT 등 → throw.
   * 기본: readFileSync(filePath, 'utf8').
   */
  readFile?: (filePath: string) => string
  /**
   * 파일 내용 쓰기 (동기, utf8). 실패 → throw.
   * 기본: writeFileSync(filePath, content, 'utf8').
   */
  writeFile?: (filePath: string, content: string) => void
  /**
   * 디렉토리 생성 (동기, recursive). 기본: mkdirSync(dir, { recursive: true }).
   */
  mkdirSync?: (dir: string) => void
}

// ── 스토어 인터페이스 ────────────────────────────────────────────────────────

/**
 * McpStore — MCP 서버 발견 + disabled 오버레이 관리.
 *
 * listMcpServers(workspaceRoot): 전체 MCP 서버 목록 반환.
 * setMcpEnabled(name, enabled): 활성화/비활성화 영속.
 * deniedMcpServers(): SDK deniedMcpServers 형식으로 반환.
 */
export interface McpStore {
  /**
   * 3출처 MCP 서버를 발견하여 McpServerInfo[] 반환.
   *
   * 1. `<homedir>/.claude.json`의 `mcpServers` → origin='user', scope='global'
   * 2. `<homedir>/.claude.json`의 `projects[workspaceRoot].mcpServers`
   *    → origin='local', scope='local' (workspaceRoot 있을 때만)
   * 3. `<workspaceRoot>/.mcp.json`의 `mcpServers`(또는 루트가 서버맵)
   *    → origin='project', scope='local' (workspaceRoot 있을 때만)
   *
   * - enabled: disabled 오버레이에 name 없으면 true.
   * - origin rank 정렬: user(0)→project(1)→local(2), 동 rank 내 name 정렬.
   * - 파일 없음·JSON 파싱 실패·필드 없음 → 해당 출처 건너뜀 (graceful, throw 0).
   *
   * CRITICAL(신뢰경계):
   *   - McpServerInfo.detail은 화이트리스트 마스킹된 값만 — 시크릿 0.
   *   - env/args/url 전체/headers는 절대 미포함.
   *   - ~/.claude.json·.mcp.json는 읽기만 — 수정 금지.
   */
  listMcpServers(workspaceRoot: string | null): McpServerInfo[]

  /**
   * MCP 서버 활성화/비활성화.
   *
   * enabled=false → 오버레이에 name 추가.
   * enabled=true  → 오버레이에서 name 제거.
   *
   * 오버레이 경로: <userData>/mcp-disabled.json { disabled: string[] }.
   *
   * @param name    서버 식별자 (비어있으면 false 반환).
   * @param enabled 활성화 여부.
   * @returns       성공 true, 빈 name / 쓰기 실패 false (throw 0).
   *
   * CRITICAL(신뢰경계):
   *   - name 비어있음 검증 필수 (untrusted IPC 입력).
   *   - ~/.claude.json·.mcp.json 수정 금지 — userData 오버레이만 기록.
   */
  setMcpEnabled(name: string, enabled: boolean): boolean

  /**
   * disabled 서버를 SDK deniedMcpServers 형식으로 반환.
   *
   * @returns [{ serverName: name }, ...] 또는 비었으면 null.
   *
   * 소비: agent-backend의 SDK settings.deniedMcpServers에 spread.
   * 이 모듈은 값 반환만 — SDK 미접촉.
   */
  deniedMcpServers(): { serverName: string }[] | null
}

// ── 헬퍼: JSON 파일 안전 읽기 ──────────────────────────────────────────────────

/**
 * JSON 파일을 읽어 파싱. 파일 없음·파싱 실패 → null (graceful).
 * CRITICAL(신뢰경계): 파일 내용은 이 함수 밖으로 raw 누출 금지.
 */
function readJson(
  filePath: string,
  readFileFn: (p: string) => string
): Record<string, unknown> | null {
  try {
    const raw = readFileFn(filePath)
    const j: unknown = JSON.parse(raw)
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null
    return j as Record<string, unknown>
  } catch {
    return null
  }
}

// ── 헬퍼: disabled 오버레이 읽기 ─────────────────────────────────────────────

/**
 * disabled 오버레이 파일을 읽어 Set<string>으로 반환.
 * 파일 없음·파싱 실패 → 빈 Set (graceful).
 *
 * 오버레이 형식: { disabled: string[] }
 */
function readDisabled(
  overlayPath: string,
  readFileFn: (p: string) => string
): Set<string> {
  try {
    const raw = readFileFn(overlayPath)
    const j: unknown = JSON.parse(raw)
    const list = (j as Record<string, unknown>)?.disabled
    if (!Array.isArray(list)) return new Set()
    return new Set(list.filter((s): s is string => typeof s === 'string'))
  } catch {
    return new Set()
  }
}

// ── 헬퍼: 🔴 마스킹 (화이트리스트 방식 — 이 모듈의 존재 이유) ──────────────────

/**
 * MCP 서버 config에서 transport와 마스킹된 detail을 산출한다.
 *
 * 🔴 CRITICAL(신뢰경계 — 절대 규칙):
 *   - stdio (command가 string):
 *     transport='stdio'. detail = basename(command)만.
 *     **args 전체 생략. env 객체 절대 미접촉(읽지도 말 것).**
 *   - http/sse (url이 string):
 *     transport = type==='sse' ? 'sse' : 'http'.
 *     detail = new URL(url).host만 (host = hostname[:port]).
 *     **URL 파싱 throw → detail='' (raw fallback 절대 금지).**
 *     userinfo·path·query·hash·headers 전부 버림.
 *   - 그 외/unknown:
 *     transport='unknown', detail=''.
 *
 * 절대 금지:
 *   - config.env / config.args / config.headers를 읽거나 detail에 넣는 것.
 *   - 전체 url / 전체 command를 detail에 넣는 것.
 *   - 토큰·시크릿을 어떤 필드에든 넣는 것.
 */
function describe(
  config: unknown
): { transport: McpServerInfo['transport']; detail: string } {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { transport: 'unknown', detail: '' }
  }

  const c = config as Record<string, unknown>

  // stdio: command가 string → basename만 (args·env 절대 미접촉)
  if (typeof c.command === 'string') {
    // basename은 node:path.basename — Windows 경로(C:\a\b\node.exe)도 처리
    // 단, node:path는 플랫폼별이므로 POSIX·Win 모두 처리하는 basename 계산.
    const cmd = c.command
    // Windows 역슬래시와 POSIX 슬래시 모두 지원
    const base = cmd.replace(/\\/g, '/').split('/').pop() ?? cmd
    return { transport: 'stdio', detail: base || cmd }
  }

  // http/sse: url이 string → host만 (URL 파싱 실패 → detail='')
  if (typeof c.url === 'string') {
    const transport: McpServerInfo['transport'] =
      c.type === 'sse' ? 'sse' : 'http'
    try {
      const parsed = new URL(c.url)
      // host = hostname + (port 있으면 :port) — path·query·hash·userinfo 제거
      const detail = parsed.host  // host는 hostname[:port] 형태
      return { transport, detail }
    } catch {
      // URL 파싱 실패 → detail='' (raw fallback 금지)
      return { transport, detail: '' }
    }
  }

  // 그 외/unknown
  return { transport: 'unknown', detail: '' }
}

// ── 헬퍼: 서버맵 수집 ────────────────────────────────────────────────────────

/**
 * servers 객체(mcpServers map)에서 McpServerInfo[]를 수집해 out에 추가.
 * 각 서버에 describe()로 마스킹된 transport/detail을 산출한다.
 *
 * CRITICAL(신뢰경계): detail은 describe()가 화이트리스트 마스킹 후 반환 — 시크릿 0.
 */
function collect(
  servers: unknown,
  origin: McpServerInfo['origin'],
  disabled: Set<string>,
  out: McpServerInfo[]
): void {
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return

  for (const [name, cfg] of Object.entries(servers as Record<string, unknown>)) {
    // 🔴 마스킹: describe()가 화이트리스트 방식으로 transport·detail 산출
    const { transport, detail } = describe(cfg)
    out.push({
      name,
      scope: origin === 'user' ? 'global' : 'local',
      origin,
      transport,
      detail,
      enabled: !disabled.has(name),
    })
  }
}

// ── 팩토리 함수 ─────────────────────────────────────────────────────────────

/**
 * McpStore 인스턴스를 생성한다.
 *
 * @param deps 의존성 주입 (생략 시 프로덕션 기본값).
 *
 * 기본 deps:
 *   - homedir:     os.homedir()
 *   - getUserData: app.getPath('userData')  ← electron ready 이후에만 유효
 *   - readFile:    node:fs.readFileSync
 *   - writeFile:   node:fs.writeFileSync
 *   - mkdirSync:   node:fs.mkdirSync
 *
 * 테스트 주입 예시:
 *   createMcpStore({ homedir: () => '/home/test', readFile: mockRead, ... })
 *
 * CRITICAL(신뢰경계):
 *   - homedir/userData는 main이 결정 — renderer가 경로를 지정할 수 없다.
 *   - IPC 핸들러는 경로를 전달하지 않고 앱 부트 시 초기화된 store 인스턴스를 사용.
 *   - ~/.claude.json·.mcp.json는 읽기만 — 쓰기 금지.
 *   - 오버레이는 userData(앱 전용)에만 기록.
 */
export function createMcpStore(deps?: McpDeps): McpStore {
  // ── 경로/함수 결정 ──────────────────────────────────────────────────────────
  // CRITICAL: electron이 없는 테스트 환경에서 app.getPath()를 호출하면 crash.
  // deps가 주입된 경우 app 호출을 우회한다.

  const homedirFn: () => string = deps?.homedir ?? (() => nodeHomedir())

  const getUserDataFn: () => string =
    deps?.getUserData ?? (() => app.getPath('userData'))

  const readFileFn =
    deps?.readFile ?? ((filePath: string) => nodeReadFileSync(filePath, 'utf8'))

  const writeFileFn =
    deps?.writeFile ??
    ((filePath: string, content: string) => nodeWriteFileSync(filePath, content, 'utf8'))

  const mkdirSyncFn =
    deps?.mkdirSync ?? ((dir: string) => nodeMkdirSync(dir, { recursive: true }))

  // ── 경로 계산 ───────────────────────────────────────────────────────────────

  function getClaudeJsonPath(): string {
    return join(homedirFn(), '.claude.json')
  }

  function getOverlayPath(): string {
    return join(getUserDataFn(), 'mcp-disabled.json')
  }

  // ── listMcpServers ─────────────────────────────────────────────────────────

  function listMcpServers(workspaceRoot: string | null): McpServerInfo[] {
    const overlayPath = getOverlayPath()
    const disabled = readDisabled(overlayPath, readFileFn)
    const out: McpServerInfo[] = []

    // 출처 1: ~/.claude.json의 mcpServers → origin='user', scope='global'
    // 출처 2: ~/.claude.json의 projects[workspaceRoot].mcpServers → origin='local', scope='local'
    const claudeJson = readJson(getClaudeJsonPath(), readFileFn)
    if (claudeJson) {
      // 출처 1: user — all projects 전역
      collect(claudeJson.mcpServers, 'user', disabled, out)

      // 출처 2: local — workspaceRoot 있을 때만 (private to this project)
      if (workspaceRoot && workspaceRoot.trim()) {
        const projects = claudeJson.projects
        if (projects && typeof projects === 'object' && !Array.isArray(projects)) {
          const projectsMap = projects as Record<string, unknown>
          // workspaceRoot 경로 키 매칭: 정확히 일치하는 키만 (원본은 ancestorDirs도 탐색하지만
          // 명세에서 "단순 매칭"으로 범위 한정)
          const entry = findProjectEntry(projectsMap, workspaceRoot)
          if (entry) {
            collect(entry.mcpServers, 'local', disabled, out)
          }
        }
      }
    }

    // 출처 3: <workspaceRoot>/.mcp.json → origin='project', scope='local'
    // workspaceRoot 있을 때만. 단일 파일 — 부모 디렉토리 스캔 비범위.
    if (workspaceRoot && workspaceRoot.trim()) {
      const mcpJsonPath = join(workspaceRoot, '.mcp.json')
      const mcpJson = readJson(mcpJsonPath, readFileFn)
      if (mcpJson) {
        // .mcp.json: mcpServers 키가 있으면 그것을, 없으면 루트 자체를 서버맵으로 처리
        const servers = mcpJson.mcpServers ?? mcpJson
        collect(servers, 'project', disabled, out)
      }
    }

    // origin rank 정렬: user(0)→project(1)→local(2), 동 rank 내 name 알파벳 정렬.
    return out.sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin]
    )
  }

  // ── setMcpEnabled ─────────────────────────────────────────────────────────

  function setMcpEnabled(name: string, enabled: boolean): boolean {
    // CRITICAL(신뢰경계): 빈 name 거부 (untrusted IPC 입력)
    if (typeof name !== 'string' || name.trim().length === 0) {
      return false
    }

    const overlayPath = getOverlayPath()
    const set = readDisabled(overlayPath, readFileFn)

    if (enabled) {
      set.delete(name)
    } else {
      set.add(name)
    }

    // 오버레이 파일 쓰기 (userData 전용 — ~/.claude.json·.mcp.json 미접촉)
    try {
      const userDataDir = getUserDataFn()
      mkdirSyncFn(userDataDir)
      writeFileFn(overlayPath, JSON.stringify({ disabled: [...set].sort() }, null, 2))
      return true
    } catch {
      // 쓰기 실패 → graceful false (크래시 금지)
      return false
    }
  }

  // ── deniedMcpServers ───────────────────────────────────────────────────────

  function deniedMcpServers(): { serverName: string }[] | null {
    const overlayPath = getOverlayPath()
    const set = readDisabled(overlayPath, readFileFn)

    if (set.size === 0) return null

    return [...set].map(serverName => ({ serverName }))
  }

  // ── 공개 인터페이스 반환 ──────────────────────────────────────────────────
  return { listMcpServers, setMcpEnabled, deniedMcpServers }
}

// ── 헬퍼: projects 맵에서 workspaceRoot 항목 찾기 ───────────────────────────

/**
 * ~/.claude.json projects 맵에서 workspaceRoot에 해당하는 항목을 찾는다.
 * 경로 구분자 정규화(\ → /) + 대소문자 무감각 매칭.
 * 정확히 일치하는 키만 탐색 (부모 디렉토리 스캔은 비범위).
 *
 * 원본 mcp.ts의 findProjectEntry 간소화 버전.
 */
function findProjectEntry(
  projects: Record<string, unknown>,
  workspaceRoot: string
): { mcpServers?: unknown } | null {
  if (!workspaceRoot) return null

  const norm = (s: string): string =>
    s.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()

  const targetNorm = norm(workspaceRoot)

  for (const [key, val] of Object.entries(projects)) {
    if (norm(key) === targetNorm) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return val as { mcpServers?: unknown }
      }
    }
  }

  return null
}
