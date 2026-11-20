// M11 G4 — 메인 대화 한 턴의 답 글. main의 대화 기록과 화면의 턴 짝짓기가 이 한 규칙을 쓴다.
import { describe, expect, it } from 'vitest'
import { mainAnswerOf } from '@shared/13_Loop/mainTurn'

describe('메인 턴의 답 글 (M11 G4)', () => {
  it('[M11-G4 M10-22] 위층 글만 모으고 메시지가 바뀌거나 도구 호출 뒤면 문단을 나눈다', () => {
    expect(mainAnswerOf([
      { type: 'session', sessionId: 'S1' },
      { type: 'text', messageId: 'm1', delta: ' 읽어 볼게 ' },
      { type: 'tool_call', id: 't1', name: 'Read', input: {} },
      { type: 'text', messageId: 'm1', delta: '서브', parentToolId: 't1' },
      { type: 'tool_result', id: 't1', ok: true, output: 'ok' },
      { type: 'text', messageId: 'm1', delta: '읽었어' },
      { type: 'text', messageId: 'm2', delta: '정리하면' },
      { type: 'text', messageId: 'm2', delta: ' 이래' },
      { type: 'done' },
    ])).toBe('읽어 볼게\n\n읽었어\n\n정리하면 이래')
    expect(mainAnswerOf([{ type: 'text', messageId: 'm1', delta: '   ' }])).toBe('')
  })
})
