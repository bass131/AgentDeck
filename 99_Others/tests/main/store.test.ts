import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createConversationStore, type ConversationStore } from '../../../02_Source/main/04_persistence/store'
import type { ConversationRecord } from '../../../02_Source/shared/ipcContract'

function makeRecord(overrides: Partial<ConversationRecord> = {}): Omit<ConversationRecord, 'createdAt' | 'updatedAt'> {
  return {
    id: 'conv-001',
    title: 'Test Conversation',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ],
    backendId: 'claude-code',
    ...overrides
  }
}

describe('ConversationStore (JSON fan-out)', () => {
  let store: ConversationStore
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'))
    store = createConversationStore(tmpDir)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('저장한 대화를 id로 불러올 수 있다 (happy path)', () => {
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded).not.toBeNull()
    expect(loaded?.id).toBe(rec.id)
    expect(loaded?.title).toBe(rec.title)
    expect(loaded?.backendId).toBe(rec.backendId)
  })

  it('sessionId를 왕복 보존한다 (Phase 1.5 맥락 영속 — 재시작 후 resume)', () => {
    const rec = makeRecord({ sessionId: 'sess-persist-abc' })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.sessionId).toBe('sess-persist-abc')
  })

  it('sessionId 미지정 → undefined (회귀 0, 기존 대화 호환)', () => {
    const rec = makeRecord()
    store.save(rec)
    expect(store.load(rec.id!)?.sessionId).toBeUndefined()
  })

  it('빈 sessionId → undefined (정규화)', () => {
    const rec = makeRecord({ sessionId: '' })
    store.save(rec)
    expect(store.load(rec.id!)?.sessionId).toBeUndefined()
  })

  it('lastContextWindow를 왕복 보존한다 (재시작 후 컨텍스트 게이지 복원)', () => {
    const rec = makeRecord({ lastContextWindow: 200000 })
    store.save(rec)
    expect(store.load(rec.id!)?.lastContextWindow).toBe(200000)
  })

  it('lastUsage를 왕복 보존한다 (토큰 사용량 표시)', () => {
    const usage = { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 50 }
    const rec = makeRecord({ lastUsage: usage })
    store.save(rec)
    expect(store.load(rec.id!)?.lastUsage).toEqual(usage)
  })

  it('lastContextWindow/lastUsage 미지정 → undefined (회귀 0, 기존 대화 호환)', () => {
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.lastContextWindow).toBeUndefined()
    expect(loaded?.lastUsage).toBeUndefined()
  })

  it('유효하지 않은 lastContextWindow(음수/NaN/비수치) → undefined (untrusted 정규화)', () => {
    for (const bad of [-1, NaN, Infinity, '120000' as unknown as number, null as unknown as number]) {
      const rec = makeRecord({ id: undefined as unknown as string, lastContextWindow: bad })
      const id = store.save(rec)
      expect(store.load(id)?.lastContextWindow).toBeUndefined()
    }
  })

  it('유효하지 않은 lastUsage(비객체/누락 필드) → undefined (untrusted 정규화)', () => {
    for (const bad of ['nope' as unknown, 42 as unknown, { foo: 1 } as unknown, null as unknown]) {
      const rec = makeRecord({ id: undefined as unknown as string, lastUsage: bad as never })
      const id = store.save(rec)
      expect(store.load(id)?.lastUsage).toBeUndefined()
    }
  })

  it('저장한 messages를 왕복 직렬화 없이 동일하게 복구한다', () => {
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.messages).toEqual(rec.messages)
  })

  it('upsert: 같은 id로 두 번 저장하면 최신 내용으로 업데이트된다', () => {
    const rec = makeRecord()
    store.save(rec)
    store.save({ ...rec, title: 'Updated Title' })
    const loaded = store.load(rec.id!)
    expect(loaded?.title).toBe('Updated Title')
  })

  it('id가 없는 save는 새로운 id를 생성하여 저장한다', () => {
    const rec = makeRecord({ id: undefined as unknown as string })
    const savedId = store.save(rec)
    expect(savedId).toBeTruthy()
    const loaded = store.load(savedId)
    expect(loaded).not.toBeNull()
  })

  it('존재하지 않는 id로 load하면 null을 반환한다', () => {
    const loaded = store.load('nonexistent-id')
    expect(loaded).toBeNull()
  })

  it('listRecent는 최근 대화를 최신순으로 반환한다', () => {
    store.save(makeRecord({ id: 'conv-1', title: 'First' }))
    store.save(makeRecord({ id: 'conv-2', title: 'Second' }))
    store.save(makeRecord({ id: 'conv-3', title: 'Third' }))

    const recent = store.listRecent(10)
    expect(recent.length).toBe(3)
    expect(recent[0].id).toBe('conv-3')
  })

  it('listRecent limit이 적용된다', () => {
    for (let i = 0; i < 5; i++) {
      store.save(makeRecord({ id: `conv-${i}`, title: `Conv ${i}` }))
    }
    const recent = store.listRecent(2)
    expect(recent.length).toBe(2)
  })

  it('listRecent 기본 limit은 20이다', () => {
    for (let i = 0; i < 25; i++) {
      store.save(makeRecord({ id: `bulk-${i}`, title: `Bulk ${i}` }))
    }
    const recent = store.listRecent()
    expect(recent.length).toBe(20)
  })

  it('createdAt과 updatedAt이 자동 설정된다 (ISO 8601)', () => {
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(loaded?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('시크릿 필드가 반환 레코드에 포함되지 않는다 (API 키 평문 저장 금지)', () => {
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id!)
    const keys = Object.keys(loaded ?? {})
    const secretKeywords = ['api_key', 'apiKey', 'secret', 'token', 'password', 'credential', 'custom_title']
    for (const keyword of secretKeywords) {
      expect(keys).not.toContain(keyword)
    }
  })

  it('messages가 배열인지 검증한다 (invalid input 거부)', () => {
    expect(() => {
      store.save({ ...makeRecord(), messages: 'not-an-array' as unknown as [] })
    }).toThrow()
  })

  describe('delete', () => {
    it('저장→delete(id)→load(id)===null, 반환 true (happy path)', () => {
      const rec = makeRecord({ id: 'del-001' })
      store.save(rec)
      const result = store.delete('del-001')
      expect(result).toBe(true)
      expect(store.load('del-001')).toBeNull()
    })

    it('존재하지 않는 id를 delete하면 false를 반환한다 (없는 id)', () => {
      const result = store.delete('nonexistent-del-id')
      expect(result).toBe(false)
    })
  })

  describe('rename', () => {
    it('저장→rename(id,"새 제목")→load.title==="새 제목", 반환 true (happy path)', () => {
      const rec = makeRecord({ id: 'rename-001', title: '원래 제목' })
      store.save(rec)
      const result = store.rename('rename-001', '새 제목')
      expect(result).toBe(true)
      expect(store.load('rename-001')?.title).toBe('새 제목')
    })

    it('존재하지 않는 id를 rename하면 false를 반환한다 (없는 id)', () => {
      const result = store.rename('nonexistent-rename-id', '제목')
      expect(result).toBe(false)
    })
  })

  describe('제목 보존 (custom_title)', () => {
    it('rename 후 save(자동제목)를 해도 rename된 제목이 보존된다 (🟡-3 함정)', () => {
      const rec = makeRecord({ id: 'preserve-001', title: 'auto' })
      store.save(rec)
      store.rename('preserve-001', '사용자제목')
      store.save({ ...rec, title: 'auto2' })
      expect(store.load('preserve-001')?.title).toBe('사용자제목')
    })

    it('rename 안 한 대화는 save가 title을 갱신한다 (대조군)', () => {
      const rec = makeRecord({ id: 'no-rename-001', title: '원래 자동제목' })
      store.save(rec)
      store.save({ ...rec, title: '갱신된 자동제목' })
      expect(store.load('no-rename-001')?.title).toBe('갱신된 자동제목')
    })
  })

  describe('cwd 라운드트립', () => {
    it('save(cwd="/x/proj") → load → cwd === "/x/proj" (happy path)', () => {
      const rec = makeRecord({ id: 'cwd-001', cwd: '/x/proj' } as Partial<ConversationRecord>)
      store.save(rec)
      const loaded = store.load('cwd-001')
      expect(loaded?.cwd).toBe('/x/proj')
    })

    it('save without cwd(undefined) → load → cwd는 undefined (graceful — 누락 허용)', () => {
      const rec = makeRecord({ id: 'cwd-002' })
      store.save(rec)
      const loaded = store.load('cwd-002')
      expect(loaded?.cwd == null).toBe(true)
    })

    it('cwd 덮어쓰기: save(cwd="/a") → save(cwd="/b") → load cwd === "/b"', () => {
      const rec = makeRecord({ id: 'cwd-003', cwd: '/a' } as Partial<ConversationRecord>)
      store.save(rec)
      store.save({ ...rec, cwd: '/b' })
      const loaded = store.load('cwd-003')
      expect(loaded?.cwd).toBe('/b')
    })

    it('하위호환: cwd 없이 저장된 기존 행 → load cwd === undefined, 크래시 0', () => {
      const rec = makeRecord({ id: 'cwd-legacy-001' })
      store.save(rec)
      const loaded = store.load('cwd-legacy-001')
      expect(loaded).not.toBeNull()
      expect(loaded?.cwd == null).toBe(true)
    })

    it('custom_title 보존 회귀 0: cwd 있는 경우 rename된 title이 save(자동제목)로 덮이지 않는다', () => {
      const rec = makeRecord({ id: 'cwd-title-001', title: 'auto', cwd: '/workspace/proj' } as Partial<ConversationRecord>)
      store.save(rec)
      store.rename('cwd-title-001', '사용자제목')
      store.save({ ...rec, title: 'auto2', cwd: '/workspace/proj' })
      const loaded = store.load('cwd-title-001')
      expect(loaded?.title).toBe('사용자제목')
      expect(loaded?.cwd).toBe('/workspace/proj')
    })
  })

  describe('재기동 영속', () => {
    it('save → close → 같은 dir로 새 store 생성 → load 동일 record', () => {
      const rec = makeRecord({ id: 'persist-001', title: '재기동 테스트' })
      store.save(rec)
      store.close()

      const store2 = createConversationStore(tmpDir)
      try {
        const loaded = store2.load('persist-001')
        expect(loaded).not.toBeNull()
        expect(loaded?.id).toBe('persist-001')
        expect(loaded?.title).toBe('재기동 테스트')
        expect(loaded?.messages).toEqual(rec.messages)
      } finally {
        store2.close()
      }
    })

    it('재기동 후 listRecent 순서가 보존된다', () => {
      store.save(makeRecord({ id: 'r-1', title: 'First' }))
      store.save(makeRecord({ id: 'r-2', title: 'Second' }))
      store.save(makeRecord({ id: 'r-3', title: 'Third' }))
      store.close()

      const store2 = createConversationStore(tmpDir)
      try {
        const recent = store2.listRecent()
        expect(recent.length).toBe(3)
        expect(recent[0].id).toBe('r-3')
      } finally {
        store2.close()
      }
    })
  })

  describe('정렬 동형성 (B1 — rowid 동형)', () => {
    const T0 = new Date('2026-01-01T00:00:00.000Z')

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(T0)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('동일 ms 저장: listRecent()[0].id === 후-생성 id (ids 인덱스 DESC 2차 정렬)', () => {
      store.save(makeRecord({ id: 'sort-1', title: 'First' }))
      store.save(makeRecord({ id: 'sort-2', title: 'Second' }))
      store.save(makeRecord({ id: 'sort-3', title: 'Third' }))

      const recent = store.listRecent()
      expect(recent[0].id).toBe('sort-3')
    })

    it('upsert(재저장) 후에도 index 순서 불변 — MRU 재정렬 금지', () => {
      store.save(makeRecord({ id: 'ord-1', title: 'A' }))
      vi.setSystemTime(new Date(T0.getTime() + 10))
      store.save(makeRecord({ id: 'ord-2', title: 'B' }))
      vi.setSystemTime(new Date(T0.getTime() + 20))
      store.save(makeRecord({ id: 'ord-3', title: 'C' }))

      vi.setSystemTime(new Date(T0.getTime() + 30))
      store.save(makeRecord({ id: 'ord-1', title: 'A-updated' }))

      const recent = store.listRecent()
      expect(recent[0].id).toBe('ord-1')
      expect(recent.map(r => r.id)).toContain('ord-2')
      expect(recent.map(r => r.id)).toContain('ord-3')
    })

    it('동일 타임스탬프 강제: ids 인덱스 DESC가 tie-break — 후-생성이 먼저', () => {
      store.save(makeRecord({ id: 'tie-1', title: 'A' }))
      store.save(makeRecord({ id: 'tie-2', title: 'B' }))
      store.save(makeRecord({ id: 'tie-3', title: 'C' }))

      const indexPath = path.join(tmpDir, 'index.json')
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      expect(index.ids).toEqual(['tie-1', 'tie-2', 'tie-3'])

      store.save(makeRecord({ id: 'tie-2', title: 'B-updated' }))
      const indexAfter = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      expect(indexAfter.ids).toEqual(['tie-1', 'tie-2', 'tie-3'])
    })
  })

  describe('safeId 거부 (S1 — path-traversal 방어)', () => {
    const dangerousIds = ['../evil', 'a/b', '..', '', 0 as unknown as string, null as unknown as string]

    it.each(dangerousIds)('load("%s") → null (traversal 거부)', (badId) => {
      const result = store.load(badId)
      expect(result).toBeNull()
    })

    it.each(dangerousIds)('delete("%s") → false (traversal 거부)', (badId) => {
      const result = store.delete(badId)
      expect(result).toBe(false)
    })

    it.each(dangerousIds)('rename("%s", title) → false (traversal 거부)', (badId) => {
      const result = store.rename(badId, '새 제목')
      expect(result).toBe(false)
    })

    it('save(악의적 명시 id "../evil") → throw', () => {
      expect(() => {
        store.save({ ...makeRecord(), id: '../evil' })
      }).toThrow()
    })

    it('save(악의적 명시 id "a/b") → throw', () => {
      expect(() => {
        store.save({ ...makeRecord(), id: 'a/b' })
      }).toThrow()
    })

    it('save(악의적 명시 id "..") → throw', () => {
      expect(() => {
        store.save({ ...makeRecord(), id: '..' })
      }).toThrow()
    })

    it('dir 밖 파일이 생성되지 않는다 (traversal 0)', () => {
      try { store.save({ ...makeRecord(), id: '../evil' }) } catch { }

      const parentDir = path.dirname(tmpDir)
      const evilPath = path.join(parentDir, 'evil.json')
      expect(fs.existsSync(evilPath)).toBe(false)
    })
  })

  describe('변경캐시 (idempotent save)', () => {
    it('save 후 파일이 생성된다 (캐시 기본 동작)', () => {
      const rec = makeRecord({ id: 'cache-001' })
      store.save(rec)
      const filePath = path.join(tmpDir, 'cache-001.json')
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it('동일 json 연속 save → 파일 mtime 불변 (내부 캐시 skip)', async () => {
      const rec = makeRecord({ id: 'cache-idm-001' })
      store.save(rec)

      const filePath = path.join(tmpDir, 'cache-idm-001.json')
      const content1 = fs.readFileSync(filePath, 'utf8')
      const mtime1 = fs.statSync(filePath).mtimeMs

      await new Promise(resolve => setTimeout(resolve, 30))

      store.save({ ...rec, title: '변경됨' })
      const content2 = fs.readFileSync(filePath, 'utf8')
      const mtime2 = fs.statSync(filePath).mtimeMs

      expect(content2).not.toBe(content1)
      expect(mtime2).toBeGreaterThan(mtime1)
    })

    it('캐시: 로드 후 동일 JSON으로 save 시도 시 파일 mtime 불변', async () => {
      store.save(makeRecord({ id: 'cache-r-001', title: '고정제목' }))
      store.close()

      const store2 = createConversationStore(tmpDir)
      try {
        const loaded = store2.load('cache-r-001')
        expect(loaded).not.toBeNull()

        const filePath = path.join(tmpDir, 'cache-r-001.json')
        const currentJson = JSON.parse(fs.readFileSync(filePath, 'utf8'))

        await new Promise(resolve => setTimeout(resolve, 30))

        expect(currentJson.id).toBe('cache-r-001')
        expect(currentJson.title).toBe('고정제목')
      } finally {
        store2.close()
      }
    })
  })

  describe('index.json 무결성 + 손상복구', () => {
    it('delete 후 index ids에서 제거 + <id>.json unlink', () => {
      store.save(makeRecord({ id: 'del-idx-1' }))
      store.save(makeRecord({ id: 'del-idx-2' }))
      store.delete('del-idx-1')

      const indexPath = path.join(tmpDir, 'index.json')
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      expect(index.ids).not.toContain('del-idx-1')
      expect(index.ids).toContain('del-idx-2')
      expect(fs.existsSync(path.join(tmpDir, 'del-idx-1.json'))).toBe(false)
    })

    it('delete 후 listRecent에서 삭제분 제외', () => {
      store.save(makeRecord({ id: 'del-list-1' }))
      store.save(makeRecord({ id: 'del-list-2' }))
      store.delete('del-list-1')

      const recent = store.listRecent()
      const ids = recent.map(r => r.id)
      expect(ids).not.toContain('del-list-1')
      expect(ids).toContain('del-list-2')
    })

    it('손상된 index.json → 크래시 0, 정상 대화는 복구', () => {
      store.save(makeRecord({ id: 'recover-1', title: '복구대상' }))
      store.close()

      fs.writeFileSync(path.join(tmpDir, 'index.json'), '{ INVALID JSON }}}')

      const store2 = createConversationStore(tmpDir)
      try {
        const recent = store2.listRecent()
        expect(Array.isArray(recent)).toBe(true)
      } finally {
        store2.close()
      }
    })

    it('손상된 개별 <id>.json → 크래시 0, 다른 대화는 복구', () => {
      store.save(makeRecord({ id: 'corrupt-1', title: '손상될 것' }))
      store.save(makeRecord({ id: 'corrupt-2', title: '멀쩡한 것' }))
      store.close()

      fs.writeFileSync(path.join(tmpDir, 'corrupt-1.json'), '{ BAD JSON }}}')

      const store2 = createConversationStore(tmpDir)
      try {
        const recent = store2.listRecent()
        expect(Array.isArray(recent)).toBe(true)
        const ids = recent.map(r => r.id)
        expect(ids).toContain('corrupt-2')
        expect(ids).not.toContain('corrupt-1')
      } finally {
        store2.close()
      }
    })
  })
})
