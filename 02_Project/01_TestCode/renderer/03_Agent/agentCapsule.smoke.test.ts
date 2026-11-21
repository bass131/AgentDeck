// @vitest-environment jsdom
// 공개 표면은 앱 소비처가 실제로 소비하는 심볼 전부다. Props 타입은 캡슐 밖 실소비가 없어 등재하지 않는다.
import { describe, it, expect } from 'vitest'
import {
  OrchestrationCard,
  SubAgentInline,
  SubAgentFullscreen,
  TodosSection,
  ProviderStatusPanel,
  SubAgentSplitView,
  HookTimeline,
  LoopStatusBanner,
  PermissionCard,
} from '@renderer/03_Agent'

describe('agent 캡슐 — 공개 표면 스모크', () => {
  it('값 심볼 9종이 캡슐 경로에서 export된다', () => {
    expect(typeof HookTimeline).toBe('function')
    expect(typeof LoopStatusBanner).toBe('function')
    expect(typeof PermissionCard).toBe('function')
    expect(typeof OrchestrationCard).toBe('object') // memo 래핑 컴포넌트
    expect(typeof SubAgentInline).toBe('object') // memo 래핑 컴포넌트
    expect(typeof SubAgentFullscreen).toBe('function')
    expect(typeof TodosSection).toBe('function')
    expect(typeof ProviderStatusPanel).toBe('function')
    expect(typeof SubAgentSplitView).toBe('function')
  })
})
