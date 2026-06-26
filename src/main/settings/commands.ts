/**
 * settings/commands.ts — 슬래시 커맨드 목록 스캔 (P10 — Composer 슬래시 자동완성)
 *
 * 설계 원칙(src/main/settings/skills.ts의 createSkillsStore 주입 패턴을 그대로 따름):
 *   1. **electron import 0** — homedir·fs를 주입받아 Vitest에서 직접 테스트 가능.
 *   2. **주입형 deps** — readdir·readFile을 인자로 받아 mock 가능.
 *      기본값은 실 node:fs + os.homedir().
 *   3. **동기 API** — 커맨드 스캔/읽기는 짧은 동기 호출.
 *   4. **graceful** — 디렉토리 없음·읽기 실패 → 해당 scope 빈 배열 (throw 0). 빌트인은 항상 반환.
 *   5. **신뢰경계(CRITICAL)**:
 *      - .md에서 name(파일명)/description/argHint(frontmatter)만 추출.
 *      - .md 본문·경로·allowed-tools·!bash·시크릿·토큰 절대 미노출.
 *      - ~/.claude/commands·<ws>/.claude/commands는 **읽기만** — 절대 수정 금지.
 *      - name은 파일명에서 .md 제거한 순수 식별자만 — 경로 구분자 포함 금지.
 *
 * IPC 등록: src/main/ipc/index.ts에서 COMMAND_LIST 채널에 등록.
 * 소비: renderer Composer 슬래시 팔레트.
 */

import {
  readdirSync as nodeReaddirSync,
  readFileSync as nodeReadFileSync,
} from 'node:fs'
import { join, extname, basename } from 'node:path'
import { homedir as nodeHomedir } from 'node:os'
import type { SlashCommandInfo } from '../../shared/ipc-contract'

// ── 빌트인 슬래시 커맨드 상수 ──────────────────────────────────────────────────

/**
 * 작동 보증 빌트인 슬래시 커맨드 (scope='builtin', 항상 반환·fs 스캔 무의존).
 *
 * **"genuinely runs"만 표시**(원본 AgentCodeGUI Chat.tsx SLASH_COMMANDS 철학 정렬):
 *   - clear·ask: 앱이 클라이언트 인터셉트(Conversation.tsx) — 작동.
 *   - compact·init·review·security-review: SDK supportedCommands에 포함 → raw 전송 시
 *     엔진이 실제 실행 — 작동.
 *   - loop·schedule·goal: **REPL 기본 모드(ADR-024)**에서 지속세션으로 SDK에 통과 →
 *     Claude가 내장 크론으로 자기제어(실제 작동). 첫 run의 supportedCommands 캡처 전에도
 *     팔레트에 즉시 뜨도록 큐레이션에 포함(캡처 시 mergeSlashCommands가 store 우선 dedup).
 *
 * **제거됨(Iteration 3 / Opus 편향차단 평가, 2026-06-24)**: cost·help·model·agents·
 *   mcp·memory는 Claude Code CLI 앱레벨 커맨드라 **엔진 supportedCommands에 없고**
 *   우리 앱도 인터셉트하지 않는다 → raw 프롬프트로 엔진에 가면 모델이 텍스트로 처리,
 *   실제로 안 돈다("거짓 광고"). cost→ContextStrip 게이지·model→모델 Picker·
 *   mcp→Settings MCP 탭 등 GUI 동선이 이미 별도로 존재. (포괄적 동적 목록은 SDK
 *   supportedCommands 캡처가 정답이나 probe query 비용·원본 초과(ADR) 검토 필요 → 후속.)
 *
 * 정렬: name 알파벳순.
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandInfo[] = [
  {
    name: 'ask',
    description: '본 대화와 분리된 임시 질문 · 저장 안 됨',
    scope: 'builtin',
  },
  {
    name: 'clear',
    description: '대화 기록과 컨텍스트 초기화',
    scope: 'builtin',
  },
  {
    name: 'compact',
    description: '대화를 요약해 컨텍스트 절약',
    scope: 'builtin',
  },
  {
    name: 'goal',
    description: '목표를 정하고 자율적으로 추진 (REPL 지속세션)',
    scope: 'builtin',
  },
  {
    name: 'init',
    description: '코드베이스를 분석해 CLAUDE.md 생성',
    scope: 'builtin',
  },
  {
    name: 'loop',
    description: '프롬프트를 주기적으로 반복 실행 (REPL 지속세션)',
    scope: 'builtin',
  },
  {
    name: 'review',
    description: '변경 사항 코드 리뷰',
    scope: 'builtin',
  },
  {
    name: 'schedule',
    description: '작업을 예약 실행 (REPL 지속세션)',
    scope: 'builtin',
  },
  {
    name: 'security-review',
    description: '변경 사항의 보안 취약점 검토',
    scope: 'builtin',
  },
]

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * createCommandsStore에 주입할 의존성.
 * 테스트 환경에서 electron/fs를 mock으로 대체한다.
 */
