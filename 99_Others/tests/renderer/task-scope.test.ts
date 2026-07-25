// @vitest-environment jsdom
/**
 * task-scope.test.ts — B2 작업 범위 파생 (순수 셀렉터).
 *
 * computeTaskScope(state) 가 기존 상태(changedFiles Set + thread toolgroup)에서
 * {fileCount, toolCount, changedFiles[]} 를 파생한다. 허구값 금지 — 실데이터만.
 *
 * 단일 store(AppStore)·패널(PanelSessionState extends AppState) 양쪽 재사용.
 */
import { describe, it, expect } from 'vitest'
import { computeTaskScope } from '../../../02.Source/renderer/src/store/appStore'
import type { ThreadItem, ToolCard } from '../../../02.Source/renderer/src/store/threadTypes'

function tool(id: string): ToolCard {
  return { id, name: 'bash', input: {}, status: 'done' }
}
function toolgroup(id: string, n: number): ThreadItem {
  return { kind: 'toolgroup', id, tools: Array.from({ length: n }, (_, i) => tool(`${id}-${i}`)) }
}
function msg(id: string): ThreadItem {
  return { kind: 'msg', id, role: 'assistant', text: 'hi' }
}

describe('computeTaskScope', () => {
  it('빈 상태 → 0/0/[]', () => {
    expect(computeTaskScope({ changedFiles: new Set<string>(), thread: [] })).toEqual({
      fileCount: 0,
      toolCount: 0,
      changedFiles: []
    })
  })

  it('changedFiles Set → fileCount + 배열', () => {
    const scope = computeTaskScope({
      changedFiles: new Set(['src/a.ts', 'src/b.ts', 'README.md']),
      thread: []
    })
    expect(scope.fileCount).toBe(3)
    expect(scope.changedFiles).toEqual(['src/a.ts', 'src/b.ts', 'README.md'])
  })

  it('toolCount = 모든 toolgroup.tools 합산 (msg/thinking/notice 무시)', () => {
    const scope = computeTaskScope({
      changedFiles: new Set<string>(),
      thread: [
        msg('m1'),
        toolgroup('g1', 2),
        msg('m2'),
        toolgroup('g2', 3),
        { kind: 'thinking', id: 't1', text: '...' },
        { kind: 'notice', id: 'n1', text: 'fallback' }
      ]
    })
    expect(scope.toolCount).toBe(5)
  })

  it('실데이터 조합: 파일 + 도구 동시 집계', () => {
    const scope = computeTaskScope({
      changedFiles: new Set(['x.ts']),
      thread: [toolgroup('g1', 1), msg('m1'), toolgroup('g2', 1)]
    })
    expect(scope).toEqual({ fileCount: 1, toolCount: 2, changedFiles: ['x.ts'] })
  })

  it('허구값 금지: toolgroup 없으면 toolCount=0 (changedFiles만 있어도 도구 0)', () => {
    const scope = computeTaskScope({ changedFiles: new Set(['only.ts']), thread: [msg('m1')] })
    expect(scope.toolCount).toBe(0)
  })
})
