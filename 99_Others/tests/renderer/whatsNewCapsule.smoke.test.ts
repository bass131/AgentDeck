// @vitest-environment node
// 캡슐 경계 스모크 테스트 — WhatsNew 기능 캡슐(02_Source/renderer/src/features/whats-new)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편(Step 3) 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
import { describe, it, expect } from 'vitest'
import {
  WhatsNew,
  SEEN_KEY,
  seriesOf,
  decideStartupModal,
} from '../../../02_Source/renderer/src/features/whats-new'

describe('WhatsNew 캡슐 — 공개 표면 스모크', () => {
  it('WhatsNew 컴포넌트가 캡슐 경로에서 export된다', () => {
    expect(WhatsNew).not.toBeUndefined()
    expect(typeof WhatsNew).toBe('function')
  })

  it('SEEN_KEY가 캡슐 경로에서 export된다', () => {
    expect(SEEN_KEY).not.toBeUndefined()
    expect(SEEN_KEY).toBe('whatsnew.seenVersion')
  })

  it('seriesOf가 캡슐 경로에서 export된다', () => {
    expect(seriesOf).not.toBeUndefined()
    expect(typeof seriesOf).toBe('function')
  })

  it('decideStartupModal이 캡슐 경로에서 export된다', () => {
    expect(decideStartupModal).not.toBeUndefined()
    expect(typeof decideStartupModal).toBe('function')
  })
})
