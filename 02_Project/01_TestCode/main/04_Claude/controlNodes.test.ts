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

  it('옮긴 노드의 보호 수준은 아직 L2다 — 앱 소스를 고치면 꺼진다. L1의 전제(실행 트리 분리·엔진 경로 보호)는 뒤 goal 몫이다', () => {
    for (const n of PERMISSION_NODES) {
      expect(n.protection).toBe('L2')
      expect(n.judge).toBe('rule')
    }
  })

  it('잠금이 풀린 노드는 꺼지면 카드로 떨어지는 허용 노드 셋뿐이다 (M07 G5 결정 대장 [USER])', () => {
    const unlocked = listControlNodes().filter((n) => !n.locked)
    expect(unlocked.map((n) => n.id)).toEqual(['mode-auto-bypass-allow', 'readonly-allow', 'accept-edits-allow'])
    for (const n of unlocked) expect(n.results).toEqual(['allow'])
  })

  it('등록부의 노드와 결과 목록은 얼어 있고, 목록 함수는 사본을 돌려준다', () => {
    for (const n of PERMISSION_NODES) {
      expect(Object.isFrozen(n)).toBe(true)
      expect(Object.isFrozen(n.results)).toBe(true)
    }
    // 목록 앞쪽이 권한 콜백 노드다. 뒤에 붙는 엔진 경로 노드는 enginePathLock.test.ts가 고정한다 (M07 G3).
    const list = listControlNodes().slice(0, PERMISSION_NODES.length)
    expect(list.map((n) => n.id)).toEqual(PERMISSION_NODES.map((n) => n.id))
    for (const [i, n] of list.entries()) {
      expect('decide' in n).toBe(false)
      expect(n.results).not.toBe(PERMISSION_NODES[i].results)
    }
  })

  it('노드가 잘못된 결정(undefined·모르는 kind)을 내도 실패 정책대로 거부한다 (G8 설계 30 — 던지거나 잘못된 출력)', () => {
    for (const bad of [undefined, null, {}, { kind: 'maybe' }, 'allow']) {
      const node: ControlNode = { ...PERMISSION_NODES[0], id: 'bad', decide: () => bad as never }
      const v = runPermissionNodes(ctx(), [node])
      expect(v.kind).toBe('deny')
      expect(v.nodeId).toBe('bad')
    }
  })

  it('노드 실패는 노드 id와 오류를 main 로그에 남긴다', () => {
    const seen: unknown[][] = []
    const orig = console.error
    console.error = (...a: unknown[]) => { seen.push(a) }
    try {
      runPermissionNodes(ctx(), [{ ...PERMISSION_NODES[0], id: 'boom', decide: () => { throw new Error('터짐') } }])
    } finally {
      console.error = orig
    }
    expect(seen).toHaveLength(1)
    expect(String(seen[0][0])).toContain('boom')
    expect(String(seen[0][1])).toContain('터짐')
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

  // M11 G2 — M07 Backlog 17. Bypass는 권한 콜백이 오지 않아(실측) 이름을 자동 모드로 좁혔다. id는 저장 열쇠라 둔다.
  it('모드 허용 노드의 이름은 「자동 모드는 허용」이고 id는 그대로다', () => {
    const node = PERMISSION_NODES.find((n) => n.id === 'mode-auto-bypass-allow')!
    expect(node.name).toBe('자동 모드는 허용')
    expect(node.decide(ctx({ mode: 'auto' }))).toEqual({ kind: 'allow' })
  })
})
