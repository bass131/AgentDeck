import { describe, it, expect } from 'vitest'
import { buildAgentRunArgs } from '../../../02_Source/renderer/src/store/panelSession'
import type { ConversationMessage } from '../../../02_Source/shared/ipcContract'

const baseHistory: ConversationMessage[] = [
  { role: 'user', content: 'hello' }
]

describe('buildAgentRunArgs — sysPrompt → systemPrompt 전파 (Phase 30)', () => {

  describe('PS-1: sysPrompt 있음 → agentRun 인자에 systemPrompt 포함', () => {
    it("send({sysPrompt:'Respond only in French'}) → agentRun args.systemPrompt === 'Respond only in French'", () => {
      const args = buildAgentRunArgs(baseHistory, { sysPrompt: 'Respond only in French' })
      expect(args.systemPrompt).toBe('Respond only in French')
    })

    it("결정적 마커 sysPrompt → agentRun args.systemPrompt에 마커 포함", () => {
      const marker = 'You must begin EVERY response with ###FR### and answer only in French.'
      const args = buildAgentRunArgs(baseHistory, { sysPrompt: marker })
      expect(args.systemPrompt).toBe(marker)
    })
  })

  describe('PS-2: sysPrompt 미지정 → systemPrompt undefined', () => {
    it('opts 미전달 → systemPrompt undefined', () => {
      const args = buildAgentRunArgs(baseHistory)
      expect(args.systemPrompt).toBeUndefined()
    })

    it('opts={} — sysPrompt 없음 → systemPrompt undefined', () => {
      const args = buildAgentRunArgs(baseHistory, {})
      expect(args.systemPrompt).toBeUndefined()
    })
  })

  describe('PS-3: 기존 picker 필드 회귀 0', () => {
    it('picker 있고 sysPrompt 없음 → picker 필드 그대로, systemPrompt undefined', () => {
      const args = buildAgentRunArgs(baseHistory, {
        picker: { model: 'sonnet', effort: 'high', mode: 'normal' }
      })
      expect(args.model).toBe('sonnet')
      expect(args.effort).toBe('high')
      expect(args.mode).toBe('normal')
      expect(args.systemPrompt).toBeUndefined()
    })

    it('picker + sysPrompt 함께 → 양쪽 모두 포함', () => {
      const args = buildAgentRunArgs(baseHistory, {
        picker: { model: 'opus', effort: 'max', mode: 'auto' },
        sysPrompt: 'Answer in French',
      })
      expect(args.model).toBe('opus')
      expect(args.systemPrompt).toBe('Answer in French')
    })

    it('workspaceRoot 있고 sysPrompt 없음 → workspaceRoot 보존, systemPrompt undefined', () => {
      const args = buildAgentRunArgs(baseHistory, {
        workspaceRoot: '/home/user/project',
      })
      expect(args.workspaceRoot).toBe('/home/user/project')
      expect(args.systemPrompt).toBeUndefined()
    })

    it('messages 배열 그대로 전달', () => {
      const args = buildAgentRunArgs(baseHistory, { sysPrompt: 'X' })
      expect(args.messages).toEqual(baseHistory)
    })
  })
})
