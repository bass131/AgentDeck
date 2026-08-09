// @vitest-environment jsdom
// 캡슐 경계 스모크 테스트 — agent 기능 캡슐(02_Project/00_Source/renderer/src/features/agent)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
// 공개 표면 6종 = 앱 소비처(Conversation·PanelView·SettingsModal·Shell)가
// 실제로 소비하는 심볼 전부. Props 타입은 캡슐 밖 실소비가 없어 등재하지 않는다.
import { describe, it, expect } from 'vitest'
import {
  OrchestrationCard,
  SubAgentInline,
  SubAgentFullscreen,
  TodosSection,
  ProviderStatusPanel,
  SubAgentSplitView,
} from '../../../02_Project/00_Source/renderer/src/features/agent'

describe('agent 캡슐 — 공개 표면 스모크', () => {
  it('값 심볼 6종이 캡슐 경로에서 export된다', () => {
    expect(typeof OrchestrationCard).toBe('object') // memo 래핑 컴포넌트
    expect(typeof SubAgentInline).toBe('object') // memo 래핑 컴포넌트
    expect(typeof SubAgentFullscreen).toBe('function')
    expect(typeof TodosSection).toBe('function')
    expect(typeof ProviderStatusPanel).toBe('function')
    expect(typeof SubAgentSplitView).toBe('function')
  })
})
