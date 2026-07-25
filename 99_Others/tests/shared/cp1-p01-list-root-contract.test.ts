/**
 * cp1-p01-list-root-contract.test.ts — CP1 P01 command.list·skill.list `root?` 계약 TDD.
 *
 * TDD 순서: 이 파일이 먼저 작성(실패) → shared/ipc/settings.ts의
 * SkillListRequest/CommandListRequest 추가 + preload/index.ts listSkills/
 * listSlashCommands 통과 배선 후 통과.
 *
 * 범위(Phase 01 완료 조건):
 *   ① SkillListRequest/CommandListRequest 타입 shape — root?: string(선택), 다른
 *      필드 없음(최소 표면).
 *   ② additive 하위호환 — 무인자 객체({})와 root 포함 객체 둘 다 유효한 요청.
 *   ③ preload listSkills/listSlashCommands 가 req(undefined 포함)를 그대로
 *      SKILL_LIST/COMMAND_LIST invoke 인자로 통과시킨다(신규 검증 로직은
 *      main 담당 — preload는 통과만).
 *   ④ 기존 무인자 호출(listSkills()/listSlashCommands()) 거동 불변 — req가
 *      undefined여도 invoke가 여전히 채널명으로 호출된다(회귀 가드).
 *   ⑤ AgentRunRequest는 이미 workspaceRoot를 보유 — 신규 계약 불요 확인.
 *
 * electron 모킹 패턴은 zoom-setter-contract.test.ts 참조.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { IPC_CHANNELS } from '../../../02.Source/shared/ipc-contract'
import type {
  SkillListRequest,
  CommandListRequest,
  AgentRunRequest,
} from '../../../02.Source/shared/ipc-contract'

// ── ① 타입 shape 계약 (순수 계약 — electron 미의존) ─────────────────────────

describe('SkillListRequest 타입 계약 (CP1 P01, additive)', () => {
  it('root 없이도 유효하다 (빈 객체 — 기존 무인자 호출과 동등)', () => {
    const req: SkillListRequest = {}
    expect(Object.keys(req)).toHaveLength(0)
  })

  it('root(절대경로 string)를 포함할 수 있다', () => {
    const req: SkillListRequest = { root: 'C:\\Dev\\SomeProject' }
    expect(req.root).toBe('C:\\Dev\\SomeProject')
  })

  it('root 필드 하나만 존재한다 (최소 표면 계약 — 다른 경로/시크릿 필드 0)', () => {
    const req: SkillListRequest = { root: '/home/user/project' }
    const keys = Object.keys(req)
    expect(keys).toEqual(['root'])
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('workspaceRoot')
  })

  it('undefined 도 유효한 요청이다 (invoke 인자 생략과 동등 — 하위호환)', () => {
    const req: SkillListRequest | undefined = undefined
    expect(req).toBeUndefined()
  })
})

describe('CommandListRequest 타입 계약 (CP1 P01, additive)', () => {
  it('root 없이도 유효하다 (빈 객체 — 기존 무인자 호출과 동등)', () => {
    const req: CommandListRequest = {}
    expect(Object.keys(req)).toHaveLength(0)
  })

  it('root(절대경로 string)를 포함할 수 있다', () => {
    const req: CommandListRequest = { root: 'D:\\Panels\\panel-2' }
    expect(req.root).toBe('D:\\Panels\\panel-2')
  })

  it('root 필드 하나만 존재한다 (최소 표면 계약)', () => {
    const req: CommandListRequest = { root: '/workspace/panel-a' }
    const keys = Object.keys(req)
    expect(keys).toEqual(['root'])
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('secret')
  })

  it('undefined 도 유효한 요청이다 (하위호환)', () => {
    const req: CommandListRequest | undefined = undefined
    expect(req).toBeUndefined()
  })
})

// ── ⑤ AgentRunRequest workspaceRoot 기존 보유 확인 (신규 계약 불요) ─────────

describe('AgentRunRequest.workspaceRoot 기존 보유 확인 (CP1 P01 — 중복 계약 생성 금지)', () => {
  it('workspaceRoot 필드가 이미 optional string 으로 존재한다', () => {
    const req: AgentRunRequest = {
      messages: [{ role: 'user', content: 'hi' }],
      workspaceRoot: 'C:\\Dev\\AgentDeck',
    }
    expect(req.workspaceRoot).toBe('C:\\Dev\\AgentDeck')
  })

  it('workspaceRoot 없이도 유효하다 (선택 필드)', () => {
    const req: AgentRunRequest = { messages: [{ role: 'user', content: 'hi' }] }
    expect(req.workspaceRoot).toBeUndefined()
  })
})

// ── ②③④ preload 통과 배선 (electron 모킹) ──────────────────────────────────

const h = vi.hoisted(() => {
  const exposed: { api?: Record<string, unknown> } = {}
  const invoke = vi.fn().mockResolvedValue([])
  return { exposed, invoke }
})

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown): void => {
      h.exposed[key as 'api'] = value as Record<string, unknown>
    },
  },
  ipcRenderer: {
    invoke: h.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  webUtils: {
    getPathForFile: vi.fn(() => ''),
  },
  webFrame: {
    getZoomFactor: (): number => 1,
    setZoomFactor: vi.fn(),
  },
}))

beforeAll(async () => {
  // 모듈 최상단 contextBridge.exposeInMainWorld('api', api) 실행 — 1회만 임포트.
  await import('../../../02.Source/preload/index')
})

beforeEach(() => {
  h.invoke.mockClear()
})

describe('preload listSkills(req?) — SKILL_LIST 통과 배선 (CP1 P01)', () => {
  it('무인자 호출 시 invoke가 undefined req로 호출된다 (기존 거동 불변, 회귀 가드)', async () => {
    const api = h.exposed.api as { listSkills: () => Promise<unknown> }
    await api.listSkills()
    expect(h.invoke).toHaveBeenCalledWith(IPC_CHANNELS.SKILL_LIST, undefined)
  })

  it('root 포함 요청이 그대로 invoke 인자로 통과한다 (main 재검증은 preload 책임 아님)', async () => {
    const api = h.exposed.api as {
      listSkills: (req?: SkillListRequest) => Promise<unknown>
    }
    await api.listSkills({ root: 'C:\\Dev\\PanelWorkspace' })
    expect(h.invoke).toHaveBeenCalledWith(IPC_CHANNELS.SKILL_LIST, {
      root: 'C:\\Dev\\PanelWorkspace',
    })
  })
})

describe('preload listSlashCommands(req?) — COMMAND_LIST 통과 배선 (CP1 P01)', () => {
  it('무인자 호출 시 invoke가 undefined req로 호출된다 (기존 거동 불변, 회귀 가드)', async () => {
    const api = h.exposed.api as { listSlashCommands: () => Promise<unknown> }
    await api.listSlashCommands()
    expect(h.invoke).toHaveBeenCalledWith(IPC_CHANNELS.COMMAND_LIST, undefined)
  })

  it('root 포함 요청이 그대로 invoke 인자로 통과한다', async () => {
    const api = h.exposed.api as {
      listSlashCommands: (req?: CommandListRequest) => Promise<unknown>
    }
    await api.listSlashCommands({ root: '/workspace/panel-b' })
    expect(h.invoke).toHaveBeenCalledWith(IPC_CHANNELS.COMMAND_LIST, {
      root: '/workspace/panel-b',
    })
  })
})
