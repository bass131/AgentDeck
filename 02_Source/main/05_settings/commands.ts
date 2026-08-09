import {
  readdirSync as nodeReaddirSync,
  readFileSync as nodeReadFileSync,
} from 'node:fs'
import { join, extname, basename } from 'node:path'
import { homedir as nodeHomedir } from 'node:os'
import type { SlashCommandInfo } from '../../shared/ipcContract'

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
    description: '프롬프트를 주기적으로 반복 실행 (Claude 자기제어 루프)',
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

export interface CommandsDeps {
  homedir?: () => string
  readdir?: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
  readFile?: (filePath: string) => string
}

export interface CommandsStore {
  listSlashCommands(workspaceRoot: string | null): SlashCommandInfo[]
}

function parseFrontmatter(text: string): { description?: string; argumentHint?: string } {
  const body = text.replace(/^\uFEFF/, '')

  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)
  if (!m) return {}

  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    let v = kv[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!(kv[1] in out)) out[kv[1]] = v
  }

  return {
    description: out['description'],
    argumentHint: out['argument-hint'],
  }
}

const MAX_COMMAND_SCAN_DEPTH = 8

function discoverCommands(
  commandsDir: string,
  scope: 'user' | 'project',
  deps: {
    readdir: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
    readFile: (filePath: string) => string
  }
): SlashCommandInfo[] {
  return discoverCommandsRecursive(commandsDir, scope, '', deps, 0)
}

function discoverCommandsRecursive(
  dir: string,
  scope: 'user' | 'project',
  namespacePrefix: string,
  deps: {
    readdir: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
    readFile: (filePath: string) => string
  },
  depth: number
): SlashCommandInfo[] {
  if (depth > MAX_COMMAND_SCAN_DEPTH) return []

  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = deps.readdir(dir)
  } catch {
    return []
  }

  const commands: SlashCommandInfo[] = []
  for (const e of entries) {
    if (e.isDirectory()) {
      const nested = discoverCommandsRecursive(
        join(dir, e.name),
        scope,
        `${namespacePrefix}${e.name}:`,
        deps,
        depth + 1
      )
      commands.push(...nested)
      continue
    }
    if (extname(e.name).toLowerCase() !== '.md') continue

    const baseName = basename(e.name, '.md')
    if (!baseName) continue
    const name = `${namespacePrefix}${baseName}`

    const filePath = join(dir, e.name)
    let raw: string
    try {
      raw = deps.readFile(filePath)
    } catch {
      continue
    }

    const fm = parseFrontmatter(raw)

    const info: SlashCommandInfo = {
      name,
      description: fm.description?.trim() ?? '',
      scope,
    }

    if (fm.argumentHint !== undefined) {
      info.argHint = fm.argumentHint.trim()
    }

    commands.push(info)
  }

  return commands
}

export function createCommandsStore(deps?: CommandsDeps): CommandsStore {

  const homedirFn: () => string = deps?.homedir
    ?? (() => nodeHomedir())

  const readdirFn = deps?.readdir
    ?? ((dir: string) => nodeReaddirSync(dir, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean }>)

  const readFileFn = deps?.readFile
    ?? ((filePath: string) => nodeReadFileSync(filePath, 'utf8'))

  function getUserCommandsDir(): string {
    return join(homedirFn(), '.claude', 'commands')
  }

  function getProjectCommandsDir(workspaceRoot: string): string {
    return join(workspaceRoot, '.claude', 'commands')
  }

  function listSlashCommands(workspaceRoot: string | null): SlashCommandInfo[] {
    const builtins: SlashCommandInfo[] = BUILTIN_SLASH_COMMANDS
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))

    let projectCommands: SlashCommandInfo[] = []
    if (workspaceRoot && workspaceRoot.trim()) {
      const projectDir = getProjectCommandsDir(workspaceRoot)
      projectCommands = discoverCommands(projectDir, 'project', {
        readdir: readdirFn,
        readFile: readFileFn,
      }).sort((a, b) => a.name.localeCompare(b.name))
    }

    const userDir = getUserCommandsDir()
    const userCommands = discoverCommands(userDir, 'user', {
      readdir: readdirFn,
      readFile: readFileFn,
    }).sort((a, b) => a.name.localeCompare(b.name))

    return [...builtins, ...projectCommands, ...userCommands]
  }

  return { listSlashCommands }
}
