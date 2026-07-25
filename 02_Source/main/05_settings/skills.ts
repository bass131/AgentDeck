/**
 * settings/skills.ts — 스킬 목록 스캔 + disabled 오버레이 영속화 (P5a)
 *
 * 원본: AgentCodeGUI/src/main/skills.ts 미러 (설계 적응 + deps 주입 패턴 적용).
 *
 * 설계 원칙:
 *   1. **electron import 0** — homedir·userData·fs를 주입받아 Vitest에서 직접 테스트 가능.
 *   2. **주입형 deps** — readdir·readFile·writeFile·mkdirSync을 인자로 받아 mock 가능.
 *      기본값은 실 node:fs + os.homedir() + app.getPath('userData').
 *   3. **동기 API** — 스킬 스캔/읽기/쓰기는 짧은 동기 호출(IPC hot-path 아님,
 *      Settings 탭 열기 시 1회 — sqlite 동기 제약과 동일 패턴).
 *   4. **graceful** — 디렉토리 없음·읽기 실패 → 해당 scope 빈 배열 (throw 0).
 *   5. **신뢰경계(CRITICAL)**:
 *      - SKILL.md에서 name/description만 추출 — 시크릿·토큰·API 키 절대 미포함.
 *      - ~/.claude/skills는 **읽기만** — 절대 수정 금지(사용자 설정 보호).
 *      - disabled 오버레이는 userData(앱 전용)에만 기록.
 *      - name은 setSkillEnabled에서 비어있음 검증 후만 사용 (untrusted IPC 입력).
 *
 * IPC 등록: src/main/00_ipc/index.ts 에서 SKILL_LIST·SKILL_SET_ENABLED 채널에 등록.
 * 소비: renderer SettingsModal SkillView.
 * 백엔드 통합: disabledSkillOverrides() → P5a backend의 SDK settings.skillOverrides에 spread.
 *   (이 모듈은 값만 반환 — SDK 미접촉. agent-backend 소관.)
 */

import {
  readdirSync as nodeReaddirSync,
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  mkdirSync as nodeMkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir as nodeHomedir } from 'node:os'
import { app } from 'electron'
import type { SkillInfo } from '../../shared/ipc-contract'

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * createSkillsStore에 주입할 의존성.
 * 테스트 환경에서 electron/fs를 mock으로 대체한다.
 */
export interface SkillsDeps {
  /** os.homedir() 반환값. 기본: 실 os.homedir(). */
  homedir?: () => string
  /** app.getPath('userData') 반환값. 기본: 실 app.getPath('userData'). */
  getUserData?: () => string
  /**
   * 디렉토리 엔트리 목록 (동기). ENOENT 등 → throw.
   * 기본: readdirSync(dir, { withFileTypes: true }).
   */
  readdir?: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
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
 * SkillsStore — 스킬 스캔 + disabled 오버레이 관리.
 *
 * listSkills(workspaceRoot): 전체 스킬 목록 반환.
 * setSkillEnabled(name, enabled): 활성화/비활성화 영속.
 * disabledSkillOverrides(): SDK skillOverrides 형식으로 반환.
 */
export interface SkillsStore {
  /**
   * global + local 스킬을 스캔하여 SkillInfo[] 반환.
   *
   * - global: <homedir>/.claude/skills/* 스캔.
   * - local: workspaceRoot 있으면 <workspaceRoot>/.claude/skills/* 스캔.
   * - enabled: disabled 오버레이에 name이 없으면 true.
   * - 이름순 정렬. 디렉토리 없음/읽기 실패 → 해당 scope 빈 배열(graceful, throw 0).
   *
   * CRITICAL(신뢰경계): 응답 SkillInfo는 name/description/scope/enabled만 — 경로·시크릿 0.
   */
  listSkills(workspaceRoot: string | null): SkillInfo[]

  /**
   * 스킬 활성화/비활성화.
   *
   * enabled=false → 오버레이에 name 추가.
   * enabled=true  → 오버레이에서 name 제거.
   *
   * 오버레이 경로: <userData>/skills-disabled.json { disabled: string[] }.
   *
   * @param name    스킬 식별자 (비어있으면 false 반환).
   * @param enabled 활성화 여부.
   * @returns       성공 true, 빈 name / 쓰기 실패 false (throw 0).
   *
   * CRITICAL(신뢰경계):
   *   - name 비어있음 검증 필수 (untrusted IPC 입력).
   *   - ~/.claude/skills는 수정 금지 — userData 오버레이만 기록.
   */
  setSkillEnabled(name: string, enabled: boolean): boolean

