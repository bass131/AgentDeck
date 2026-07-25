/**
 * cp1-p06-loop-display-registry-detail.test.ts — CP1 Phase 06 ⑤:
 * loopDisplayRegistry.ts 주석 정직화 + LoopDisplayPendingCommand.detail 타입 추가.
 *
 * 배경(01.Phases/CP1-cwd-persist-sweep/06-backlog-sweep-renderer.md ⑤):
 * loopDisplayRegistry.ts의 LoopDisplayPendingCommand는 자신의 JSDoc에서
 * "reducer/types.ts AppState.pendingCommand와 동형(isomorphic)"이라고 주장한다.
 * 하지만 AppState['pendingCommand']는 FB2 P08에서 `detail?: string | null`
 * (goal 목표 텍스트, LoopStatusBanner 3단 정보위계의 "작업 주제")을 추가로 갖는 반면
 * LoopDisplayPendingCommand는 그 필드가 없다 — 주석의 "동형" 주장이 거짓(주석
 * 부정직)이 됐다. registry의 sync()는 객체를 필드별로 재구성하지 않고 참조를 그대로
 * 저장하므로 detail은 런타임엔 실제로 보존되지만, "detail을 포함하는 객체 리터럴을
 * LoopDisplayPendingCommand로 직접 타입 지정"하면 타입에 없는 필드라 컴파일 타임에
 * 초과 프로퍼티 오류가 난다 — 즉 타입 선언 자체가 실제 계약보다 좁다.
 *
 * 이 테스트는 (a) LoopDisplayPendingCommand 타입이 detail을 인식하는지(타입체크 시
 * 이 파일의 객체 리터럴이 통과해야 함) + (b) sync/read 라운드트립이 detail을 보존하는지
 * (런타임 회귀 가드) 둘 다 고정한다.
 */
import { describe, it, expect } from 'vitest'
import {
  createLoopDisplayRegistry,
  type LoopDisplayPendingCommand,
} from '../../../02.Source/renderer/src/store/loopDisplayRegistry'

describe('CP1 P06 ⑤ — LoopDisplayPendingCommand.detail 타입 추가', () => {
  it('detail 필드를 포함한 객체 리터럴이 LoopDisplayPendingCommand로 타입체크 통과(AppState.pendingCommand와 동형 회복)', () => {
    // 이 객체 리터럴이 타입 에러 없이 컴파일되는 것 자체가 검증이다(npm run typecheck 게이트).
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
