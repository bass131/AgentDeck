/**
 * lr4-p07-conversation-store-replmode.test.ts — LR4 P07 RED 테스트 (TDD 1단계).
 *
 * 목표: 대화별 REPL 토글(ConversationRecord.replMode)이 main ConversationStore의
 *   save→load 왕복에서 boolean으로 보존되는지 검증한다. shared 계약은 이미
 *   `ConversationRecord.replMode?: boolean`(shared/ipc/conversation.ts)으로 확장됨.
 *
 * 이 파일은 *실패하는 테스트만* 작성한다(구현 없음 — store.ts save/toRecord가 아직
 * replMode를 영속·반환하지 않음). 현재 store는 replMode 필드를 무시하므로 load 결과는
 * 항상 undefined → 아래 "false/true 왕복" 단언이 behavioral RED로 실패한다.
 *
 * 시나리오 매핑(코디네이터 4종 중):
 *   2. 영속 라운드트립(단일 — main store) — save(replMode)→toRecord 왕복 보존.
 *   4. 하위호환 마이그(크래시 0) — replMode 없는 옛 레코드 로드 시 undefined + 크래시 0.
 *
 * 패턴 재사용: 99.Others/tests/main/store.test.ts (tmpdir fixture + createConversationStore).
 * CRITICAL(신뢰경계): boolean만 영속 — 시크릿 아님. electron import 0(순수 모듈).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createConversationStore, type ConversationStore } from '../../../02.Source/main/04_persistence/store'
import type { ConversationRecord } from '../../../02.Source/shared/ipc-contract'

// ── 픽스처 (store.test.ts makeRecord 미러 + replMode overrides 허용) ──────────────

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

  // ── 시나리오 2: 영속 라운드트립 (main store) ────────────────────────────────

  it('replMode=false를 왕복 보존한다 (OFF 세션 — 단발 query)', () => {
    const rec = makeRecord({ replMode: false } as Partial<ConversationRecord>)
    store.save(rec)
    // 핵심 단언: false가 그대로 복원되어야 한다(undefined로 소실되면 OFF가 기본 ON으로 되살아남).
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

  // ── 시나리오 4: 하위호환 마이그 (크래시 0) ──────────────────────────────────

  it('replMode 미지정 옛 레코드 → load 크래시 0 + replMode undefined (마이그 전 호환)', () => {
    const rec = makeRecord({ id: 'conv-repl-legacy' })
    store.save(rec)
    const loaded = store.load('conv-repl-legacy')
    // 크래시 0: 정상 레코드 반환. replMode는 undefined(renderer가 전역 마이그값→기본 true로 폴백).
    expect(loaded).not.toBeNull()
    expect(loaded?.replMode).toBeUndefined()
  })
})
