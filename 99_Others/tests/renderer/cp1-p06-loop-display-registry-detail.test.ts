import { describe, it, expect } from 'vitest'
import {
  createLoopDisplayRegistry,
  type LoopDisplayPendingCommand,
} from '../../../02_Source/renderer/src/store/loopDisplayRegistry'

describe('CP1 P06 ⑤ — LoopDisplayPendingCommand.detail 타입 추가', () => {
  it('detail 필드를 포함한 객체 리터럴이 LoopDisplayPendingCommand로 타입체크 통과(AppState.pendingCommand와 동형 회복)', () => {
    const withDetail: LoopDisplayPendingCommand = {
      name: 'goal',
      cardId: 'c1',
      beforeMsgs: 3,
      turns: 2,
      detail: '리팩토링 목표',
    }
    expect(withDetail.detail).toBe('리팩토링 목표')
  })

  it('detail 없는 기존 리터럴도 여전히 유효(optional — 하위호환)', () => {
    const withoutDetail: LoopDisplayPendingCommand = {
      name: 'goal',
      cardId: 'c2',
      beforeMsgs: 0,
    }
    expect(withoutDetail.detail).toBeUndefined()
  })

  it('sync/read 라운드트립이 pendingCommand.detail을 보존한다(런타임 회귀 가드)', () => {
    const registry = createLoopDisplayRegistry()
    registry.sync('conv-1', {
      activeLoops: [],
      loopsStoppedNotice: false,
      pendingCommand: { name: 'goal', cardId: 'c3', beforeMsgs: 1, turns: 4, detail: '목표 설명' },
    })
    expect(registry.read('conv-1')?.pendingCommand?.detail).toBe('목표 설명')
  })
})
