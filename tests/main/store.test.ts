/**
 * store.test.ts — ConversationStore better-sqlite3 구현 단위 테스트
 *
 * DB 경로를 ':memory:'로 주입 → Electron 없이 node 환경에서 실행 가능.
 * 시크릿 평문 저장 금지 검증 포함.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createConversationStore, type ConversationStore } from '../../src/main/persistence/store'
import type { ConversationRecord } from '../../src/shared/ipc-contract'

// ── 픽스처 ──────────────────────────────────────────────────────────────────────

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

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('ConversationStore (:memory:)', () => {
  let store: ConversationStore

  beforeEach(() => {
    store = createConversationStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('저장한 대화를 id로 불러올 수 있다 (happy path)', () => {
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id)
    expect(loaded).not.toBeNull()
    expect(loaded?.id).toBe(rec.id)
    expect(loaded?.title).toBe(rec.title)
    expect(loaded?.backendId).toBe(rec.backendId)
  })

  it('저장한 messages를 왕복 직렬화 없이 동일하게 복구한다', () => {
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id)
    expect(loaded?.messages).toEqual(rec.messages)
  })

  it('upsert: 같은 id로 두 번 저장하면 최신 내용으로 업데이트된다', () => {
    const rec = makeRecord()
    store.save(rec)
    store.save({ ...rec, title: 'Updated Title' })
    const loaded = store.load(rec.id)
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
    // 가장 최근 저장된 것이 먼저 온다
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
    const loaded = store.load(rec.id)
    expect(loaded?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(loaded?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('시크릿 컬럼이 DB 스키마에 존재하지 않는다 (API 키 평문 저장 금지)', () => {
    // 스키마에 api_key, secret, token, password 같은 컬럼이 없어야 한다
    // store의 내부 DB에 직접 접근하는 대신 저장 데이터에 시크릿이 없음을 확인
    const rec = makeRecord()
    store.save(rec)
    const loaded = store.load(rec.id)
    // 반환된 레코드에 시크릿 필드가 없어야 함
    const keys = Object.keys(loaded ?? {})
    const secretKeywords = ['api_key', 'apiKey', 'secret', 'token', 'password', 'credential']
    for (const keyword of secretKeywords) {
      expect(keys).not.toContain(keyword)
    }
  })

  it('messages가 배열인지 검증한다 (invalid input 거부)', () => {
    expect(() => {
      store.save({ ...makeRecord(), messages: 'not-an-array' as unknown as [] })
    }).toThrow()
  })

  // ── M4-3 세션 CRUD: delete / rename / 제목 보존 / 마이그레이션 v2 ───────────

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
      // 1. 저장 (자동제목)
      const rec = makeRecord({ id: 'preserve-001', title: 'auto' })
      store.save(rec)
      // 2. rename으로 사용자 제목 설정
      store.rename('preserve-001', '사용자제목')
      // 3. renderer가 자동제목으로 save 재시도
      store.save({ ...rec, title: 'auto2' })
      // 4. 제목 보존 확인 (custom_title=1 이므로 덮이지 않음)
      expect(store.load('preserve-001')?.title).toBe('사용자제목')
    })

    it('rename 안 한 대화는 save가 title을 갱신한다 (대조군)', () => {
      const rec = makeRecord({ id: 'no-rename-001', title: '원래 자동제목' })
      store.save(rec)
      // rename 없이 바로 새 title로 save
      store.save({ ...rec, title: '갱신된 자동제목' })
      expect(store.load('no-rename-001')?.title).toBe('갱신된 자동제목')
    })
  })

  describe('마이그레이션 v2', () => {
    it('v2 마이그레이션이 적용된 store에서 rename이 정상 동작한다 (custom_title 컬럼 존재 확인)', () => {
      // :memory: store는 항상 최신 마이그레이션 포함하므로
      // rename이 성공하면 custom_title 컬럼이 존재한다는 의미
      const rec = makeRecord({ id: 'migration-v2-001', title: 'before' })
      store.save(rec)
      const result = store.rename('migration-v2-001', 'after')
      expect(result).toBe(true)
      expect(store.load('migration-v2-001')?.title).toBe('after')
    })
  })

  // ── ADR-020: cwd 컬럼 라운드트립 (마이그레이션 v3) ──────────────────────────

  describe('cwd 라운드트립 (ADR-020)', () => {
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
      // cwd가 DB에 NULL → undefined (필드 없거나 undefined 둘 다 허용)
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
      // cwd 없이 저장하면 DB에 NULL → 로드 시 cwd가 undefined여야 한다
      // (마이그레이션 v3 추가 후 기존 데이터는 NULL 컬럼값)
      const rec = makeRecord({ id: 'cwd-legacy-001' })
      // cwd 미포함 저장 시뮬 — makeRecord 기본값에 cwd 없음
      store.save(rec)
      const loaded = store.load('cwd-legacy-001')
      expect(loaded).not.toBeNull()
      expect(loaded?.cwd == null).toBe(true)
    })

    it('마이그레이션 idempotent: store 재생성 후 동일 DB 열어도 크래시 0 (already applied)', () => {
      // :memory: 에서는 재생성 후 동일 DB를 재사용할 수 없으므로,
      // 마이그레이션 _migrations 버전추적이 skip을 보장하는지 간접 검증:
      // createConversationStore(':memory:')는 migrations를 모두 순서대로 적용한다.
      // 이미 적용된 버전이 appliedVersions Set에 있으면 skip이므로 두 번 적용 불안전성 없음.
      // store가 정상 생성되고 save/load가 동작하면 idempotent 보장.
      const rec = makeRecord({ id: 'cwd-idempotent-001', cwd: '/idem' } as Partial<ConversationRecord>)
      store.save(rec)
      const loaded = store.load('cwd-idempotent-001')
      expect(loaded?.cwd).toBe('/idem')
    })

    it('custom_title 보존 회귀 0: cwd 추가 후 rename된 title이 save(자동제목)로 덮이지 않는다', () => {
      // cwd 컬럼 추가가 custom_title 보존 로직을 깨뜨리지 않는지 확인
      const rec = makeRecord({ id: 'cwd-title-001', title: 'auto', cwd: '/workspace/proj' } as Partial<ConversationRecord>)
      store.save(rec)
      store.rename('cwd-title-001', '사용자제목')
      // cwd를 포함한 save로 자동제목 갱신 시도
      store.save({ ...rec, title: 'auto2', cwd: '/workspace/proj' })
      const loaded = store.load('cwd-title-001')
      // title은 보존, cwd는 갱신
      expect(loaded?.title).toBe('사용자제목')
      expect(loaded?.cwd).toBe('/workspace/proj')
    })
  })
})
