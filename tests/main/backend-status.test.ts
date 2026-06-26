/**
 * backend-status.test.ts — B1 듀얼 프로바이더 상태 집계 (순수 단위)
 *
 * buildBackendStatuses(deps) 가 registry 백엔드 목록을 순회하여
 * BackendStatus[] 를 만든다. 주입형 deps 로 격리 테스트.
 *
 * 검증:
 *  - claude authed 결합(getAuthed → engine-state.authed) + 버전/최신버전 전파
 *  - codex 스텁(available=false, version/latestVersion=null, authed=false)
 *  - graceful: 어댑터 메서드 throw → 해당 필드 안전 기본값(throw 전파 X)
 *  - name 은 BACKEND_LABELS 매핑
 *  - 신뢰경계: 반환 객체에 6개 필드만(토큰/시크릿 누수 0)
 */
import { describe, it, expect } from 'vitest'
import { buildBackendStatuses } from '../../src/main/backend-status'
import { BACKEND_LABELS } from '../../src/shared/ipc-contract'
import type { BackendId } from '../../src/shared/ipc-contract'

type BackendLike = {
  id: BackendId
  isAvailable(): Promise<boolean>
  version(): Promise<string | null>
  latestVersion(): Promise<string | null>
}

function fakeBackend(
  id: BackendId,
  opts: Partial<{ available: boolean; version: string | null; latest: string | null; throws: boolean }> = {}
): BackendLike {
  return {
    id,
    isAvailable: async () => {
      if (opts.throws) throw new Error('boom')
      return opts.available ?? false
    },
    version: async () => {
      if (opts.throws) throw new Error('boom')
      return opts.version ?? null
    },
    latestVersion: async () => {
      if (opts.throws) throw new Error('boom')
      return opts.latest ?? null
    }
  }
}

describe('buildBackendStatuses', () => {
  it('claude-code: authed 결합 + 버전/최신버전 전파 + 이름 매핑', async () => {
    const [claude] = await buildBackendStatuses({
      backends: [fakeBackend('claude-code', { available: true, version: '1.2.3', latest: '1.3.0' })],
      getAuthed: async (id) => id === 'claude-code'
    })
    expect(claude).toEqual({
      id: 'claude-code',
      name: BACKEND_LABELS['claude-code'],
      available: true,
      version: '1.2.3',
      latestVersion: '1.3.0',
      authed: true
    })
  })

  it('codex 스텁: available=false, version/latestVersion=null, authed=false', async () => {
    const [codex] = await buildBackendStatuses({
      backends: [fakeBackend('codex', { available: false, version: null, latest: null })],
      getAuthed: async () => false
    })
    expect(codex).toMatchObject({
      id: 'codex',
      name: BACKEND_LABELS['codex'],
      available: false,
      version: null,
      latestVersion: null,
      authed: false
    })
  })

  it('graceful: 어댑터 메서드 throw → 안전 기본값(예외 전파 X)', async () => {
    const result = await buildBackendStatuses({
      backends: [fakeBackend('claude-code', { throws: true })],
      getAuthed: async () => {
        throw new Error('auth boom')
      }
    })
    expect(result[0]).toMatchObject({
      id: 'claude-code',
      available: false,
      version: null,
      latestVersion: null,
      authed: false
    })
  })

  it('등록 순서 보존 + 다중 백엔드 집계', async () => {
    const result = await buildBackendStatuses({
      backends: [
        fakeBackend('claude-code', { available: true, version: '1.0.0' }),
        fakeBackend('codex', { available: false })
      ],
      getAuthed: async (id) => id === 'claude-code'
    })
    expect(result.map((b) => b.id)).toEqual(['claude-code', 'codex'])
  })

  it('신뢰경계: 반환 객체는 정확히 6개 필드만(토큰/시크릿 누수 0)', async () => {
    const result = await buildBackendStatuses({
      backends: [fakeBackend('claude-code', { available: true, version: '1.0.0' })],
      getAuthed: async () => true
    })
    const keys = Object.keys(result[0]).sort()
    expect(keys).toEqual(['authed', 'available', 'id', 'latestVersion', 'name', 'version'])
    // 민감 키가 없어야 함
    for (const forbidden of ['token', 'accessToken', 'apiKey', 'key', 'secret', 'credentials']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})
