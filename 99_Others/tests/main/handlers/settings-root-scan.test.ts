import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const h = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return { handlers }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))

const registryMock = vi.hoisted(() => ({
  listSupportedCommands: vi.fn((_root?: string | null): unknown[] => []),
}))

vi.mock('../../../../02_Source/main/01_agents/registry', () => ({
  getBackend: (): { listSupportedCommands: typeof registryMock.listSupportedCommands } => registryMock,
}))

import { registerSettingsHandlers } from '../../../../02_Source/main/00_ipc/handlers/settings'
import { createSkillsStore } from '../../../../02_Source/main/05_settings/skills'
import { createCommandsStore } from '../../../../02_Source/main/05_settings/commands'
import { IPC_CHANNELS } from '../../../../02_Source/shared/ipcContract'
import type { SkillInfo, SlashCommandInfo } from '../../../../02_Source/shared/ipcContract'

const ev = {} as never
const call = async (ch: string, ...args: unknown[]): Promise<unknown> =>
  h.handlers.get(ch)!(ev, ...args)

let panelRoot: string

beforeAll(() => {
  panelRoot = join(tmpdir(), `agentdeck-cp1-p02-panel-${Date.now()}`)
  mkdirSync(panelRoot, { recursive: true })
  writeFileSync(join(panelRoot, 'not-a-dir.txt'), 'file, not directory')
})

afterAll(() => {
  rmSync(panelRoot, { recursive: true, force: true })
})

function makeFakeSkillsStore(): {
  listSkills: ReturnType<typeof vi.fn>
  setSkillEnabled: ReturnType<typeof vi.fn>
  disabledSkillOverrides: ReturnType<typeof vi.fn>
} {
  return {
    listSkills: vi.fn((_root: string | null): SkillInfo[] => []),
    setSkillEnabled: vi.fn(() => true),
    disabledSkillOverrides: vi.fn(() => null),
  }
}

function makeFakeCommandsStore(): { listSlashCommands: ReturnType<typeof vi.fn> } {
  return {
    listSlashCommands: vi.fn((_root: string | null): SlashCommandInfo[] => []),
  }
}

describe('registerSettingsHandlers — root 재검증 배선(CP1 P02)', () => {
  const globalRoot = '/global/workspace'
  let skillsStore: ReturnType<typeof makeFakeSkillsStore>
  let commandsStore: ReturnType<typeof makeFakeCommandsStore>

  beforeEach(() => {
    h.handlers.clear()
    registryMock.listSupportedCommands.mockReset().mockReturnValue([])
    skillsStore = makeFakeSkillsStore()
    commandsStore = makeFakeCommandsStore()
    registerSettingsHandlers({
      getCurrentWorkspaceRoot: () => globalRoot,
      getSkillsStore: () => skillsStore,
      getMcpStore: () => null,
      getCommandsStore: () => commandsStore,
    })
  })

  describe('skill.list', () => {
    it('유효 root(절대·존재·디렉토리) 전달 시 그 root로 스캔한다', async () => {
      await call(IPC_CHANNELS.SKILL_LIST, { root: panelRoot })
      expect(skillsStore.listSkills).toHaveBeenCalledWith(panelRoot)
    })

    it('비절대 root는 전역 root로 폴백한다', async () => {
      await call(IPC_CHANNELS.SKILL_LIST, { root: 'relative/path' })
      expect(skillsStore.listSkills).toHaveBeenCalledWith(globalRoot)
    })

    it('존재하지 않는 절대경로 root는 전역 root로 폴백한다', async () => {
      const missing = join(panelRoot, 'does-not-exist-' + Date.now())
      await call(IPC_CHANNELS.SKILL_LIST, { root: missing })
      expect(skillsStore.listSkills).toHaveBeenCalledWith(globalRoot)
    })

    it('파일 경로(디렉토리 아님) root는 전역 root로 폴백한다', async () => {
      await call(IPC_CHANNELS.SKILL_LIST, { root: join(panelRoot, 'not-a-dir.txt') })
      expect(skillsStore.listSkills).toHaveBeenCalledWith(globalRoot)
    })

    it('req 미전달(undefined)이면 기존과 동일하게 전역 root를 사용한다(회귀 0)', async () => {
      await call(IPC_CHANNELS.SKILL_LIST, undefined)
      expect(skillsStore.listSkills).toHaveBeenCalledWith(globalRoot)
    })
  })

  describe('command.list', () => {
    it('유효 root 전달 시 스토어가 그 root로 스캔한다', async () => {
      await call(IPC_CHANNELS.COMMAND_LIST, { root: panelRoot })
      expect(commandsStore.listSlashCommands).toHaveBeenCalledWith(panelRoot)
    })

    it('유효 root 전달 시 backend.listSupportedCommands도 동일한 root로 호출된다(소비처 2곳 배선)', async () => {
      await call(IPC_CHANNELS.COMMAND_LIST, { root: panelRoot })
      expect(registryMock.listSupportedCommands).toHaveBeenCalledWith(panelRoot)
    })

    it('무효 root(비절대) → 스토어·backend 둘 다 전역 root로 폴백(혼합 반환 방지)', async () => {
      await call(IPC_CHANNELS.COMMAND_LIST, { root: 'not/absolute' })
      expect(commandsStore.listSlashCommands).toHaveBeenCalledWith(globalRoot)
      expect(registryMock.listSupportedCommands).toHaveBeenCalledWith(globalRoot)
    })

    it('무효 root(파일경로) → 스토어·backend 둘 다 전역 root로 폴백', async () => {
      const filePath = join(panelRoot, 'not-a-dir.txt')
      await call(IPC_CHANNELS.COMMAND_LIST, { root: filePath })
      expect(commandsStore.listSlashCommands).toHaveBeenCalledWith(globalRoot)
      expect(registryMock.listSupportedCommands).toHaveBeenCalledWith(globalRoot)
    })

    it('req 미전달(undefined) → 스토어·backend 둘 다 전역 root(기존 거동, 회귀 0)', async () => {
      await call(IPC_CHANNELS.COMMAND_LIST, undefined)
      expect(commandsStore.listSlashCommands).toHaveBeenCalledWith(globalRoot)
      expect(registryMock.listSupportedCommands).toHaveBeenCalledWith(globalRoot)
    })
  })
})

