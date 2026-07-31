import { readFile as nodeReadFile, writeFile as nodeWriteFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Profile } from '../shared/ipcContract'

export interface ProfileDeps {
  profilePath?: string
  readFile?: () => Promise<string>
  writeFile?: (content: string) => Promise<void>
}

export interface ProfileStore {
  get(): Promise<Profile | null>

  set(p: Profile): Promise<boolean>
}

function isValidProfile(value: unknown): value is Profile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  if (typeof obj.nickname !== 'string' || obj.nickname.trim().length === 0) {
    return false
  }
  if (typeof obj.color !== 'string') {
    return false
  }
  return true
}

export function createProfileStore(deps?: ProfileDeps): ProfileStore {
  let resolvedPath: string
  if (deps?.profilePath) {
    resolvedPath = deps.profilePath
  } else if (deps?.readFile || deps?.writeFile) {
    resolvedPath = '<injected>'
  } else {
    resolvedPath = join(app.getPath('userData'), 'profile.json')
  }

  const readFileFn: () => Promise<string> = deps?.readFile
    ?? (() => nodeReadFile(resolvedPath, 'utf8'))

  const writeFileFn: (content: string) => Promise<void> = deps?.writeFile
    ?? ((content: string) => nodeWriteFile(resolvedPath, content, 'utf8'))

  type CacheState = 'unloaded' | Profile | null
  let cache: CacheState = 'unloaded'

  async function get(): Promise<Profile | null> {
    if (cache !== 'unloaded') return cache

    let raw: string
    try {
      raw = await readFileFn()
    } catch {
      cache = null
      return null
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      cache = null
      return null
    }

    if (!isValidProfile(parsed)) {
      cache = null
      return null
    }

    cache = { nickname: parsed.nickname, color: parsed.color }
    return cache
  }

  async function set(p: Profile): Promise<boolean> {
    if (!isValidProfile(p)) {
      return false
    }

    const profile: Profile = {
      nickname: p.nickname.trim(),
      color: p.color,
    }

    cache = profile

    try {
      await writeFileFn(JSON.stringify(profile, null, 2))
    } catch {
    }

    return true
  }

  return { get, set }
}
