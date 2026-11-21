// 실물 알림 포트(Electron Notification). 알림 하나를 띄우고, 사람이 누르면 onClick을 한 번 부른다.
// 누르거나 닫을 때까지 알림 객체를 쥐고 있다(놓으면 Windows에서 누름이 오지 않을 수 있다). 지원하지 않는 곳에서는 띄우지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  made: [] as { opts: unknown; handlers: Map<string, () => void>; shown: number }[],
  supported: true,
}))

vi.mock('electron', () => {
  class Notification {
    static isSupported(): boolean { return h.supported }
    readonly handlers = new Map<string, () => void>()
    shown = 0
    constructor(opts: unknown) { h.made.push({ opts, handlers: this.handlers, shown: 0 }) }
    on(ev: string, fn: () => void): this { this.handlers.set(ev, fn); return this }
    show(): void { h.made[h.made.length - 1].shown++ }
  }
  return { Notification }
})

import { createNotifyPort } from '@main/05_Loop/realPorts/notifyPort'

beforeEach(() => {
  h.made.length = 0
  h.supported = true
})

describe('실물 알림 포트 (M10 G5)', () => {
  it('제목·본문으로 알림을 띄우고, 누르면 onClick을 한 번 부른 뒤 쥔 것을 놓는다', () => {
    const port = createNotifyPort()
    const onClick = vi.fn()
    port.show({ title: 'AgentDeck', body: 'practice — 멈춤', onClick })
    expect(h.made).toHaveLength(1)
    expect(h.made[0].opts).toMatchObject({ title: 'AgentDeck', body: 'practice — 멈춤' })
    expect(h.made[0].shown).toBe(1)
    expect(port.held()).toBe(1)
    h.made[0].handlers.get('click')?.()
    h.made[0].handlers.get('click')?.()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(port.held()).toBe(0)
  })

  it('닫히면 놓는다. 알림을 지원하지 않으면 띄우지 않는다', () => {
    const port = createNotifyPort()
    port.show({ title: 't', body: 'b', onClick: vi.fn() })
    h.made[0].handlers.get('close')?.()
    expect(port.held()).toBe(0)
    h.supported = false
    port.show({ title: 't', body: 'b', onClick: vi.fn() })
    expect(h.made).toHaveLength(1)
  })
})