export interface CommandsDeps {
  /** os.homedir() 반환값. 기본: 실 os.homedir(). */
  homedir?: () => string
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
}

// ── 스토어 인터페이스 ────────────────────────────────────────────────────────

/**
 * CommandsStore — 슬래시 커맨드 목록 스캔.
 */
export interface CommandsStore {
  /**
   * 빌트인 + 커스텀(user·project) 슬래시 커맨드 목록 반환.
   *
   * - builtin: BUILTIN_SLASH_COMMANDS 상수 (항상 반환).
   * - user: <homedir>/.claude/commands/*.md 스캔.
   * - project: workspaceRoot 있으면 <workspaceRoot>/.claude/commands/*.md 스캔.
   * - 정렬: builtin → project → user 순, 각 그룹 내 name 알파벳순.
   * - 디렉토리 없음/읽기 실패 → 해당 scope 빈 배열(graceful, throw 0).
   *
   * CRITICAL(신뢰경계):
   *   - name: 파일명에서 .md 제거한 순수 식별자 — 경로·'..'·절대경로 포함 금지.
   *   - description: frontmatter description 필드만 (없으면 빈 문자열).
   *   - argHint: frontmatter argument-hint 필드만 (없으면 undefined).
   *   - .md 본문·allowed-tools·!bash·시크릿·경로 절대 미포함.
   *
   * @param workspaceRoot 현재 워크스페이스 절대경로 (null이면 project 스캔 생략).
   */
  listSlashCommands(workspaceRoot: string | null): SlashCommandInfo[]
}

// ── 헬퍼: frontmatter 파서 ───────────────────────────────────────────────────

/**
 * 최소 YAML frontmatter 파서 (skills.ts parseFrontmatter 기반).
 * .md 첫 줄이 '---'이면 다음 '---'까지 줄들에서 key: value 파싱.
 * description·argument-hint만 추출.
 *
 * CRITICAL(신뢰경계):
 *   - description·argument-hint만 읽음 — 본문·시크릿·allowed-tools 추출 불가.
 *   - frontmatter 펜스 밖 내용은 완전히 무시.
 */
function parseFrontmatter(text: string): { description?: string; argumentHint?: string } {
  // BOM 제거 (﻿ = U+FEFF)
  const body = text.replace(/^﻿/, '')

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

  return {
    description: out['description'],
    argumentHint: out['argument-hint'],
  }
}

// ── 헬퍼: 단일 scope 디렉토리 스캔 ──────────────────────────────────────────

/**
 * commandsDir 아래의 .md 파일을 스캔하여 SlashCommandInfo[]를 반환한다.
 *
 * 각 .md 파일에서:
 *   - name: 파일명에서 .md 제거 (basename).
 *   - description: frontmatter description 필드 (없으면 빈 문자열).
 *   - argHint: frontmatter argument-hint 필드 (없으면 undefined).
 *
 * CRITICAL(신뢰경계):
 *   - .md 파일만 처리 (extname 검사).
 *   - name은 파일명에서 .md 제거한 순수 식별자 — 경로 포함 불가 (basename 사용).
 *   - frontmatter description/argument-hint만 추출 — 본문·시크릿 절대 미포함.
 */
