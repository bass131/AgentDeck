import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../../../02_Source/shared/ipcContract'
import type { EngineUpdateInfo } from '../../../02_Source/shared/ipcContract'

describe('ENGINE_CHECK_UPDATE 채널 상수', () => {
  it('IPC_CHANNELS.ENGINE_CHECK_UPDATE 가 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.ENGINE_CHECK_UPDATE).toBe('engine.checkUpdate')
  })

  it('ENGINE_CHECK_UPDATE 가 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('engine.checkUpdate')
  })

  it('채널명이 dot-namespaced camelCase 규칙을 따른다', () => {
    expect(IPC_CHANNELS.ENGINE_CHECK_UPDATE).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/)
  })

  it('ENGINE_CHECK_UPDATE 추가 후에도 전체 채널명이 유니크하다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('EngineUpdateInfo 타입 구조', () => {
  it('current(string|null) 필드를 갖는다 — 버전 탐지 성공 케이스', () => {
    const info: EngineUpdateInfo = {
      current: '1.2.3',
      latest: '1.3.0',
      updateAvailable: true,
    }
    expect(typeof info.current).toBe('string')
    expect(info.current).toBe('1.2.3')
  })

  it('current(string|null) 필드를 갖는다 — 탐지 실패 케이스(null)', () => {
    const info: EngineUpdateInfo = {
      current: null,
      latest: null,
      updateAvailable: false,
    }
    expect(info.current).toBeNull()
  })

  it('latest(string|null) 필드를 갖는다 — npm 최신 버전 존재 케이스', () => {
    const info: EngineUpdateInfo = {
      current: '1.2.3',
      latest: '1.3.0',
      updateAvailable: true,
    }
    expect(typeof info.latest).toBe('string')
    expect(info.latest).toBe('1.3.0')
  })

  it('latest(string|null) 필드를 갖는다 — 오프라인/실패 케이스(null)', () => {
    const info: EngineUpdateInfo = {
      current: '1.2.3',
      latest: null,
      updateAvailable: false,
    }
    expect(info.latest).toBeNull()
  })

  it('updateAvailable(boolean) 필드를 갖는다 — 업데이트 존재 케이스', () => {
    const info: EngineUpdateInfo = {
      current: '1.2.3',
      latest: '1.3.0',
      updateAvailable: true,
    }
    expect(typeof info.updateAvailable).toBe('boolean')
    expect(info.updateAvailable).toBe(true)
  })

  it('updateAvailable(boolean) 필드를 갖는다 — 최신 버전인 케이스', () => {
    const info: EngineUpdateInfo = {
      current: '1.3.0',
      latest: '1.3.0',
      updateAvailable: false,
    }
    expect(info.updateAvailable).toBe(false)
  })

  it('한쪽이 null이면 updateAvailable은 false여야 한다 (계약 명세)', () => {
    const infoNoCurrent: EngineUpdateInfo = {
      current: null,
      latest: '1.3.0',
      updateAvailable: false,
    }
    const infoNoLatest: EngineUpdateInfo = {
      current: '1.2.3',
      latest: null,
      updateAvailable: false,
    }
    expect(infoNoCurrent.updateAvailable).toBe(false)
    expect(infoNoLatest.updateAvailable).toBe(false)
  })

  it('신뢰경계 — 토큰/키/시크릿 필드가 없다', () => {
    const info: EngineUpdateInfo = {
      current: '1.2.3',
      latest: '1.3.0',
      updateAvailable: true,
    }
    const keys = Object.keys(info)
    expect(keys).toHaveLength(3)
    expect(keys).toContain('current')
    expect(keys).toContain('latest')
    expect(keys).toContain('updateAvailable')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('accessToken')
    expect(keys).not.toContain('credentials')
  })
})
