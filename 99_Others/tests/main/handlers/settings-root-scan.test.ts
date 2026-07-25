/**
 * settings-root-scan.test.ts — CP1 P02: skill.list·command.list root 재검증 배선
 *
 * P01 계약(SkillListRequest/CommandListRequest.root?: string, additive/untrusted)이
 * main 핸들러(handlers/settings.ts)에 실제로 배선되었는지 검증한다.
 *
 * electron 모킹(window-controls.test.ts 패턴)으로 ipcMain.handle 핸들러를 포착해
 * 직접 호출한다. registry(getBackend)도 모킹해 command.list의 두 번째 root 소비처
 * (getBackend().listSupportedCommands)가 첫 번째 소비처(store.listSlashCommands)와
 * 동일한 effective root로 호출되는지 검증한다(CP1 P02 감사 🟡 "root 소비처 2곳" 봉합).
 *
 * 커버:
 *   1) 유효 root(절대·존재·디렉토리) 전달 → 그 root로 스캔.
 *   2) 비절대·미존재·파일경로 root → 전역 workspaceRoot로 폴백(신뢰경계 재검증 실패).
 *   3) req 미전달(undefined) → 전역 root로 폴백(기존 무인자 거동 100% 보존 — 회귀 0).
 *   4) command.list: 소비처 2곳(store + backend)이 항상 동일한 root를 받는다
 *      (한쪽만 배선 시 패널-root/전역-root 혼합 반환되는 결함의 회귀 가드).
 *   5) `.claude` 하위 한정 불변식 — 검증 통과한 임의 root라도 실 fs 스캔은
 *      `<root>/.claude/skills`·`<root>/.claude/commands` 밖을 절대 읽지 않는다.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// vi.mock 팩토리는 호이스트되므로 공유 상태는 vi.hoisted로 (window-controls.test.ts 패턴).
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

// getBackend() → registry 경유. 실 어댑터(ClaudeCodeBackend 등) 로드를 피하기 위해
// registry 모듈 전체를 모킹하고 listSupportedCommands 호출 인자만 관찰한다.
const registryMock = vi.hoisted(() => ({
  listSupportedCommands: vi.fn((_root?: string | null): unknown[] => []),
}))

vi.mock('../../../../02.Source/main/01_agents/registry', () => ({
  getBackend: (): { listSupportedCommands: typeof registryMock.listSupportedCommands } => registryMock,
}))

import { registerSettingsHandlers } from '../../../../02.Source/main/00_ipc/handlers/settings'
import { createSkillsStore } from '../../../../02.Source/main/05_settings/skills'
import { createCommandsStore } from '../../../../02.Source/main/05_settings/commands'
import { IPC_CHANNELS } from '../../../../02.Source/shared/ipc-contract'
import type { SkillInfo, SlashCommandInfo } from '../../../../02.Source/shared/ipc-contract'

const ev = {} as never
const call = async (ch: string, ...args: unknown[]): Promise<unknown> =>
  h.handlers.get(ch)!(ev, ...args)

// ── 유효 root(재검증 통과) 픽스처 ──────────────────────────────────────────────

let panelRoot: string

beforeAll(() => {
  panelRoot = join(tmpdir(), `agentdeck-cp1-p02-panel-${Date.now()}`)
  mkdirSync(panelRoot, { recursive: true })
  writeFileSync(join(panelRoot, 'not-a-dir.txt'), 'file, not directory')
})

afterAll(() => {
  rmSync(panelRoot, { recursive: true, force: true })
})

// ── 페이크 스토어 (root 인자 포착용) ────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════════════════════
// 1) root 배선 — 유효/무효/미전달 3분기 (skill.list · command.list)
// ══════════════════════════════════════════════════════════════════════════════

describe('registerSettingsHandlers — root 재검증 배선(CP1 P02)', () => {
  const globalRoot = '/global/workspace' // 이미 검증된 전역 root(폴백 값) — 실존 불필요
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

  // ── skill.list ────────────────────────────────────────────────────────────

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

  // ── command.list ──────────────────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════════════════════
// 2) `.claude` 하위 한정 불변식 — 실 fs로 검증(CP1 P02 AC)
// ══════════════════════════════════════════════════════════════════════════════

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

    // `.claude` 밖 — 절대 읽히면(스캔되면) 안 되는 파일/디렉토리
    mkdirSync(join(projectRoot, 'secret-dir'), { recursive: true })
    writeFileSync(join(projectRoot, 'secret-dir', 'leak.md'), '---\ndescription: 유출되면 안 됨\n---\n')
    writeFileSync(join(projectRoot, 'outside.md'), '---\ndescription: 루트 최상위(.claude 밖)\n---\n')

    // 실행 머신의 실 홈 디렉토리 .claude와 섞이지 않도록 격리된 homedir 사용.
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

    // `.claude` 하위 항목은 정상 스캔된다.
    expect(skills.some((s) => s.name === 'Proj Skill')).toBe(true)
    expect(commands.some((c) => c.name === 'deploy')).toBe(true)

    // `.claude` 밖 항목은 절대 등장하지 않는다(디렉토리 자체가 스캔 경로 밖).
    expect(skills.some((s) => s.name === 'leak')).toBe(false)
    expect(skills.some((s) => s.name === 'secret-dir')).toBe(false)
    expect(commands.some((c) => c.name === 'leak')).toBe(false)
    expect(commands.some((c) => c.name === 'outside')).toBe(false)
  })
})
