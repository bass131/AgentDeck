// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  AskModal,
  PromptModal,
  QuestionModal,
} from '@renderer/03_Agent/prompt'

describe('prompt 캡슐 — 공개 표면 스모크', () => {
  it('AskModal이 캡슐 경로에서 export된다', () => {
    expect(typeof AskModal).toBe('function')
  })

  it('PromptModal이 캡슐 경로에서 export된다', () => {
    expect(typeof PromptModal).toBe('function')
  })

  it('QuestionModal이 캡슐 경로에서 export된다', () => {
    expect(typeof QuestionModal).toBe('function')
  })

  it('DIALOG_LAYER가 캡슐 경로에서 export된다', async () => {
    const { DIALOG_LAYER } = await import('@renderer/03_Agent/prompt')
    // 질문 창은 숫자 키를 가져가므로 다른 모달(최고 300)보다 위다.
    expect(DIALOG_LAYER).toEqual({ app: 320 })
  })
})
