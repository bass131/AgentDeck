/**
 * fileChangeTracker.ts — 파일변경 추적 (RF1-followup P03: eventNormalizer에서 분리)
 *
 * Write/Edit/MultiEdit/NotebookEdit tool_use → tool_result 짝을 추적해
 * 성공 시 file_changed 이벤트(+ diff)를 생성한다.
 *
 * 단일책임(SRP): 파일변경 도구의 부수효과를 file_changed 이벤트로 투영.
 *   fs 읽기(existsSync/readFileSync)와 diff 계산(computeDiff)을 이 클래스에 격리한다 —
 *   eventNormalizer는 이 트래커를 조립만 하고 fs/diff를 직접 알지 않는다.
 *
 * 격리 원칙(ADR-003): 엔진 고유 도구명(Write/Edit/…)은 이 파일 내부에만.
 *   emit 이벤트는 공통 AgentEvent(file_changed) — 엔진 누수 0.
 * 신뢰경계: fs 읽기는 main 프로세스(이 파일)에서만.
 *
 * (원본 engine.ts L643-711 미러 — 분해 전 RunEventNormalizer._recordFilePending/
 *  _resolveFilePending와 거동 1:1 동일. 단, events를 인자로 push하던 것을 반환으로 변경 —
 *  호출자가 같은 위치에서 push해 방출 순서는 불변.)
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, isAbsolute, relative, sep } from 'node:path'
import { computeDiff } from '../02_fs/diff'
import type { AgentEvent } from '../../shared/agent-events'
import type { DiffLine } from '../../shared/diff-types'

/**
 * diff 계산 대상 파일 최대 크기 (바이트).
 * 이 크기를 초과하면 diff 생략(path/change만 emit) — LCS 성능 보호.
 * 512KB = 524288 바이트.
 */
const MAX_DIFF_BYTES = 524288

/**
 * FILE_CHANGE_TOOLS: Write/Edit/MultiEdit/NotebookEdit.
 */
const FILE_CHANGE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/**
 * 파일변경 추적 클래스 (런당 1개 — RunEventNormalizer가 소유).
 */
export class FileChangeTracker {
  private _pending = new Map<string, {
    path: string; change: 'add' | 'modify'; baseline: string; absPath: string
  }>()

  private readonly _workspaceRoot: string | undefined

  constructor(workspaceRoot?: string) {
    this._workspaceRoot = workspaceRoot
  }

  /**
   * tool_use 시점: 파일변경 도구이면 pending-map에 {path, change, baseline, absPath} 기록.
   *
   * path 추출 우선순위: file_path → path → notebook_path.
   * change 판정: Write+파일미존재→'add', 그 외→'modify'.
   * baseline 읽기: tool_call 시점 현재 내용 저장(diff 계산용).
   * 경로 정규화: 워크스페이스 상대 POSIX 경로.
   */
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
      // existsSync/readFileSync 실패 → 'modify' 폴백, baseline = ''
    }

    let emitPath: string
    if (!root) {
      // 루트 미지정 tracker: 컨테인먼트 판정 불가 — 기존 rawPath 방출 거동 유지(과잉 필터 금지).
      emitPath = rawPath
    } else {
      const rel = relative(root, abs)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        // GAP1 P15 S5: 워크스페이스 밖 경로(`..` 탈출·타 드라이브[relative가 절대경로 반환]) —
        // pending 미기록으로 file_changed 자체를 억제한다(플랜 파일 등 밖 경로가
        // 변경 인디케이터에 뜨는 소음 차단).
        return
      }
      emitPath = rel.split(sep).join('/')
    }

    this._pending.set(id, { path: emitPath, change, baseline, absPath: abs })
  }

  /**
   * tool_result 시점: pending에 있는 id이면:
   *   ok=true(성공) → after 읽기 → computeDiff → [file_changed] 반환 + pending 제거
   *   ok=false(실패) → pending 제거만, [] 반환(유령 마커 방지)
   * 미존재 id → [] 반환.
   *
   * diff 계산: 대형 파일(>512KB)·바이너리(null byte) → diff 생략.
   * (원본 engine.ts L708-711 미러)
   */
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
      // readFileSync 실패 → diff 생략(graceful)
    }

    return [{
      type: 'file_changed',
      path: pending.path,
      change: pending.change,
      toolId: id,
      ...(diffLines !== undefined ? { diff: diffLines, add: addCount, del: delCount } : {})
    }]
  }

  /** 펌프 종료/abort 시 pending 전부 비움. */
  clear(): void {
    this._pending.clear()
  }
}
