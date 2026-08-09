import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PermissionCoordinator,
  permissionSummary,
} from '../../../02_Project/00_Source/main/01_agents/permissionCoordinator'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/gap1-p03/', import.meta.url))

interface ExitPlanFixture {
  toolName: string
  input: { plan?: string; planFilePath?: string }
  optsKeys?: string[]
}

function loadExitPlanFixture(): ExitPlanFixture {
  const raw = readFileSync(path.join(FIXTURE_DIR, 'probe-3-exitplan-input.json'), 'utf-8')
  return JSON.parse(raw) as ExitPlanFixture
}

function mk(): { coord: PermissionCoordinator; pushed: AgentEvent[] } {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  return { coord, pushed }
}

type PermReqEvent = Extract<AgentEvent, { type: 'permission_request' }>

describe('GAP1 P07 — permissionSummary ExitPlanMode 분기 (RED)', () => {
  it("permissionSummary('ExitPlanMode', input) → generic 'ExitPlanMode 실행'이 아니다", () => {
    const { input } = loadExitPlanFixture()
    const summary = permissionSummary('ExitPlanMode', input as Record<string, unknown>)
    expect(summary).not.toBe('ExitPlanMode 실행')
  })

  it("permissionSummary('ExitPlanMode', input) → 계획 본문에서 유래한 텍스트(제목 'Plan: Print Hello')를 포함한다", () => {
    const { input } = loadExitPlanFixture()
    const summary = permissionSummary('ExitPlanMode', input as Record<string, unknown>)
    expect(summary).toContain('Plan: Print Hello')
  })

  it('비-ExitPlanMode 도구는 기존 요약 규약 불변(회귀 0)', () => {
    expect(permissionSummary('Bash', { command: 'ls -la' })).toContain('명령 실행')
    expect(permissionSummary('Write', { file_path: '/a' })).toContain('파일 생성')
    expect(permissionSummary('Glob', {})).toBe('Glob 실행')
  })
})

describe('GAP1 P07 — permission_request planReview payload (RED)', () => {
  it('ExitPlanMode(mode=plan) 권한 요청 → push된 permission_request가 planReview{plan,planFilePath}를 담는다', async () => {
    const { input } = loadExitPlanFixture()
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('plan', () => false)

    const p = canUse('ExitPlanMode', input as Record<string, unknown>)
    expect(pushed.length).toBe(1)
    const req = pushed[0] as PermReqEvent
    expect(req.type).toBe('permission_request')
    expect(req.toolName).toBe('ExitPlanMode')

    expect(req.planReview).toBeDefined()
    expect(req.planReview?.plan).toBe(input.plan)
    expect(req.planReview?.planFilePath).toBe(input.planFilePath)

    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    const r = await p
    expect(r.behavior).toBe('allow')
  })

  it('비-ExitPlanMode 도구(Bash)의 permission_request는 planReview 미부여(회귀 0)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: 'ls' })
    const req = pushed[0] as PermReqEvent
    expect(req.type).toBe('permission_request')
    expect(req.planReview).toBeUndefined()
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    await p
  })
})