describe('.claude 하위 한정 불변식(CP1 P02 AC) — 실 fs 스캔', () => {
  let projectRoot: string
  let isolatedHome: string

  beforeAll(() => {
    projectRoot = join(tmpdir(), `agentdeck-cp1-p02-scope-${Date.now()}`)
    mkdirSync(join(projectRoot, '.claude', 'skills', 'proj-skill'), { recursive: true })
    writeFileSync(
      join(projectRoot, '.claude', 'skills', 'proj-skill', 'SKILL.md'),
      '---\nname: Proj Skill\ndescription: 프로젝트 스킬\n---\n'
    )
    mkdirSync(join(projectRoot, '.claude', 'commands'), { recursive: true })
    writeFileSync(
      join(projectRoot, '.claude', 'commands', 'deploy.md'),
      '---\ndescription: 배포\n---\n'
    )

    mkdirSync(join(projectRoot, 'secret-dir'), { recursive: true })
    writeFileSync(join(projectRoot, 'secret-dir', 'leak.md'), '---\ndescription: 유출되면 안 됨\n---\n')
    writeFileSync(join(projectRoot, 'outside.md'), '---\ndescription: 루트 최상위(.claude 밖)\n---\n')

    isolatedHome = join(tmpdir(), `agentdeck-cp1-p02-home-${Date.now()}`)
    mkdirSync(isolatedHome, { recursive: true })
  })

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true })
    rmSync(isolatedHome, { recursive: true, force: true })
  })

  it('실 createSkillsStore·createCommandsStore로 배선해도 .claude 밖은 결과에 나타나지 않는다', async () => {
    const skillsStore = createSkillsStore({
      homedir: () => isolatedHome,
      getUserData: () => join(isolatedHome, 'userData'),
    })
    const commandsStore = createCommandsStore({ homedir: () => isolatedHome })

    h.handlers.clear()
    registryMock.listSupportedCommands.mockReset().mockReturnValue([])
    registerSettingsHandlers({
      getCurrentWorkspaceRoot: () => null,
      getSkillsStore: () => skillsStore,
      getMcpStore: () => null,
      getCommandsStore: () => commandsStore,
    })

    const skills = (await call(IPC_CHANNELS.SKILL_LIST, { root: projectRoot })) as SkillInfo[]
    const commands = (await call(IPC_CHANNELS.COMMAND_LIST, { root: projectRoot })) as SlashCommandInfo[]

    expect(skills.some((s) => s.name === 'Proj Skill')).toBe(true)
    expect(commands.some((c) => c.name === 'deploy')).toBe(true)

    expect(skills.some((s) => s.name === 'leak')).toBe(false)
    expect(skills.some((s) => s.name === 'secret-dir')).toBe(false)
    expect(commands.some((c) => c.name === 'leak')).toBe(false)
    expect(commands.some((c) => c.name === 'outside')).toBe(false)
  })
})
