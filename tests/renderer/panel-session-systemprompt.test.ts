/**
 * panel-session-systemprompt.test.ts — panelSession.send()의 sysPrompt 전파 단위 (Phase 30 TDD)
 *
 * 검증 범위 (AC §5.3):
 *   PS-1: send(text, {sysPrompt:'X'}) → window.api.agentRun mock이 systemPrompt:'X'로 호출됨
 *   PS-2: send(text) — sysPrompt 미지정 → window.api.agentRun에 systemPrompt:undefined
 *   PS-3: send(text, {picker:...}) — sysPrompt 없음 → systemPrompt:undefined (기존 picker 필드 회귀 0)
 *
 * 테스트 전략: window.api.agentRun을 vi.fn()으로 mock, send() 호출 후 mock 인자 검증.
 * Node 환경(React hook 없이 내부 로직 단위 검증 불가) → 내부 로직을 분리하거나
 * 직접 send() 내부에서 agentRun에 systemPrompt를 어떻게 전달하는지 검증.
 *
 * 실제로 usePanelSession hook 자체는 React 환경 필요 → send()의 agentRun 인자 구성 로직만
 * 순수함수로 추출하거나(buildAgentRunArgs), 또는 window.api mock + 직접 코드 흐름 검증.
 *
 * 여기서는 buildAgentRunArgs 순수 함수를 panelSession에서 추출하는 방식으로 검증한다.
 * (Phase 30에서 추출 예정 — 이 테스트가 그 계약을 고정)
 */

import { describe, it, expect } from 'vitest'
import { buildAgentRunArgs } from '../../src/renderer/src/store/panelSession'
import type { ConversationMessage } from '../../src/shared/ipc-contract'

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

const baseHistory: ConversationMessage[] = [
  { role: 'user', content: 'hello' }
]

// ── 테스트 ────────────────────────────────────────────────────────────────────

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
