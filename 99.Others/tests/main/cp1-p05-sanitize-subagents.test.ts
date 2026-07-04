/**
 * cp1-p05-sanitize-subagents.test.ts — sanitizeSubagents 최소 단위 테스트 (main 스코프).
 *
 * 대상: 02.Source/main/04_persistence/store.ts 내부 sanitizeSubagents(비export, private).
 *   → store.save()/store.load() 공개 API 왕복으로 간접 검증(sanitizeUsage/
 *     sanitizeContextWindow 기존 테스트 패턴 미러 — store.test.ts:98-112 참조).
 *
 * 범위: 4개 버킷만(배열 아님→undefined / 악성 중첩 차단 / 상한 절삭 / 정상 통과).
 *   라운드트립 종합·하위호환 스윕은 qa Phase가 store.test.ts에 추가.
 *
 * 설계 근거: 01.Phases/CP1-cwd-persist-sweep/04-design-note.md (영호 GO 완료).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createConversationStore, type ConversationStore } from '../../../02.Source/main/04_persistence/store'
import type { ConversationRecord } from '../../../02.Source/shared/ipc-contract'
import { SUBAGENT_PERSIST_LIMITS } from '../../../02.Source/shared/ipc-contract'

function makeRecord(overrides: Partial<ConversationRecord> = {}): Omit<ConversationRecord, 'createdAt' | 'updatedAt'> {
  return {
    id: 'conv-subagents-001',
    title: 'Test Conversation',
    messages: [{ role: 'user', content: 'Hello' }],
    backendId: 'claude-code',
    ...overrides
  }
}

describe('sanitizeSubagents (CP1 P05, store.save/load 왕복으로 간접 검증)', () => {
  let store: ConversationStore
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-subagents-'))
    store = createConversationStore(tmpDir)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── 1. 배열 아님 → undefined ────────────────────────────────────────────────

  it('subagents가 배열이 아니면 undefined로 정규화된다', () => {
    for (const bad of ['nope', 42, {}, null]) {
      const rec = makeRecord({ id: undefined as unknown as string, subagents: bad as never })
      const id = store.save(rec)
      expect(store.load(id)?.subagents).toBeUndefined()
    }
  })

  it('subagents 미지정 → undefined (회귀 0, 기존 대화 호환)', () => {
    const rec = makeRecord()
    store.save(rec)
    expect(store.load(rec.id!)?.subagents).toBeUndefined()
  })

  // ── 2. 악성 중첩 차단 ────────────────────────────────────────────────────────

  it('알려진 필드만 추출한다 — 임의 중첩/프로토타입 오염 시도 필드는 저장되지 않는다', () => {
    const malicious = {
      id: 'sub-1',
      name: 'general-purpose',
      role: 'explorer',
      status: 'done',
      tools: [],
      afterMessageIndex: 0,
      __proto__: { polluted: true },
      constructor: { evil: true },
      injectedNested: { a: { b: { c: 'deep' } } },
      randomField: 'should not survive'
    }
    const rec = makeRecord({ subagents: [malicious] as never })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents).toHaveLength(1)
    const out = loaded!.subagents![0] as unknown as Record<string, unknown>
    expect(out).not.toHaveProperty('injectedNested')
    expect(out).not.toHaveProperty('randomField')
    expect(out).not.toHaveProperty('constructor', { evil: true })
    expect(Object.keys(out).sort()).toEqual(['afterMessageIndex', 'id', 'name', 'role', 'status', 'tools'].sort())
  })

  it('shape 불일치 원소(필수 필드 누락/오타입)는 배열 전체를 무효화하지 않고 개별 필터링된다', () => {
    const good = { id: 'sub-ok', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 0 }
    const badMissingId = { name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 1 }
    const badWrongStatus = { id: 'sub-bad', name: 'n', role: 'r', status: 'exploded', tools: [], afterMessageIndex: 2 }
    const badToolsNotArray = { id: 'sub-bad2', name: 'n', role: 'r', status: 'done', tools: 'nope', afterMessageIndex: 3 }
    const rec = makeRecord({
      subagents: [good, badMissingId, badWrongStatus, badToolsNotArray] as never
    })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents).toHaveLength(1)
    expect(loaded?.subagents?.[0].id).toBe('sub-ok')
  })

  // ── 2b. afterMessageIndex 신뢰경계 조임(음수/실수 차단) ─────────────────────

  it('afterMessageIndex가 음수면 개별 필터링된다(전체 무효화 아님)', () => {
    const good = { id: 'sub-ok', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 0 }
    const badNegative = { id: 'sub-neg', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: -1 }
    const rec = makeRecord({ subagents: [good, badNegative] as never })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents).toHaveLength(1)
    expect(loaded?.subagents?.[0].id).toBe('sub-ok')
  })

  it('afterMessageIndex가 실수(비정수)면 개별 필터링된다', () => {
    const good = { id: 'sub-ok', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 0 }
    const badFloat = { id: 'sub-float', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 1.5 }
    const rec = makeRecord({ subagents: [good, badFloat] as never })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents).toHaveLength(1)
    expect(loaded?.subagents?.[0].id).toBe('sub-ok')
  })

  it('afterMessageIndex가 0 또는 양의 정수면 정상 통과한다', () => {
    const zero = { id: 'sub-0', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 0 }
    const positive = { id: 'sub-5', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 5 }
    const rec = makeRecord({ subagents: [zero, positive] as never })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents).toHaveLength(2)
    expect(loaded?.subagents?.map((s) => s.id)).toEqual(['sub-0', 'sub-5'])
  })

  it('tools 항목의 알려지지 않은 중첩 필드도 차단된다', () => {
    const rec = makeRecord({
      subagents: [
        {
          id: 'sub-1',
          name: 'n',
          role: 'r',
          status: 'done',
          afterMessageIndex: 0,
          tools: [{ id: 't1', verb: 'bash', target: 'npm run build', status: 'done', evil: { nested: true } }]
        }
      ] as never
    })
    store.save(rec)
    const loaded = store.load(rec.id!)
    const tool = loaded!.subagents![0].tools[0] as unknown as Record<string, unknown>
    expect(tool).not.toHaveProperty('evil')
    expect(Object.keys(tool).sort()).toEqual(['id', 'status', 'target', 'verb'].sort())
  })

  // ── 3. 상한 절삭 ────────────────────────────────────────────────────────────

  it('subagents 배열은 maxSubagents로 절삭된다', () => {
    const many = Array.from({ length: SUBAGENT_PERSIST_LIMITS.maxSubagents + 10 }, (_, i) => ({
      id: `sub-${i}`,
      name: 'n',
      role: 'r',
      status: 'done' as const,
      tools: [],
      afterMessageIndex: i
    }))
    const rec = makeRecord({ subagents: many })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents).toHaveLength(SUBAGENT_PERSIST_LIMITS.maxSubagents)
  })

  it('tools 배열은 maxTools로 절삭된다', () => {
    const manyTools = Array.from({ length: SUBAGENT_PERSIST_LIMITS.maxTools + 20 }, (_, i) => ({
      id: `t-${i}`,
      verb: 'bash',
      target: 'x',
      status: 'done' as const
    }))
    const rec = makeRecord({
      subagents: [{ id: 'sub-1', name: 'n', role: 'r', status: 'done', tools: manyTools, afterMessageIndex: 0 }]
    })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents?.[0].tools).toHaveLength(SUBAGENT_PERSIST_LIMITS.maxTools)
  })

  it('transcript 배열은 maxTranscriptItems로 절삭된다', () => {
    const manyItems = Array.from({ length: SUBAGENT_PERSIST_LIMITS.maxTranscriptItems + 15 }, (_, i) => ({
      kind: 'text' as const,
      text: `item-${i}`,
      id: `tr-${i}`
    }))
    const rec = makeRecord({
      subagents: [
        { id: 'sub-1', name: 'n', role: 'r', status: 'done', tools: [], transcript: manyItems, afterMessageIndex: 0 }
      ]
    })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents?.[0].transcript).toHaveLength(SUBAGENT_PERSIST_LIMITS.maxTranscriptItems)
  })

  it('activity·transcript text는 maxTextChars로 절삭된다', () => {
    const longText = 'x'.repeat(SUBAGENT_PERSIST_LIMITS.maxTextChars + 500)
    const rec = makeRecord({
      subagents: [
        {
          id: 'sub-1',
          name: 'n',
          role: 'r',
          status: 'done',
          tools: [],
          activity: longText,
          transcript: [{ kind: 'text', text: longText, id: 'tr-1' }],
          afterMessageIndex: 0
        }
      ]
    })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents?.[0].activity).toHaveLength(SUBAGENT_PERSIST_LIMITS.maxTextChars)
    expect(loaded?.subagents?.[0].transcript?.[0].text).toHaveLength(SUBAGENT_PERSIST_LIMITS.maxTextChars)
  })

  // ── 4. 정상 통과 ────────────────────────────────────────────────────────────

  it('정상 입력은 형태를 유지한 채 왕복 보존된다', () => {
    const rec = makeRecord({
      subagents: [
        {
          id: 'sub-1',
          name: 'general-purpose',
          role: 'explorer',
          status: 'done',
          activity: '탐색 완료',
          tools: [{ id: 't1', verb: 'bash', target: 'npm test', status: 'done' }],
          transcript: [{ kind: 'text', text: '완료', id: 'tr-1' }],
          model: 'claude-opus-4-8',
          displayName: '탐색 에이전트 1',
          afterMessageIndex: 3
        }
      ]
    })
    store.save(rec)
    const loaded = store.load(rec.id!)
    expect(loaded?.subagents).toEqual([
      {
        id: 'sub-1',
        name: 'general-purpose',
        role: 'explorer',
        status: 'done',
        activity: '탐색 완료',
        tools: [{ id: 't1', verb: 'bash', target: 'npm test', status: 'done' }],
        transcript: [{ kind: 'text', text: '완료', id: 'tr-1' }],
        model: 'claude-opus-4-8',
        displayName: '탐색 에이전트 1',
        afterMessageIndex: 3
      }
    ])
  })

  it('디스크 파일 재로드 시(readChatFile 캐시 우회) toRecord에서도 재정규화된다', () => {
    const rec = makeRecord({
      subagents: [{ id: 'sub-1', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 0 }]
    })
    const id = store.save(rec)
    store.close()

    // 새 store 인스턴스로 같은 디렉토리를 열어 디스크 재로드 경로(toRecord)를 강제.
    const reopened = createConversationStore(tmpDir)
    const loaded = reopened.load(id)
    expect(loaded?.subagents).toEqual([{ id: 'sub-1', name: 'n', role: 'r', status: 'done', tools: [], afterMessageIndex: 0 }])
    reopened.close()
  })
})
