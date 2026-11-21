// gh 확인 — `gh --version`을 짧은 시간 제한으로 돌려 있음·버전·없음·시간 초과만 돌려준다. 경로·환경 값은 싣지 않는다.
import { describe, expect, it, vi } from 'vitest'
import { checkGh, type GhRun } from '@main/14_GitHub/ghCli'
import { GH_CHECK_TIMEOUT_MS } from '@shared/ipcContract'

const VERSION_OUT = 'gh version 2.62.0 (2024-11-14)\nhttps://github.com/cli/cli/releases/tag/v2.62.0\n'

describe('checkGh', () => {
  it('있으면 버전을 읽고, 실행 함수에 시간 제한을 넘긴다', async () => {
    const run = vi.fn<GhRun>(async () => ({ kind: 'exited', code: 0, stdout: VERSION_OUT }))
    expect(await checkGh(run)).toEqual({ state: 'present', version: '2.62.0' })
    expect(run).toHaveBeenCalledWith(GH_CHECK_TIMEOUT_MS)
    expect(GH_CHECK_TIMEOUT_MS).toBe(5000)
  })

  it('버전 줄을 못 읽어도 실행됐으면 있음이다', async () => {
    expect(await checkGh(async () => ({ kind: 'exited', code: 0, stdout: 'something else' }))).toEqual({ state: 'present', version: null })
  })

  it('실행 파일이 없거나 실패로 끝나면 없음이다', async () => {
    expect(await checkGh(async () => ({ kind: 'missing' }))).toEqual({ state: 'absent' })
    expect(await checkGh(async () => ({ kind: 'exited', code: 1, stdout: '' }))).toEqual({ state: 'absent' })
    expect(await checkGh(async () => { throw new Error('spawn failed') })).toEqual({ state: 'absent' })
  })

  it('실행 함수가 시간 초과를 알리면 시간 초과다', async () => {
    expect(await checkGh(async () => ({ kind: 'timeout' }))).toEqual({ state: 'timeout' })
  })

  it('실행 함수가 끝나지 않아도 시간 제한이 지나면 시간 초과로 돌아온다', async () => {
    vi.useFakeTimers()
    try {
      const pending = checkGh(() => new Promise(() => {}), 50)
      await vi.advanceTimersByTimeAsync(2000)
      expect(await pending).toEqual({ state: 'timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('결과에는 상태와 버전 말고 아무것도 없다(경로·환경 값 없음)', async () => {
    const out = await checkGh(async () => ({ kind: 'exited', code: 0, stdout: `C:\\Program Files\\GitHub CLI\\gh.exe\n${VERSION_OUT}PATH=C:\\x` }))
    expect(Object.keys(out).sort()).toEqual(['state', 'version'])
    expect(JSON.stringify(out)).not.toMatch(/Program Files|PATH=/)
  })
})
