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
import { parseFrontmatter } from './frontmatter'
import { createDisabledOverlay } from './disabledOverlay'

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

  const overlay = createDisabledOverlay('skills-disabled.json', {
    getUserData: getUserDataFn,
    readFile: readFileFn,
    writeFile: writeFileFn,
    mkdirSync: mkdirSyncFn,
  })

  function listSkills(workspaceRoot: string | null): SkillInfo[] {
    const disabled = overlay.readDisabled()

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
    return overlay.setEnabled(name, enabled)
  }

  function disabledSkillOverrides(): Record<string, 'off'> | null {
    const set = overlay.readDisabled()

    if (set.size === 0) return null

    const out: Record<string, 'off'> = {}
    for (const name of set) {
      out[name] = 'off'
    }
    return out
  }

  return { listSkills, setSkillEnabled, disabledSkillOverrides }
}
