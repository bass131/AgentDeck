// M07 G5 컨트롤 설정 — 노드 켜짐을 controls.json에 봉인과 함께 저장하고, 앱 밖에서 바뀌면 실행을 열지 않는다.
// 임시 userData를 함수 인자로 넘겨 프로덕션 경로(setControlEnabled·confirmControls·readControls·controlsForRun)로만 본다.
// 상태 넷의 뜻은 shared/11_Settings/settings.ts의 ControlsSealStatus 주석이 소유한다.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readControls,
  setControlEnabled,
  confirmControls,
  controlsState,
  controlsForRun,
  activePermissionNodes,
} from '@main/04_Claude/permission/controlsStore'
import { PERMISSION_NODES, runPermissionNodes, type PermissionContext } from '@main/04_Claude/permission/controlNodes'
import { PermissionCoordinator } from '@main/04_Claude/permission/permissionCoordinator'
import type { AgentEvent } from '../../../../02_Project/00_Source/shared/agentEvents'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-controls-'))
let ud = ''

beforeEach(() => {
  ud = fs.mkdtempSync(path.join(root, 'ud-'))
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const file = (): string => path.join(ud, 'controls.json')
const seal = (): string => path.join(ud, 'controls-seal.json')

describe('controls.json 저장과 봉인 상태 (M07 G5)', () => {
  it('파일도 봉인도 없으면 첫 실행(none)이고 전부 켬이다', () => {
    expect(readControls(ud)).toEqual({ status: 'none', disabled: [] })
    expect(controlsForRun(ud)).toMatchObject({ ok: true })
  })

  it('풀린 노드를 끄면 파일과 봉인이 생기고 ok다. 다시 켜면 빈 목록으로 돌아간다', () => {
    expect(setControlEnabled(ud, 'readonly-allow', false)).toEqual({ ok: true })
    expect(fs.existsSync(file()) && fs.existsSync(seal())).toBe(true)
    expect(readControls(ud)).toEqual({ status: 'ok', disabled: ['readonly-allow'] })
    expect(setControlEnabled(ud, 'readonly-allow', true)).toEqual({ ok: true })
    expect(readControls(ud)).toEqual({ status: 'ok', disabled: [] })
  })

  it('잠긴 노드와 모르는 노드는 끌 수 없고 파일을 만들지 않는다', () => {
    for (const id of ['no-suggestion-card', 'ask-question', 'workflow-gate', 'engine-path-bash-lock', 'nope']) {
      const r = setControlEnabled(ud, id, false)
      expect(r.ok).toBe(false)
      expect(r.error).toBeTruthy()
    }
    expect(fs.existsSync(file())).toBe(false)
  })

  it('앱 밖에서 내용을 바꾸면 mismatch이고, 그 상태에서는 토글을 받지 않는다', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.writeFileSync(file(), JSON.stringify({ version: 1, disabled: [] }))
    expect(readControls(ud).status).toBe('mismatch')
    expect(setControlEnabled(ud, 'accept-edits-allow', false).ok).toBe(false)
  })

  it('봉인된 뒤 파일을 지우면 mismatch다 — 첫 실행과 구분한다', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.rmSync(file())
    expect(readControls(ud).status).toBe('mismatch')
  })

  it('봉인만 없으면 missing이다 (파일이 처음부터 봉인 없이 놓인 경우 포함)', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.rmSync(seal())
    expect(readControls(ud).status).toBe('missing')
    const ud2 = fs.mkdtempSync(path.join(root, 'ud-'))
    fs.writeFileSync(path.join(ud2, 'controls.json'), JSON.stringify({ version: 1, disabled: [] }))
    expect(readControls(ud2).status).toBe('missing')
  })

  it('봉인이 없는 상태(missing)에서도 토글을 받지 않는다 — 확인이 먼저다', () => {
    fs.writeFileSync(file(), JSON.stringify({ version: 1, disabled: [] }))
    expect(setControlEnabled(ud, 'readonly-allow', false).ok).toBe(false)
    expect(fs.existsSync(seal())).toBe(false)
  })

  it('봉인 파일이 깨져 있으면 mismatch다', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.writeFileSync(seal(), 'not json')
    expect(readControls(ud).status).toBe('mismatch')
  })

  it('확인하면 지금 파일 내용을 다시 봉인해 ok로 돌아온다', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.writeFileSync(file(), JSON.stringify({ version: 1, disabled: ['accept-edits-allow'] }))
    expect(confirmControls(ud)).toEqual({ ok: true })
    expect(readControls(ud)).toEqual({ status: 'ok', disabled: ['accept-edits-allow'] })
  })

  it('파일이 없거나 읽을 수 없으면 확인이 기본값(전부 켬)으로 다시 쓴다', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.writeFileSync(file(), '{ broken')
    expect(readControls(ud).status).toBe('mismatch')
    expect(confirmControls(ud)).toEqual({ ok: true })
    expect(readControls(ud)).toEqual({ status: 'ok', disabled: [] })
    fs.rmSync(file())
    expect(confirmControls(ud)).toEqual({ ok: true })
    expect(readControls(ud)).toEqual({ status: 'ok', disabled: [] })
  })

  it('봉인된 내용에 잠긴 노드나 모르는 id가 있어도 끄지 않는다', () => {
    fs.writeFileSync(file(), JSON.stringify({ version: 1, disabled: ['no-suggestion-card', 'ghost', 'readonly-allow'] }))
    confirmControls(ud)
    expect(readControls(ud)).toEqual({ status: 'ok', disabled: ['readonly-allow'] })
  })

  it('봉인이 맞으면 실행에 꺼진 노드를 뺀 등록부를 넘긴다', () => {
    setControlEnabled(ud, 'accept-edits-allow', false)
    const r = controlsForRun(ud)
    expect(r.ok && r.nodes.map((n) => n.id)).toEqual(['ask-question', 'workflow-gate', 'no-suggestion-card', 'mode-auto-bypass-allow', 'readonly-allow'])
  })

  it('봉인이 맞지 않으면 실행을 열지 않고, 사유는 패널 위치를 알린다', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.writeFileSync(file(), JSON.stringify({ version: 1, disabled: [] }))
    const r = controlsForRun(ud)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toContain('설정 › 컨트롤')
    fs.rmSync(seal())
    expect(controlsForRun(ud).ok).toBe(false)
  })
})

