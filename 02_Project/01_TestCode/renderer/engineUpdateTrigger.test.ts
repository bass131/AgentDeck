// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  ENGINE_SEEN_KEY,
  decideEngineNotice,
} from '../../../02_Project/00_Source/renderer/src/lib/engineUpdateTrigger'
import type { EngineUpdateInfo } from '../../../02_Project/00_Source/shared/ipcContract'

describe('ENGINE_SEEN_KEY', () => {
  it('engine.seenLatest 문자열', () => {
    expect(ENGINE_SEEN_KEY).toBe('engine.seenLatest')
  })
})

describe('decideEngineNotice — info null/undefined → false', () => {
  it('info=null → false', () => {
    expect(decideEngineNotice(null, '')).toBe(false)
  })

  it('info=undefined → false', () => {
    expect(decideEngineNotice(undefined, '')).toBe(false)
  })
})

describe('decideEngineNotice — updateAvailable=false → false (업데이트 없음)', () => {
  it('updateAvailable=false, latest 있음, seen 다름 → false', () => {
    const info: EngineUpdateInfo = { current: '1.0.0', latest: '1.1.0', updateAvailable: false }
    expect(decideEngineNotice(info, '')).toBe(false)
  })

  it('updateAvailable=false, latest=null → false', () => {
    const info: EngineUpdateInfo = { current: '1.0.0', latest: null, updateAvailable: false }
    expect(decideEngineNotice(info, '')).toBe(false)
  })
})

describe('decideEngineNotice — latest=null → false (최신 버전 미탐지)', () => {
  it('updateAvailable=true, latest=null → false', () => {
    const info: EngineUpdateInfo = { current: '1.0.0', latest: null, updateAvailable: true }
    expect(decideEngineNotice(info, '')).toBe(false)
  })
})

describe('decideEngineNotice — latest === seen → false (이전에 본 버전)', () => {
  it("latest='1.1.0', seen='1.1.0' → false", () => {
    const info: EngineUpdateInfo = { current: '1.0.0', latest: '1.1.0', updateAvailable: true }
    expect(decideEngineNotice(info, '1.1.0')).toBe(false)
  })

  it("latest='2.0.0', seen='2.0.0' → false", () => {
    const info: EngineUpdateInfo = { current: '1.5.0', latest: '2.0.0', updateAvailable: true }
    expect(decideEngineNotice(info, '2.0.0')).toBe(false)
  })
})

describe('decideEngineNotice — 알림 표시 조건 충족 → true', () => {
  it("updateAvailable=true, latest='1.1.0', seen='' (첫 실행) → true", () => {
    const info: EngineUpdateInfo = { current: '1.0.0', latest: '1.1.0', updateAvailable: true }
    expect(decideEngineNotice(info, '')).toBe(true)
  })

  it("updateAvailable=true, latest='2.0.0', seen='1.0.0' (이전과 다른 버전) → true", () => {
    const info: EngineUpdateInfo = { current: '1.5.0', latest: '2.0.0', updateAvailable: true }
    expect(decideEngineNotice(info, '1.0.0')).toBe(true)
  })

  it("updateAvailable=true, latest='1.2.3', seen='1.2.2' (패치 업) → true", () => {
    const info: EngineUpdateInfo = { current: '1.2.2', latest: '1.2.3', updateAvailable: true }
    expect(decideEngineNotice(info, '1.2.2')).toBe(true)
  })

  it("updateAvailable=true, latest='3.0.0', seen=다른 버전 → true", () => {
    const info: EngineUpdateInfo = { current: '2.9.9', latest: '3.0.0', updateAvailable: true }
    expect(decideEngineNotice(info, '2.9.9')).toBe(true)
  })
})