function discoverCommands(
  commandsDir: string,
  scope: 'user' | 'project',
  deps: {
    readdir: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
    readFile: (filePath: string) => string
  }
): SlashCommandInfo[] {
  // 디렉토리 읽기 시도 (ENOENT 등 → graceful 빈 배열)
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = deps.readdir(commandsDir)
  } catch {
    return []
  }

  const commands: SlashCommandInfo[] = []
  for (const e of entries) {
    // 디렉토리는 건너뜀 — .md 파일만 처리
    if (e.isDirectory()) continue
    // .md 확장자만 처리
    if (extname(e.name).toLowerCase() !== '.md') continue

    // name: 파일명에서 .md 제거 (basename → 경로 탈출 불가)
    const name = basename(e.name, '.md')
    if (!name) continue

    // .md 파일 내용 읽기 시도
    const filePath = join(commandsDir, e.name)
    let raw: string
    try {
      raw = deps.readFile(filePath)
    } catch {
      // 읽기 실패 → 해당 파일 건너뜀 (graceful)
      continue
    }

    // frontmatter 파싱 (description·argument-hint만)
    const fm = parseFrontmatter(raw)

    const info: SlashCommandInfo = {
      name,
      description: fm.description?.trim() ?? '',
      scope,
    }

    // argHint: frontmatter argument-hint 있으면 추가 (없으면 필드 자체 생략)
    if (fm.argumentHint !== undefined) {
      info.argHint = fm.argumentHint.trim()
    }

    commands.push(info)
  }

  return commands
}

// ── 팩토리 함수 ─────────────────────────────────────────────────────────────

/**
 * CommandsStore 인스턴스를 생성한다.
 *
 * @param deps 의존성 주입 (생략 시 프로덕션 기본값).
 *
 * 기본 deps:
 *   - homedir:   os.homedir()
 *   - readdir:   node:fs.readdirSync
 *   - readFile:  node:fs.readFileSync
 *
 * 테스트 주입 예시:
 *   createCommandsStore({ homedir: () => '/home/test', readFile: mockRead, ... })
 *
 * CRITICAL(신뢰경계):
 *   - homedir는 main이 결정 — renderer가 경로를 지정할 수 없다.
 *   - IPC 핸들러는 경로를 전달하지 않고 앱 부트 시 초기화된 store 인스턴스를 사용.
 *   - ~/.claude/commands·<ws>/.claude/commands는 읽기만 — 쓰기 금지.
 */
export function createCommandsStore(deps?: CommandsDeps): CommandsStore {
  // ── 경로/함수 결정 ──────────────────────────────────────────────────────────

  const homedirFn: () => string = deps?.homedir
    ?? (() => nodeHomedir())

  const readdirFn = deps?.readdir
    ?? ((dir: string) => nodeReaddirSync(dir, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean }>)

  const readFileFn = deps?.readFile
    ?? ((filePath: string) => nodeReadFileSync(filePath, 'utf8'))

  // ── 경로 계산 헬퍼 ──────────────────────────────────────────────────────────

  function getUserCommandsDir(): string {
    return join(homedirFn(), '.claude', 'commands')
  }

  function getProjectCommandsDir(workspaceRoot: string): string {
    return join(workspaceRoot, '.claude', 'commands')
  }

  // ── listSlashCommands ─────────────────────────────────────────────────────

  function listSlashCommands(workspaceRoot: string | null): SlashCommandInfo[] {
    // 빌트인 (상수 — fs 스캔 불필요, 항상 반환)
    const builtins: SlashCommandInfo[] = BUILTIN_SLASH_COMMANDS
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))

    // project: <workspaceRoot>/.claude/commands/*.md (workspaceRoot 있을 때만)
    let projectCommands: SlashCommandInfo[] = []
    if (workspaceRoot && workspaceRoot.trim()) {
      const projectDir = getProjectCommandsDir(workspaceRoot)
      projectCommands = discoverCommands(projectDir, 'project', {
        readdir: readdirFn,
        readFile: readFileFn,
      }).sort((a, b) => a.name.localeCompare(b.name))
    }

    // user: <homedir>/.claude/commands/*.md
    const userDir = getUserCommandsDir()
    const userCommands = discoverCommands(userDir, 'user', {
      readdir: readdirFn,
      readFile: readFileFn,
    }).sort((a, b) => a.name.localeCompare(b.name))

    // 정렬: builtin → project → user 순 (각 그룹 내 이미 name 정렬됨)
    return [...builtins, ...projectCommands, ...userCommands]
  }

  // ── 공개 인터페이스 반환 ──────────────────────────────────────────────────
  return { listSlashCommands }
}
