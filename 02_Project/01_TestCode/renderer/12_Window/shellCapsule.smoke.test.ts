// @vitest-environment jsdom
// 공개 표면은 앱 소비처가 실제로 소비하는 심볼 전부다. UserProfile은 타입이라 import type 성립(typecheck)으로 확인한다.
import { describe, it, expect } from 'vitest'
import * as shell from '@renderer/12_Window'
import {
  Sidebar,
  SettingsModal,
  Profile,
  TitleBar,
  ResizeHandles,
  PaneSplitter,
  ZoomControl,
} from '@renderer/12_Window'
import type { UserProfile } from '@renderer/12_Window'

describe('shell 캡슐 — 공개 표면 스모크', () => {
  it('값 심볼 7종이 캡슐 경로에서 export된다', () => {
    expect(typeof Sidebar).toBe('object') // memo 래핑 컴포넌트
    expect(typeof SettingsModal).toBe('function')
    expect(typeof Profile).toBe('function')
    expect(typeof TitleBar).toBe('object')
    expect(typeof ResizeHandles).toBe('object')
    expect(typeof PaneSplitter).toBe('function')
    expect(typeof ZoomControl).toBe('function')
    expect(Object.keys(shell).sort()).toEqual(
      ['PaneSplitter', 'Profile', 'ResizeHandles', 'SettingsModal', 'Sidebar', 'TitleBar', 'ZoomControl'],
    )
  })

  it('UserProfile 타입이 캡슐 경로에서 export된다 (컴파일 성립으로 확인)', () => {
    const probe: UserProfile | null = null
    expect(probe).toBeNull()
  })
})
