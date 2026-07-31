import {
  readdirSync as nodeReaddirSync,
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  mkdirSync as nodeMkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir as nodeHomedir } from 'node:os'
import { app } from 'electron'
import type { SkillInfo } from '../../shared/ipcContract'

export interface SkillsDeps {
  homedir?: () => string
  getUserData?: () => string
  readdir?: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
  readFile?: (filePath: string) => string
  writeFile?: (filePath: string, content: string) => void
  mkdirSync?: (dir: string) => void
}

export interface SkillsStore {
  listSkills(workspaceRoot: string | null): SkillInfo[]

  setSkillEnabled(name: string, enabled: boolean): boolean

  disabledSkillOverrides(): Record<string, 'off'> | null
}

function parseFrontmatter(text: string): { name?: string; description?: string } {
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

  return { name: out.name, description: out.description }
}

function discoverSkills(
  skillsDir: string,
  scope: 'global' | 'local',
  disabled: Set<string>,
  deps: {
    readdir: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
    readFile: (filePath: string) => string
  }
): SkillInfo[] {
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = deps.readdir(skillsDir)
  } catch {
    return []
  }

  const skills: SkillInfo[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue

    const skillMdPath = join(skillsDir, e.name, 'SKILL.md')
    let raw: string
    try {
      raw = deps.readFile(skillMdPath)
    } catch {
      continue
    }

    const fm = parseFrontmatter(raw)
    const name = fm.name?.trim() || e.name

    skills.push({
      name,
      description: fm.description?.trim() || '',
      scope,
      enabled: !disabled.has(name),
    })
  }

  return skills
}

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

export function createSkillsStore(deps?: SkillsDeps): SkillsStore {

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

  function getGlobalSkillsDir(): string {
    return join(homedirFn(), '.claude', 'skills')
  }

  function getOverlayPath(): string {
    return join(getUserDataFn(), 'skills-disabled.json')
  }

  function listSkills(workspaceRoot: string | null): SkillInfo[] {
    const overlayPath = getOverlayPath()
    const disabled = readDisabled(overlayPath, readFileFn)

    const globalSkillsDir = getGlobalSkillsDir()
    const globalSkills = discoverSkills(globalSkillsDir, 'global', disabled, {
      readdir: readdirFn,
      readFile: readFileFn,
    })

    let localSkills: SkillInfo[] = []
    if (workspaceRoot && workspaceRoot.trim()) {
      const localSkillsDir = join(workspaceRoot, '.claude', 'skills')
      localSkills = discoverSkills(localSkillsDir, 'local', disabled, {
        readdir: readdirFn,
        readFile: readFileFn,
      })
    }

    return [...globalSkills, ...localSkills].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  function setSkillEnabled(name: string, enabled: boolean): boolean {
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

    try {
      const userDataDir = getUserDataFn()
      mkdirSyncFn(userDataDir)
      writeFileFn(overlayPath, JSON.stringify({ disabled: [...set].sort() }, null, 2))
      return true
    } catch {
      return false
    }
  }

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

  return { listSkills, setSkillEnabled, disabledSkillOverrides }
}
