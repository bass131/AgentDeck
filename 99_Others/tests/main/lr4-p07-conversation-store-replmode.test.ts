import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createConversationStore, type ConversationStore } from '../../../02_Source/main/04_persistence/store'
import type { ConversationRecord } from '../../../02_Source/shared/ipcContract'

function makeRecord(overrides: Partial<ConversationRecord> = {}): Omit<ConversationRecord, 'createdAt' | 'updatedAt'> {
  return {
    id: 'conv-repl-001',
    title: 'REPL Toggle Conversation',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ],
    backendId: 'claude-code',
    ...overrides,
  }
}

describe('LR4 P07 — ConversationStore replMode 라운드트립 (시나리오 2·4)', () => {
  let store: ConversationStore
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-repl-'))
    store = createConversationStore(tmpDir)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('replMode=false를 왕복 보존한다 (OFF 세션 — 단발 query)', () => {
    const rec = makeRecord({ replMode: false } as Partial<ConversationRecord>)
    store.save(rec)
    expect(store.load(rec.id!)?.replMode).toBe(false)
  })

  it('replMode=true를 왕복 보존한다 (ON 세션 — held-open persistent)', () => {
    const rec = makeRecord({ id: 'conv-repl-002', replMode: true } as Partial<ConversationRecord>)
    store.save(rec)
    expect(store.load('conv-repl-002')?.replMode).toBe(true)
  })

  it('replMode 덮어쓰기: save(true)→save(false)→load false (매 save 최신값)', () => {
    const rec = makeRecord({ id: 'conv-repl-003', replMode: true } as Partial<ConversationRecord>)
    store.save(rec)
    store.save({ ...rec, replMode: false } as Partial<ConversationRecord> as Omit<ConversationRecord, 'createdAt' | 'updatedAt'>)
    expect(store.load('conv-repl-003')?.replMode).toBe(false)
  })

  it('재기동 영속: save(false)→close→새 store→load false (디스크 왕복)', () => {
    const rec = makeRecord({ id: 'conv-repl-004', replMode: false } as Partial<ConversationRecord>)
    store.save(rec)
    store.close()
    const store2 = createConversationStore(tmpDir)
    try {
      expect(store2.load('conv-repl-004')?.replMode).toBe(false)
    } finally {
      store2.close()
    }
  })

  it('replMode 미지정 옛 레코드 → load 크래시 0 + replMode undefined (마이그 전 호환)', () => {
    const rec = makeRecord({ id: 'conv-repl-legacy' })
    store.save(rec)
    const loaded = store.load('conv-repl-legacy')
    expect(loaded).not.toBeNull()
    expect(loaded?.replMode).toBeUndefined()
  })
})