  /**
   * disabled 스킬을 SDK skillOverrides 형식으로 반환.
   *
   * @returns { [name]: 'off' } 또는 비었으면 null.
   *
   * 소비: agent-backend의 SDK settings.skillOverrides에 spread.
   * 이 모듈은 값 반환만 — SDK 미접촉.
   */
  disabledSkillOverrides(): Record<string, 'off'> | null
}

// ── 헬퍼: frontmatter 파서 ───────────────────────────────────────────────────

/**
 * 최소 YAML frontmatter 파서.
 * SKILL.md 첫 줄이 '---'이면 다음 '---'까지 줄들에서 key: value 파싱.
 * name·description만 추출. 전체 YAML 파서 불필요(의존성 추가 방지).
 *
 * 원본 AgentCodeGUI/src/main/skills.ts parseFrontmatter 기반 최소 구현.
 *
 * CRITICAL(신뢰경계): name/description만 읽음 — 시크릿·토큰 추출 불가.
 */
function parseFrontmatter(text: string): { name?: string; description?: string } {
  // BOM 제거 (U+FEFF)
  const body = text.replace(/^\uFEFF/, '')

  // frontmatter 펜스 매칭: --- \n ... \n ---
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)
  if (!m) return {}

  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    let v = kv[2].trim()
    // 따옴표 한 겹 제거 (""·'' 모두)
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    // 첫 번째 occurrence 우선 (이후 중복 무시)
    if (!(kv[1] in out)) out[kv[1]] = v
  }

  return { name: out.name, description: out.description }
}

// ── 헬퍼: 단일 scope 디렉토리 스캔 ──────────────────────────────────────────

/**
 * skillsDir 아래의 서브디렉토리를 스캔하여 SkillInfo[]를 반환한다.
 *
 * 각 서브디렉토리의 SKILL.md를 읽어 frontmatter에서 name·description 추출.
 * 디렉토리 없음/읽기 실패 → 빈 배열(graceful).
 *
 * CRITICAL(신뢰경계): name/description만 추출 — 경로는 내부에서만 사용하고 SkillInfo에 미포함.
 */
function discoverSkills(
  skillsDir: string,
  scope: 'global' | 'local',
  disabled: Set<string>,
  deps: {
    readdir: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
    readFile: (filePath: string) => string
  }
): SkillInfo[] {
  // 디렉토리 읽기 시도 (ENOENT 등 → graceful 빈 배열)
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = deps.readdir(skillsDir)
  } catch {
    return []
  }

  const skills: SkillInfo[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue

    // 각 서브디렉토리의 SKILL.md 읽기 시도
    const skillMdPath = join(skillsDir, e.name, 'SKILL.md')
    let raw: string
    try {
      raw = deps.readFile(skillMdPath)
    } catch {
      // SKILL.md 없는 서브디렉토리 → 스킬 아님, 건너뜀
      continue
    }

    // frontmatter 파싱 (name/description만)
    const fm = parseFrontmatter(raw)
    const name = fm.name?.trim() || e.name  // frontmatter name 없으면 디렉토리명 폴백

    skills.push({
      name,
      description: fm.description?.trim() || '',
      scope,
      enabled: !disabled.has(name),
    })
  }

  return skills
}

// ── 헬퍼: 오버레이 읽기 ─────────────────────────────────────────────────────

/**
 * disabled 오버레이 파일을 읽어 Set<string>으로 반환.
 * 파일 없음·파싱 실패 → 빈 Set (graceful).
 *
 * 오버레이 형식: { disabled: string[] }
 */
function readDisabled(
  overlayPath: string,
  readFileFn: (filePath: string) => string
): Set<string> {
  try {
    const raw = readFileFn(overlayPath)
    const j: unknown = JSON.parse(raw)
    const list = (j as Record<string, unknown>)?.disabled
    if (!Array.isArray(list)) return new Set()
    return new Set(
      list.filter((s): s is string => typeof s === 'string')
    )
  } catch {
    return new Set()
  }
}

// ── 팩토리 함수 ─────────────────────────────────────────────────────────────

