import { readFile as nodeReadFile, writeFile as nodeWriteFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { UiPrefs } from '../shared/ipcContract'

export interface PrefsDeps {
  prefsPath?: string
  readFile?: () => Promise<string>
  writeFile?: (content: string) => Promise<void>
}

export interface PrefsStore {
  getAll(): Promise<UiPrefs>
  set(key: string, value: unknown): Promise<boolean>
}

export function createPrefsStore(deps?: PrefsDeps): PrefsStore {
  let resolvedPath: string
  if (deps?.prefsPath) {
    resolvedPath = deps.prefsPath
  } else if (deps?.readFile || deps?.writeFile) {
    resolvedPath = '<injected>'
  } else {
    resolvedPath = join(app.getPath('userData'), 'ui-prefs.json')
  }

  const readFileFn: () => Promise<string> = deps?.readFile
    ?? (() => nodeReadFile(resolvedPath, 'utf8'))

  const writeFileFn: (content: string) => Promise<void> = deps?.writeFile
    ?? ((content: string) => nodeWriteFile(resolvedPath, content, 'utf8'))

  let cache: UiPrefs | null = null

  async function getAll(): Promise<UiPrefs> {
    if (cache !== null) return cache

    let raw: string
    try {
      raw = await readFileFn()
    } catch {
      cache = {}
      return cache
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        cache = parsed as UiPrefs
      } else {
        cache = {}
      }
    } catch {
      cache = {}
    }

    return cache
  }

  async function set(key: string, value: unknown): Promise<boolean> {
    if (typeof key !== 'string' || key.length === 0) {
      return false
    }

    if (cache === null) {
      await getAll()
    }

    cache = { ...cache!, [key]: value }

    try {
      await writeFileFn(JSON.stringify(cache, null, 2))
    } catch {
    }

    return true
  }

  return { getAll, set }
}
