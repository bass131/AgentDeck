// M07 G2 노드 등록부 — G8 설계 `30_노드-구조.md`의 노드 모양과, 권한 콜백에서 옮긴 노드 여섯의 순서·실패 정책을 고정한다.
import { describe, it, expect } from 'vitest'
import {
  PERMISSION_NODES,
  listControlNodes,
  runPermissionNodes,
  type ControlNode,
  type PermissionContext,
} from '@main/04_Claude/permission/controlNodes'

const ctx = (over: Partial<PermissionContext> = {}): PermissionContext => ({
  toolName: 'Bash',
  input: { command: 'git status' },
  options: { toolUseID: 't', suggestions: [{ type: 'addRules' }] },
  mode: 'normal',
  orchestration: false,
  ...over,
})

describe('노드 등록부 (M07 G2)', () => {
  it('권한 콜백에서 옮긴 노드 여섯이 옮기기 전 분기 순서대로 있다', () => {
    expect(PERMISSION_NODES.map((n) => n.id)).toEqual([
      'ask-question',
      'workflow-gate',
      'no-suggestion-card',
      'mode-auto-bypass-allow',
      'readonly-allow',
      'accept-edits-allow',
    ])
  })

  it('노드마다 설계의 칸을 모두 갖는다', () => {
    for (const n of PERMISSION_NODES) {
      expect(n.name.length).toBeGreaterThan(0)
      expect(n.point).toBe('canUseTool')
      expect(['rule', 'model', 'human']).toContain(n.judge)
      expect(n.results.length).toBeGreaterThan(0)
      expect(['L0', 'L1', 'L2', 'L3']).toContain(n.protection)
      expect(typeof n.locked).toBe('boolean')
      expect(n.onFailure).toBe('block')
      expect(n.timeoutMs === null || typeof n.timeoutMs === 'number').toBe(true)
    }
  })

  it('옮긴 노드는 앱 프로세스 안의 잠금 노드다 (L1, 끌 수 없음)', () => {
    for (const n of PERMISSION_NODES) {
      expect(n.protection).toBe('L1')
      expect(n.locked).toBe(true)
    }
  })

  it('목록 함수는 판정 함수 없이 메타데이터만 돌려준다', () => {
    const list = listControlNodes()
    expect(list.map((n) => n.id)).toEqual(PERMISSION_NODES.map((n) => n.id))
    for (const n of list) expect('decide' in n).toBe(false)
  })

  it('앞 노드가 정하면 뒤 노드는 부르지 않는다', () => {
    const calls: string[] = []
    const mk = (id: string, verdict: ReturnType<ControlNode['decide']>): ControlNode => ({
      ...PERMISSION_NODES[0], id, decide: () => { calls.push(id); return verdict },
    })
    const v = runPermissionNodes(ctx(), [mk('a', { kind: 'pass' }), mk('b', { kind: 'allow' }), mk('c', { kind: 'question' })])
    expect(v).toEqual({ kind: 'allow', nodeId: 'b' })
    expect(calls).toEqual(['a', 'b'])
  })

  it('어느 노드도 정하지 않으면 카드다', () => {
    const pass: ControlNode = { ...PERMISSION_NODES[0], id: 'p', decide: () => ({ kind: 'pass' }) }
    expect(runPermissionNodes(ctx(), [pass])).toEqual({ kind: 'card', nodeId: null })
  })

  it('노드가 예외를 던지면 실패 정책(막는다)대로 거부한다', () => {
    const boom: ControlNode = { ...PERMISSION_NODES[0], id: 'boom', decide: () => { throw new Error('x') } }
    const after: ControlNode = { ...PERMISSION_NODES[0], id: 'after', decide: () => ({ kind: 'allow' }) }
    const v = runPermissionNodes(ctx(), [boom, after])
    expect(v.kind).toBe('deny')
    expect(v.nodeId).toBe('boom')
    expect(v.kind === 'deny' && v.message).toContain('boom')
  })

  it('권한 콜백 파일의 판별 함수·도구 묶음은 등록부의 것을 다시 내보낸 것이다 (사본 없음)', async () => {
    const coord = await import('@main/04_Claude/permission/permissionCoordinator')
    const nodes = await import('@main/04_Claude/permission/controlNodes')
    expect(coord.escalationOf).toBe(nodes.escalationOf)
    expect(coord.ORCHESTRATION_TOOLS).toBe(nodes.ORCHESTRATION_TOOLS)
  })

  it('기본 등록부로 일반 Bash 질의(normal)는 카드, auto는 허용이다', () => {
    expect(runPermissionNodes(ctx()).kind).toBe('card')
    expect(runPermissionNodes(ctx({ mode: 'auto' }))).toEqual({ kind: 'allow', nodeId: 'mode-auto-bypass-allow' })
  })
})