/**
 * SkillsStore 인스턴스를 생성한다.
 *
 * @param deps 의존성 주입 (생략 시 프로덕션 기본값).
 *
 * 기본 deps:
 *   - homedir:     os.homedir()
 *   - getUserData: app.getPath('userData')  ← electron ready 이후에만 유효
 *   - readdir:     node:fs.readdirSync
 *   - readFile:    node:fs.readFileSync
 *   - writeFile:   node:fs.writeFileSync
 *   - mkdirSync:   node:fs.mkdirSync
 *
 * 테스트 주입 예시:
 *   createSkillsStore({ homedir: () => '/home/test', readFile: mockRead, ... })
 *
 * CRITICAL(신뢰경계):
 *   - homedir/userData는 main이 결정 — renderer가 경로를 지정할 수 없다.
 *   - IPC 핸들러는 경로를 전달하지 않고 앱 부트 시 초기화된 store 인스턴스를 사용.
 *   - ~/.claude/skills는 읽기만 — 쓰기 금지.
 *   - 오버레이는 userData(앱 전용)에만 기록.
 */
export function createSkillsStore(deps?: SkillsDeps): SkillsStore {
  // ── 경로/함수 결정 ──────────────────────────────────────────────────────────
  // CRITICAL: electron이 없는 테스트 환경에서 app.getPath()를 호출하면 crash.
  // deps가 주입된 경우 app 호출을 우회한다.

  const homedirFn: () => string = deps?.homedir
    ?? (() => nodeHomedir())

  const getUserDataFn: () => string = deps?.getUserData
    ?? (() => app.getPath('userData'))

  const readdirFn = deps?.readdir
    ?? ((dir: string) => nodeReaddirSync(dir, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean }>)

  const readFileFn = deps?.readFile
    ?? ((filePath: string) => nodeReadFileSync(filePath, 'utf8'))

  const writeFileFn = deps?.writeFile
    ?? ((filePath: string, content: string) => nodeWriteFileSync(filePath, content, 'utf8'))

  const mkdirSyncFn = deps?.mkdirSync
    ?? ((dir: string) => nodeMkdirSync(dir, { recursive: true }))

  // ── 경로 상수 (런타임 계산 — electron ready 이후) ──────────────────────────

  function getGlobalSkillsDir(): string {
    return join(homedirFn(), '.claude', 'skills')
  }

  function getOverlayPath(): string {
    return join(getUserDataFn(), 'skills-disabled.json')
  }

  // ── listSkills ────────────────────────────────────────────────────────────

  function listSkills(workspaceRoot: string | null): SkillInfo[] {
    const overlayPath = getOverlayPath()
    const disabled = readDisabled(overlayPath, readFileFn)

    // global: <homedir>/.claude/skills/*
    const globalSkillsDir = getGlobalSkillsDir()
    const globalSkills = discoverSkills(globalSkillsDir, 'global', disabled, {
      readdir: readdirFn,
      readFile: readFileFn,
    })

    // local: <workspaceRoot>/.claude/skills/* (workspaceRoot 있을 때만)
    let localSkills: SkillInfo[] = []
    if (workspaceRoot && workspaceRoot.trim()) {
      const localSkillsDir = join(workspaceRoot, '.claude', 'skills')
      localSkills = discoverSkills(localSkillsDir, 'local', disabled, {
        readdir: readdirFn,
        readFile: readFileFn,
      })
    }

    // global + local 합산, 이름순 정렬
    return [...globalSkills, ...localSkills].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  // ── setSkillEnabled ───────────────────────────────────────────────────────

  function setSkillEnabled(name: string, enabled: boolean): boolean {
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

    // 오버레이 파일 쓰기 (userData 전용 — ~/.claude 미접촉)
    try {
      // userData 디렉토리가 없을 수 있으므로 먼저 생성
      const userDataDir = getUserDataFn()
      mkdirSyncFn(userDataDir)
      writeFileFn(overlayPath, JSON.stringify({ disabled: [...set].sort() }, null, 2))
      return true
    } catch {
      // 쓰기 실패 → graceful false (크래시 금지)
      return false
    }
  }

  // ── disabledSkillOverrides ────────────────────────────────────────────────

  function disabledSkillOverrides(): Record<string, 'off'> | null {
    const overlayPath = getOverlayPath()
    const set = readDisabled(overlayPath, readFileFn)

    if (set.size === 0) return null

    const out: Record<string, 'off'> = {}
    for (const name of set) {
      out[name] = 'off'
    }
    return out
  }

  // ── 공개 인터페이스 반환 ──────────────────────────────────────────────────
  return { listSkills, setSkillEnabled, disabledSkillOverrides }
}
