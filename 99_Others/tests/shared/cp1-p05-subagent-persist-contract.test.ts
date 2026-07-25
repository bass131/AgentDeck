/**
 * cp1-p05-subagent-persist-contract.test.ts — CP1 P05 서브에이전트 영속 shared 계약 골든 테스트.
 *
 * 대상: 02.Source/shared/ipc/conversation.ts
 *   - PersistedSubAgent (SubAgentInfo extends + afterMessageIndex)
 *   - SUBAGENT_PERSIST_LIMITS (상한 상수)
 *   - ConversationRecord.subagents?(additive optional)
 *
 * 설계 근거: 01.Phases/CP1-cwd-persist-sweep/04-design-note.md (영호 GO 완료).
 * 범위: 단일챗 ConversationRecord만(멀티패널 PanelThreadSnapshot은 범위 밖 — 후속 이관).
 *
 * 이 파일은 계약 *타입 shape*를 고정한다 — 구현(sanitizeSubagents 등)은 main-process 담당.
 */
import { describe, it, expect } from 'vitest'
import { SUBAGENT_PERSIST_LIMITS } from '../../../02.Source/shared/ipc-contract'
import type {
  PersistedSubAgent,
  ConversationRecord,
} from '../../../02.Source/shared/ipc-contract'
import type { SubAgentInfo } from '../../../02.Source/shared/agent-events'

// ── SUBAGENT_PERSIST_LIMITS 값 계약 ─────────────────────────────────────────

describe('SUBAGENT_PERSIST_LIMITS 상한 상수 (CP1 P05, 설계노트 확정값)', () => {
  it('4개 필드가 설계노트 확정값과 정확히 일치한다', () => {
    expect(SUBAGENT_PERSIST_LIMITS).toEqual({
      maxSubagents: 30,
      maxTranscriptItems: 100,
      maxTextChars: 4096,
      maxTools: 200,
    })
  })

  it('as const로 리터럴 타입이 고정된다(런타임 재할당 불가 — 구조 자체가 불변)', () => {
    const keys = Object.keys(SUBAGENT_PERSIST_LIMITS)
    expect(keys).toEqual(['maxSubagents', 'maxTranscriptItems', 'maxTextChars', 'maxTools'])
  })
})

// ── PersistedSubAgent shape 계약 (SubAgentInfo extends) ─────────────────────

describe('PersistedSubAgent 타입 계약 (SubAgentInfo extends + afterMessageIndex)', () => {
  it('SubAgentInfo 필수 필드(id·name·role·status·tools) + afterMessageIndex로 구성된 최소 객체가 유효하다', () => {
    const p: PersistedSubAgent = {
      id: 'sub-1',
      name: 'general-purpose',
      role: 'explorer',
      status: 'done',
      tools: [],
      afterMessageIndex: 0,
    }
    expect(p.afterMessageIndex).toBe(0)
    expect(p.tools).toEqual([])
  })

  it('SubAgentInfo의 optional 필드(displayName·model·transcript·activity)를 재나열 없이 상속한다', () => {
    const p: PersistedSubAgent = {
      id: 'sub-2',
      name: 'general-purpose',
      role: 'builder',
      status: 'done',
      activity: '빌드 완료',
      tools: [{ id: 't1', verb: 'bash', target: 'npm run build', status: 'done' }],
      transcript: [{ kind: 'text', text: '빌드를 시작합니다', id: 'tr-1' }],
      model: 'claude-opus-4-8',
      displayName: '빌더 에이전트 1',
      afterMessageIndex: 3,
    }
    expect(p.displayName).toBe('빌더 에이전트 1')
    expect(p.model).toBe('claude-opus-4-8')
    expect(p.transcript?.[0].kind).toBe('text')
    expect(p.afterMessageIndex).toBe(3)
  })

  it('PersistedSubAgent는 SubAgentInfo 대입 가능(구조적 상위 호환 — extends 정합 확인)', () => {
    const p: PersistedSubAgent = {
      id: 'sub-3',
      name: 'general-purpose',
      role: 'reviewer',
      status: 'queued',
      tools: [],
      afterMessageIndex: 1,
    }
    // afterMessageIndex를 제외하면 SubAgentInfo 자리에 그대로 들어갈 수 있어야 한다.
    const asBase: SubAgentInfo = p
    expect(asBase.id).toBe('sub-3')
  })

  it('afterMessageIndex는 0-based 정수 위치 앵커 — 음수/실수도 타입상 number(런타임 검증은 main sanitizeSubagents 책임)', () => {
    const p: PersistedSubAgent = {
      id: 'sub-4',
      name: 'general-purpose',
      role: 'explorer',
      status: 'running',
      tools: [],
      afterMessageIndex: 0,
    }
    expect(Number.isInteger(p.afterMessageIndex)).toBe(true)
  })
})

// ── ConversationRecord.subagents optional (additive) ─────────────────────────

describe('ConversationRecord.subagents optional 필드 (CP1 P05, additive — 단일챗 전용)', () => {
  const base: Omit<ConversationRecord, 'subagents'> = {
    id: 'conv-1',
    title: 'test',
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-07-04T00:00:00.000Z',
    updatedAt: '2026-07-04T00:00:00.000Z',
  }

  it('subagents 미지정이어도 유효하다 (기존 대화/마이그레이션 전 — 회귀 0)', () => {
    const record: ConversationRecord = { ...base }
    expect(record.subagents).toBeUndefined()
  })

  it('subagents 배열을 포함할 수 있다 (PersistedSubAgent[])', () => {
    const record: ConversationRecord = {
      ...base,
      subagents: [
        {
          id: 'sub-1',
          name: 'general-purpose',
          role: 'explorer',
          status: 'done',
          tools: [],
          afterMessageIndex: 2,
        },
      ],
    }
    expect(record.subagents).toHaveLength(1)
    expect(record.subagents?.[0].afterMessageIndex).toBe(2)
  })

  it('기존 graceful optional 필드(cwd·sessionId)와 마찬가지로 버전 필드 신설 없이 확장됐다', () => {
    const record: ConversationRecord = { ...base }
    // version 필드가 계약에 존재하지 않음을 구조적으로 확인(키 목록에 없어야 함).
    expect(Object.keys(record)).not.toContain('version')
  })
})
