import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))

import { registerConversationHandlers } from '@main/01_Ipc/handlers/conversation'
import { createConversationStore, type ConversationStore } from '@main/06_Sessions/store'
import { IPC_CHANNELS } from '@shared/ipcContract'

let dir: string
let store: ConversationStore

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-conv-model-'))
  store = createConversationStore(dir)
  h.handlers.clear()
  registerConversationHandlers({ getStore: () => store })
})

afterEach(() => {
  store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

function save(conversation: Record<string, unknown>): { id: string } {
  const fn = h.handlers.get(IPC_CHANNELS.CONVERSATION_SAVE)
  if (!fn) throw new Error('conversation.save 핸들러가 등록되지 않았다')
  return fn({} as never, { conversation }) as { id: string }
}

const base = {
  title: 't',
  messages: [{ role: 'user', content: 'hi' }],
  backendId: 'claude-code',
}

describe('conversation.save — 모델 값 저장 (M06 G4)', () => {
  it('넘긴 정식 ID가 저장되고 다시 읽힌다', () => {
    const { id } = save({ ...base, id: 'c-1', model: 'claude-fable-5-2' })
    expect(store.load(id)?.model).toBe('claude-fable-5-2')
  })

  it('옛 ID로 저장된 대화를 이어 저장해도 그 값이 남는다', () => {
    save({ ...base, id: 'c-old', model: 'claude-haiku-4-5' })
    save({ ...base, id: 'c-old', messages: [...base.messages, { role: 'assistant', content: 'ok' }], model: 'claude-haiku-4-5' })
    expect(store.load('c-old')?.model).toBe('claude-haiku-4-5')
  })

  it('문자열이 아닌 model은 저장하지 않는다', () => {
    save({ ...base, id: 'c-bad', model: 42 })
    expect(store.load('c-bad')?.model).toBeUndefined()
  })

  it('넘긴 권한 모드가 저장되고 다시 읽힌다', () => {
    const { id } = save({ ...base, id: 'c-mode', mode: 'plan' })
    expect(store.load(id)?.mode).toBe('plan')
    save({ ...base, id: 'c-mode', mode: 7 })
    expect(store.load(id)?.mode).toBe('plan')
  })
})
