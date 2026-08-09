// @vitest-environment jsdom
// 캡슐 경계 스모크 테스트 — conversation 기능 캡슐(02_Source/renderer/src/features/conversation)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
// 공개 표면 13종 = 앱 소비처(Shell·PanelView·SubAgentChatStream·CodeViewerPane·
// PermissionCard·FileModal)가 실제로 소비하는 심볼 전부. InjectedInput은 타입이라
// 런타임 단언 대상이 아니며 import type 성립(typecheck)으로 확인한다.
import { describe, it, expect } from 'vitest'
import {
  Conversation,
  NoticeItem,
  ThinkingItem,
  informationalTone,
  informationalDisplayText,
  permissionDeniedDisplayText,
  MessageBubble,
  StatusLine,
  ScrollToBottomButton,
  CmdResultCard,
  ToolCallCard,
  MarkdownView,
} from '../../../02_Source/renderer/src/features/conversation'
import type { InjectedInput } from '../../../02_Source/renderer/src/features/conversation'

describe('conversation 캡슐 — 공개 표면 스모크', () => {
  it('값 심볼 12종이 캡슐 경로에서 export된다', () => {
    expect(typeof Conversation).toBe('function')
    expect(typeof NoticeItem).toBe('object') // memo 래핑 컴포넌트
    expect(typeof ThinkingItem).toBe('object')
    expect(typeof informationalTone).toBe('function')
    expect(typeof informationalDisplayText).toBe('function')
    expect(typeof permissionDeniedDisplayText).toBe('function')
    expect(typeof MessageBubble).toBe('object')
    expect(typeof StatusLine).toBe('object')
    expect(typeof ScrollToBottomButton).toBe('function')
    expect(typeof CmdResultCard).toBe('object')
    expect(typeof ToolCallCard).toBe('object')
    expect(typeof MarkdownView).toBe('function')
  })

  it('InjectedInput 타입이 캡슐 경로에서 export된다 (컴파일 성립으로 확인)', () => {
    const probe: InjectedInput | null = null
    expect(probe).toBeNull()
  })
})
