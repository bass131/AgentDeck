import { readFileSync, existsSync } from 'node:fs'
import { join, isAbsolute, relative, sep } from 'node:path'
import { computeDiff } from '../02_fs/diff'
import type { AgentEvent } from '../../shared/agentEvents'
import type { DiffLine } from '../../shared/diffTypes'

const MAX_DIFF_BYTES = 524288

const FILE_CHANGE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

export class FileChangeTracker {
  private _pending = new Map<string, {
    path: string; change: 'add' | 'modify'; baseline: string; absPath: string
  }>()

  private readonly _workspaceRoot: string | undefined

  constructor(workspaceRoot?: string) {
    this._workspaceRoot = workspaceRoot
  }

  record(id: string, name: string, input: unknown): void {
    if (!FILE_CHANGE_TOOLS.has(name)) return

    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    const rawPath =
      typeof inp['file_path'] === 'string' ? inp['file_path'] :
      typeof inp['path'] === 'string' ? inp['path'] :
      typeof inp['notebook_path'] === 'string' ? inp['notebook_path'] :
      ''

    if (!rawPath) return

    const root = this._workspaceRoot
    const abs = isAbsolute(rawPath) ? rawPath : join(root ?? process.cwd(), rawPath)

    let change: 'add' | 'modify' = 'modify'
    let baseline = ''

    try {
      if (existsSync(abs)) {
        if (name === 'Write') change = 'modify'
        baseline = readFileSync(abs, 'utf8')
      } else {
        if (name === 'Write') change = 'add'
      }
    } catch {
    }

    let emitPath: string
    if (!root) {
      emitPath = rawPath
    } else {
      const rel = relative(root, abs)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return
      }
      emitPath = rel.split(sep).join('/')
    }

    this._pending.set(id, { path: emitPath, change, baseline, absPath: abs })
  }

  resolve(id: string, ok: boolean): AgentEvent[] {
    const pending = this._pending.get(id)
    if (!pending) return []
    this._pending.delete(id)

    if (!ok) return []

    let diffLines: DiffLine[] | undefined
    let addCount: number | undefined
    let delCount: number | undefined

    try {
      const afterBuf = readFileSync(pending.absPath)

      if (afterBuf.length <= MAX_DIFF_BYTES) {
        const sample = afterBuf.slice(0, 8192)
        let isBinary = false
        for (let i = 0; i < sample.length; i++) {
          if (sample[i] === 0) { isBinary = true; break }
        }

        if (!isBinary) {
          const afterContent = afterBuf.toString('utf-8')
          diffLines = computeDiff(pending.baseline, afterContent)
          addCount = diffLines.filter(l => l.kind === 'add').length
          delCount = diffLines.filter(l => l.kind === 'remove').length
        }
      }
    } catch {
    }

    return [{
      type: 'file_changed',
      path: pending.path,
      change: pending.change,
      toolId: id,
      ...(diffLines !== undefined ? { diff: diffLines, add: addCount, del: delCount } : {})
    }]
  }

  clear(): void {
    this._pending.clear()
  }
}
