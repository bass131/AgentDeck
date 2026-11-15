import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// M05 G11: main 여덟 자리의 `app.getPath('userData')` 식을 한 곳으로 모은다. 각 자리의 해석 시점은 그대로 둔다.
// 즉시 해석(스토어 생성 때): prefs·profile. 호출마다 해석: skills·mcp·engineVersions·fs(SAVE_IMAGE_DATA).
// index.ts의 두 자리(chats 폴더, multi 저장 경로)는 whenReady 부수효과라 grep으로만 대조한다.
const h = vi.hoisted(() => ({
  ud: '',
  throws: false,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}))

const getPath = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { getPath },
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) } },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
}))

import { createPrefsStore } from '@main/11_Settings/prefs'
import { createProfileStore } from '@main/11_Settings/profile'
import { createSkillsStore } from '@main/11_Settings/skills'
import { createMcpStore } from '@main/11_Settings/mcp'
import { getVersionState } from '@main/10_Engine/engineVersions'
import { registerFsHandlers } from '@main/01_Ipc/handlers/fs'
import { createRootRegistry } from '@main/07_Workspace/roots'
import { IPC_CHANNELS } from '../../../02_Project/00_Source/shared/ipcContract'
import { getUserDataDir } from '@main/02_Common/userData'

const MAIN_DIR = path.resolve(__dirname, '../../00_Source/main')
const USERDATA_CALL = /getPath\(\s*['"]userData['"]\s*\)/
const read = (rel: string): string => fs.readFileSync(path.join(MAIN_DIR, rel), 'utf8')

function mainSources(dir = MAIN_DIR, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) mainSources(full, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(path.relative(MAIN_DIR, full).split(path.sep).join('/'))
  }
  return acc
}

describe('getUserDataDir() — 한 곳으로 모은 해석 (M05 G11)', () => {
  it('부를 때마다 app.getPath("userData")를 그대로 부른다(캐시 없음)', () => {
    expect(getUserDataDir()).toBe(h.ud)
    expect(getUserDataDir()).toBe(h.ud)
    expect(getPath.mock.calls).toEqual([['userData'], ['userData']])
  })

  it('해석 실패는 감싸지 않고 그대로 던진다', () => {
    h.throws = true
    expect(() => getUserDataDir()).toThrow('app not ready')
  })

  // 옮기기 전에는 8곳·7파일이었다(재실측 1절). 파일 위치가 바뀌어도(G11 4단계 조립 정리) 이 판정은 그대로 선다.
  it('app.getPath("userData")는 main 전체에서 02_Common/userData.ts 한 곳에만 있다', () => {
    const hits = mainSources().filter((rel) => USERDATA_CALL.test(read(rel)))
    expect(hits).toEqual(['02_Common/userData.ts'])
  })
})

beforeEach(() => {
  h.ud = fs.mkdtempSync(path.join(os.tmpdir(), 'g11-ud-'))
  h.throws = false
  getPath.mockReset()
  getPath.mockImplementation((name: string) => {
    if (h.throws) throw new Error('app not ready')
    return name === 'userData' ? h.ud : `/other/${name}`
  })
})

afterEach(() => {
  fs.rmSync(h.ud, { recursive: true, force: true })
})

describe('즉시 해석 — 스토어를 만들 때 한 번 (M05 G11 동작 고정)', () => {
  it('prefs: 생성 때 userData를 한 번 읽고 ui-prefs.json에 쓴다', async () => {
    const store = createPrefsStore()
    expect(getPath.mock.calls).toEqual([['userData']])
    await store.set('k', 1)
    expect(getPath).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fs.readFileSync(path.join(h.ud, 'ui-prefs.json'), 'utf8'))).toEqual({ k: 1 })
  })

  it('profile: 생성 때 userData를 한 번 읽고 profile.json에 쓴다', async () => {
    const store = createProfileStore()
    expect(getPath.mock.calls).toEqual([['userData']])
    await store.set({ nickname: 'n', color: '#fff' } as never)
    expect(getPath).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(path.join(h.ud, 'profile.json'))).toBe(true)
  })

  it('prefs·profile: 경로나 읽기·쓰기 함수를 주입하면 기본 해석을 부르지 않는다', () => {
    createPrefsStore({ prefsPath: path.join(h.ud, 'p.json') })
    createPrefsStore({ readFile: async () => '{}' })
    createProfileStore({ profilePath: path.join(h.ud, 'q.json') })
    createProfileStore({ writeFile: async () => {} })
    expect(getPath).not.toHaveBeenCalled()
  })

  it('prefs·profile: 생성 때 해석이 throw하면 생성이 throw한다', () => {
    h.throws = true
    expect(() => createPrefsStore()).toThrow('app not ready')
    expect(() => createProfileStore()).toThrow('app not ready')
  })
})

describe('호출마다 해석 (M05 G11 동작 고정)', () => {
  it('skills·mcp: 생성 때는 읽지 않고 호출마다 읽는다', () => {
    const skills = createSkillsStore({ homedir: () => h.ud })
    const mcp = createMcpStore({ homedir: () => h.ud })
    expect(getPath).not.toHaveBeenCalled()
    skills.disabledSkillOverrides()
    mcp.deniedMcpServers()
    expect(getPath.mock.calls).toEqual([['userData'], ['userData']])
  })

  it('skills·mcp: deps.getUserData를 주입하면 기본 해석을 부르지 않는다', () => {
    createSkillsStore({ homedir: () => h.ud, getUserData: () => h.ud }).disabledSkillOverrides()
    createMcpStore({ homedir: () => h.ud, getUserData: () => h.ud }).deniedMcpServers()
    expect(getPath).not.toHaveBeenCalled()
  })

  it('engineVersions: overrideUserData를 주면 기본 해석을 부르지 않는다', () => {
    getVersionState(h.ud)
    expect(getPath).not.toHaveBeenCalledWith('userData')
  })

  it('engineVersions: 호출마다 읽고, 실패는 overrideUserData 안내로 다시 던진다', () => {
    getVersionState()
    getVersionState()
    expect(getPath.mock.calls).toEqual([['userData'], ['userData']])
    h.throws = true
    expect(() => getVersionState()).toThrow(/overrideUserData/)
  })

  it('fs SAVE_IMAGE_DATA: 호출마다 userData/attachments에 쓰고, 해석 실패는 빈 경로', async () => {
    h.handlers.clear()
    registerFsHandlers({ state: { win: null }, roots: createRootRegistry() })
    const save = h.handlers.get(IPC_CHANNELS.SAVE_IMAGE_DATA)!
    expect(getPath).not.toHaveBeenCalled()
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer
    const r = (await save({}, { bytes, ext: 'png' })) as { path: string }
    expect(getPath.mock.calls).toEqual([['userData']])
    expect(path.dirname(r.path)).toBe(path.join(h.ud, 'attachments'))
    h.throws = true
    expect(await save({}, { bytes, ext: 'png' })).toEqual({ path: '' })
  })
})
