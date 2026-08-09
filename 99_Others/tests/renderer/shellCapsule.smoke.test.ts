// @vitest-environment jsdom
// 캡슐 경계 스모크 테스트 — shell 기능 캡슐(02_Source/renderer/src/features/shell)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
// 공개 표면 9종 = 앱 소비처(Shell·AppGate·SubAgentSplitView)가 실제로 소비하는
// 심볼 전부. UserProfile은 타입이라 런타임 단언 대상이 아니며 import type
// 성립(typecheck)으로 확인한다.
import { describe, it, expect } from 'vitest'
import {
  MultiWorkspace,
  Sidebar,
  SettingsModal,
  Profile,
  TitleBar,
  ResizeHandles,
  PaneSplitter,
  ZoomControl,
} from '../../../02_Source/renderer/src/features/shell'
import type { UserProfile } from '../../../02_Source/renderer/src/features/shell'

describe('shell 캡슐 — 공개 표면 스모크', () => {
  it('값 심볼 8종이 캡슐 경로에서 export된다', () => {
    expect(typeof MultiWorkspace).toBe('function')
    expect(typeof Sidebar).toBe('object') // memo 래핑 컴포넌트
    expect(typeof SettingsModal).toBe('function')
    expect(typeof Profile).toBe('function')
    expect(typeof TitleBar).toBe('object')
    expect(typeof ResizeHandles).toBe('object')
    expect(typeof PaneSplitter).toBe('function')
    expect(typeof ZoomControl).toBe('function')
  })

  it('UserProfile 타입이 캡슐 경로에서 export된다 (컴파일 성립으로 확인)', () => {
    const probe: UserProfile | null = null
    expect(probe).toBeNull()
  })
})