describe('패널 상태 (M07 G5)', () => {
  it('노드 전부를 설계 칸과 켜짐으로 보인다. 잠긴 노드는 늘 켬이다', () => {
    setControlEnabled(ud, 'mode-auto-bypass-allow', false)
    const s = controlsState(ud)
    expect(s.status).toBe('ok')
    const byId = new Map(s.nodes.map((n) => [n.id, n]))
    expect(byId.get('mode-auto-bypass-allow')).toMatchObject({ enabled: false, locked: false, point: 'canUseTool' })
    expect(byId.get('no-suggestion-card')).toMatchObject({ enabled: true, locked: true })
    expect(byId.get('engine-path-bash-lock')).toMatchObject({ enabled: true, locked: true, point: 'preToolUse', protection: 'L3' })
    expect(s.nodes).toHaveLength(8)
  })

  it('봉인이 깨졌을 때는 파일 내용(확인하면 받아들일 내용)을 켜짐으로 보인다', () => {
    setControlEnabled(ud, 'readonly-allow', false)
    fs.writeFileSync(file(), JSON.stringify({ version: 1, disabled: ['accept-edits-allow'] }))
    const s = controlsState(ud)
    expect(s.status).toBe('mismatch')
    const off = s.nodes.filter((n) => !n.enabled).map((n) => n.id)
    expect(off).toEqual(['accept-edits-allow'])
  })
})

describe('실행에 넘기는 노드 (M07 G5)', () => {
  const ctx = (over: Partial<PermissionContext> = {}): PermissionContext => ({
    toolName: 'Bash',
    input: { command: 'echo hi' },
    options: { toolUseID: 't', suggestions: [{ type: 'addRules' }] },
    mode: 'auto',
    orchestration: false,
    ...over,
  })

  it('기본(전부 켬)은 등록부 그대로다', () => {
    expect(activePermissionNodes([])).toEqual(PERMISSION_NODES)
  })

  it('꺼진 허용 노드는 빠지고, 잠긴 노드 id는 목록에 있어도 빠지지 않는다', () => {
    const ids = activePermissionNodes(['mode-auto-bypass-allow', 'no-suggestion-card']).map((n) => n.id)
    expect(ids).toEqual(['ask-question', 'workflow-gate', 'no-suggestion-card', 'readonly-allow', 'accept-edits-allow'])
  })

  it('자동·Bypass 허용 노드를 끄면 auto의 Bash가 카드로 떨어진다', () => {
    expect(runPermissionNodes(ctx()).kind).toBe('allow')
    expect(runPermissionNodes(ctx(), activePermissionNodes(['mode-auto-bypass-allow']))).toEqual({ kind: 'card', nodeId: null })
  })

  it('노드를 넘기지 않은 권한 콜백은 기본 등록부다 — auto의 Bash는 카드 없이 허용', async () => {
    const events: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => events.push(e))
    const r = await coord.makeCanUseTool('auto', () => false)('Bash', { command: 'echo hi' }, {
      signal: new AbortController().signal,
      toolUseID: 'toolu_y',
      suggestions: [{ type: 'addRules' }],
    })
    expect(r).toMatchObject({ behavior: 'allow' })
    expect(events).toEqual([])
  })

  it('권한 콜백은 넘겨받은 노드로 판정한다 — 꺼진 노드 대신 카드 이벤트가 나간다', async () => {
    const events: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => events.push(e))
    const canUseTool = coord.makeCanUseTool('auto', () => false, activePermissionNodes(['mode-auto-bypass-allow']))
    const pending = canUseTool('Bash', { command: 'echo hi' }, {
      signal: new AbortController().signal,
      toolUseID: 'toolu_x',
      suggestions: [{ type: 'addRules' }],
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(events.some((e) => e.type === 'permission_request')).toBe(true)
    coord.cancelAll()
    expect(await pending).toMatchObject({ behavior: 'deny' })
  })
})
