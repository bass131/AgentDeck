// 작업 ID: gap1-p02 · 옛 이름 gap1-p02-model-persist.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createConversationStore, type ConversationStore } from '@main/06_Sessions/store'
import type { ConversationRecord } from '../../../../02_Project/00_Source/shared/ipcContract'

function makeRecord(overrides: Partial<ConversationRecord> = {}): Omit<ConversationRecord, 'createdAt' | 'updatedAt'> {
  return {
    id: 'conv-model-001',
    title: 'Model Selection Conversation',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ],
    backendId: 'claude-code',
    ...overrides,
  }
}

describe('GAP1 P02 — ConversationStore model 라운드트립', () => {
  let store: ConversationStore
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-model-'))
    store = createConversationStore(tmpDir)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('model="sonnet"을 왕복 보존한다 (저장·복원)', () => {
    const rec = makeRecord({ model: 'sonnet' })
    store.save(rec)
    expect(store.load(rec.id!)?.model).toBe('sonnet')
  })

  it('model 미지정 옛 레코드 → load model undefined (하위호환 회귀 0)', () => {
    const rec = makeRecord({ id: 'conv-model-legacy' })
    store.save(rec)
    const loaded = store.load('conv-model-legacy')
    expect(loaded).not.toBeNull()
    expect(loaded?.model).toBeUndefined()
  })

  it('model이 string이 아닌 값(number)이면 sanitize로 undefined (신뢰경계)', () => {
    const rec = makeRecord({ id: 'conv-model-bad-number', model: 42 as unknown as string })
    store.save(rec)
    expect(store.load('conv-model-bad-number')?.model).toBeUndefined()
  })

  it('model이 string이 아닌 값(object)이면 sanitize로 undefined (신뢰경계)', () => {
    const rec = makeRecord({ id: 'conv-model-bad-object', model: { foo: 'bar' } as unknown as string })
    store.save(rec)
    expect(store.load('conv-model-bad-object')?.model).toBeUndefined()
  })

  it('model이 빈 문자열이면 undefined 취급 (모델 id는 non-empty 기대)', () => {
    const rec = makeRecord({ id: 'conv-model-empty', model: '' })
    store.save(rec)
    expect(store.load('conv-model-empty')?.model).toBeUndefined()
  })

  it('model 덮어쓰기: save(sonnet)→save(opus)→load opus (매 save 최신값)', () => {
    const rec = makeRecord({ id: 'conv-model-overwrite', model: 'sonnet' })
    store.save(rec)
    store.save({ ...rec, model: 'opus' })
    expect(store.load('conv-model-overwrite')?.model).toBe('opus')
  })

  // M06 G4: 배경 run의 저장 payload에는 model이 없다 — 그 저장이 전경에서 고른 모델을 지우면 안 된다.
  it('model 없이 다시 저장하면 기존 model을 유지한다 (배경 저장 경로)', () => {
    const rec = makeRecord({ id: 'conv-model-keep', model: 'claude-fable-5-2' })
    store.save(rec)
    const { model: _drop, ...withoutModel } = rec
    store.save({ ...withoutModel, messages: [...rec.messages, { role: 'user', content: 'again' }] })
    const loaded = store.load('conv-model-keep')
    expect(loaded?.model).toBe('claude-fable-5-2')
    expect(loaded?.messages).toHaveLength(3)
  })

  it('재기동 영속: save(model)→close→새 store→load model (디스크 왕복)', () => {
    const rec = makeRecord({ id: 'conv-model-restart', model: 'haiku' })
    store.save(rec)
    store.close()
    const store2 = createConversationStore(tmpDir)
    try {
      expect(store2.load('conv-model-restart')?.model).toBe('haiku')
    } finally {
      store2.close()
    }
  })
})
