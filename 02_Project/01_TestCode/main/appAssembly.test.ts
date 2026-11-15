import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// M05 G11 4단계: 조립 지점을 `00_App` 하나로 모은다.
// 실물 모듈을 import해 소유자·인스턴스 수를 고정한다 — 조립 로직을 테스트 안에 복제하지 않는다.
// 팩토리는 importOriginal로 감싼 spy라 실제 인스턴스를 만들고, 몇 번 만들어졌는지만 센다.
const h = vi.hoisted(() => ({
  userData: '',
  conversationStores: [] as { close: () => void }[],
}))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData, getAppPath: () => h.userData },
  ipcMain: { handle: (): void => {} },
  dialog: {},
}))

vi.mock('@main/06_Sessions/store', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/06_Sessions/store')>()
  const { vi: v } = await import('vitest')
  return {
    ...orig,
    createConversationStore: v.fn((dir: string) => {
      const s = orig.createConversationStore(dir)
      v.spyOn(s, 'close')
      h.conversationStores.push(s)
      return s
    }),
  }
})

import { createConversationStore } from '@main/06_Sessions/store'
import { initConversationStore, closeConversationStore, getStore } from '@main/00_App/context'

const MAIN_DIR = path.resolve(__dirname, '../../00_Source/main')
const fwd = (p: string): string => p.replace(/\\/g, '/')
function mainSources(dir = MAIN_DIR, acc: { rel: string; src: string }[] = []): { rel: string; src: string }[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) mainSources(full, acc)
    else if (e.name.endsWith('.ts')) acc.push({ rel: fwd(path.relative(MAIN_DIR, full)), src: fs.readFileSync(full, 'utf8') })
  }
  return acc
}
const callersOf = (re: RegExp): string[] => mainSources().filter((f) => re.test(f.src)).map((f) => f.rel)

beforeEach(() => {
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'g11-assembly-'))
})

afterEach(() => {
  fs.rmSync(h.userData, { recursive: true, force: true })
})

describe('ConversationStore — 소유자는 00_App 하나다 (M05 G11 4단계)', () => {
  it('만든 인스턴스를 00_App이 쥐고, 대화 핸들러가 읽는 getStore가 그 인스턴스를 돌려준다', () => {
    const before = vi.mocked(createConversationStore).mock.calls.length
    const dir = path.join(h.userData, 'chats')
    initConversationStore(dir)
    expect(vi.mocked(createConversationStore).mock.calls.length - before).toBe(1)
    expect(vi.mocked(createConversationStore).mock.calls.at(-1)).toEqual([dir])
    expect(getStore()).toBe(h.conversationStores.at(-1))
  })

  it('종료 정리는 쥔 인스턴스를 한 번 닫는다', () => {
    initConversationStore(path.join(h.userData, 'chats'))
    const s = h.conversationStores.at(-1)!
    closeConversationStore()
    expect(s.close).toHaveBeenCalledTimes(1)
  })

  it('생성이 throw하면 이전 상태를 바꾸지 않고 그대로 던진다(호출부가 잡아 기록한다)', () => {
    initConversationStore(path.join(h.userData, 'chats'))
    const kept = getStore()
    const blocker = path.join(h.userData, 'file')
    fs.writeFileSync(blocker, 'x')
    expect(() => initConversationStore(path.join(blocker, 'chats'))).toThrow()
    expect(getStore()).toBe(kept)
  })

  it('main 소스에서 ConversationStore를 만들고 쥐는 곳은 00_App/context.ts 하나다', () => {
    expect(callersOf(/\bcreateConversationStore\(/).filter((r) => r !== '06_Sessions/store.ts')).toEqual(['00_App/context.ts'])
    expect(callersOf(/\bsetStore\b/)).toEqual([])
    expect(callersOf(/let _store\b/)).toEqual(['00_App/context.ts'])
    // 진입점은 저장소를 알지 못한다 — 종료 정리도 00_App에 맡긴다
    expect(mainSources().find((f) => f.rel === 'index.ts')!.src).not.toMatch(/\bConversationStore\b|\bcreateConversationStore\b|_store\b/)
  })
})
