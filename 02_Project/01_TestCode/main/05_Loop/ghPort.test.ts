// M09 G2 실물 gh 포트 — 실행 층(gh 인자)과 순수 JSON 해석 층을 나눠 본다. 해석은 녹취 JSON 픽스처로 시험한다.
// findPr는 열림·병합·닫힘 중 가장 최근 것, ciStatus는 머리 SHA와 검사 묶음을 한 호출로 받고, 새 머리의 검사가 시작 전이거나
// rollup이 비면 pending이다. 모르는 값은 pending이고(통과로 떨어지지 않는다), PR 상태가 모르는 값이면 던진다.
import { describe, expect, it } from 'vitest'
import { parseCiStatus, parsePr, pickLatestPr, prNumberFromUrl } from '@main/05_Loop/realPorts/ghParse'
import { createGhExec, createGhPort, type GhExec } from '@main/05_Loop/realPorts/ghPort'
import type { CommandResult } from '@main/05_Loop/ports'
import * as fx from '../00_Helpers/ghFixtures'

describe('해석 층 — 녹취 픽스처', () => {
  it('병합된 PR은 머리와 병합 커밋을, 닫힌 PR은 병합 커밋 없이 읽는다', () => {
    expect(parsePr(JSON.parse(fx.VIEW_93_MERGED))).toEqual({
      number: 93, state: 'merged', headSha: '4721ebb5b52ea55cfbbed040b09e599e8ef5d481', mergeCommitSha: '4c345ed401fbb3e9813f6198fa6c467f40fa44ac',
    })
    expect(parsePr(JSON.parse(fx.LIST_CLOSED_30)[0])).toEqual({
      number: 30, state: 'closed', headSha: 'e1c109ab4f9b7d2b80699c7a03e065a716fbf386', mergeCommitSha: null,
    })
    expect(parsePr(JSON.parse(fx.VIEW_OPEN_NO_CHECKS))).toMatchObject({ state: 'open', mergeCommitSha: null })
  })

  it('모르는 PR 상태나 빠진 칸은 던진다 — 조용히 열림·닫힘으로 떨어지지 않는다', () => {
    expect(() => parsePr({ number: 1, state: 'DRAFTY', headRefOid: 'a'.repeat(40), mergeCommit: null })).toThrow()
    expect(() => parsePr({ number: 1, state: 'OPEN', mergeCommit: null })).toThrow()
    expect(() => parsePr(null)).toThrow()
  })

  it('findPr의 고르기 — 목록 순서와 관계없이 가장 최근에 만든 PR(열림·병합·닫힘 모두)', () => {
    expect(pickLatestPr(JSON.parse(fx.LIST_SAME_HEAD_CLOSED_THEN_MERGED))?.number).toBe(93)
    const reopened = [...JSON.parse(fx.LIST_SAME_HEAD_CLOSED_THEN_MERGED), { ...JSON.parse(fx.VIEW_OPEN_NO_CHECKS), createdAt: '2026-11-19T00:00:00Z' }]
    expect(pickLatestPr(reopened)).toMatchObject({ number: 101, state: 'open' })
    expect(pickLatestPr(JSON.parse(fx.LIST_CLOSED_30))).toMatchObject({ number: 30, state: 'closed' })
    expect(pickLatestPr([])).toBeNull()
    expect(() => pickLatestPr({})).toThrow()
  })

  it('CI — 통과 녹취는 success, 머리 SHA는 그 응답의 headRefOid다', () => {
    expect(parseCiStatus(JSON.parse(fx.VIEW_93_MERGED))).toEqual({
      state: 'success', headSha: '4721ebb5b52ea55cfbbed040b09e599e8ef5d481', summary: 'hard-gates SUCCESS',
    })
  })

  it('CI — 빈 rollup(새 머리의 검사가 아직 없다)과 진행 중 검사는 pending, 실패는 failure', () => {
    expect(parseCiStatus({ ...JSON.parse(fx.ROLLUP_EMPTY_71), headRefOid: 'a'.repeat(40) }).state).toBe('pending')
    expect(parseCiStatus(JSON.parse(fx.VIEW_OPEN_NO_CHECKS))).toMatchObject({ state: 'pending', headSha: 'a'.repeat(40) })
    expect(parseCiStatus(JSON.parse(fx.VIEW_OPEN_IN_PROGRESS)).state).toBe('pending')
    expect(parseCiStatus(JSON.parse(fx.VIEW_OPEN_FAILED))).toMatchObject({ state: 'failure', summary: 'hard-gates FAILURE' })
  })

  it('CI — StatusContext 꼴도 읽고, 필수 검사 이름을 주면 그것만 보며 없으면 pending이다', () => {
    const mixed = JSON.parse(fx.VIEW_OPEN_STATUS_CONTEXT)
    expect(parseCiStatus(mixed).state).toBe('pending')
    expect(parseCiStatus(mixed, ['hard-gates']).state).toBe('success')
    expect(parseCiStatus(JSON.parse(fx.VIEW_93_MERGED), ['hard-gates', 'e2e']).state).toBe('pending')
    const unknown = { headRefOid: 'e'.repeat(40), statusCheckRollup: [{ __typename: 'CheckRun', name: 'x', status: 'COMPLETED', conclusion: 'MYSTERY' }] }
    expect(parseCiStatus(unknown).state).toBe('pending')
    expect(() => parseCiStatus({ statusCheckRollup: [] })).toThrow()
  })

  it('gh pr create 출력에서 PR 번호를 읽는다', () => {
    expect(prNumberFromUrl(fx.CREATE_STDOUT)).toBe(101)
    expect(prNumberFromUrl('Warning: 1 uncommitted change\nhttps://github.com/a/b/pull/7\n')).toBe(7)
    expect(prNumberFromUrl('no url')).toBeNull()
  })
})

// G2 검수 차단 1 — gh도 실행기 환경(자격 있음)에서 git을 부를 수 있어, 호출 직전에 git 설정을 대조한다
describe('실행 층 — 설정 대조', () => {
  it('대조가 던지면 gh를 부르지 않는다', async () => {
    let asked = 0
    const exec = createGhExec({ cwd: '.', guard: { assert: async () => { asked++; throw new Error('실행기 git 설정이 실행기 밖에서 바뀌었다') } } })
    await expect(exec(['pr', 'view', '1'])).rejects.toThrow('설정이 실행기 밖에서')
    expect(asked).toBe(1)
  })
})

describe('실행 층 — gh 인자와 오류', () => {
  function fakeExec(reply: (args: string[], input?: string) => CommandResult): { exec: GhExec; calls: { args: string[]; input?: string }[] } {
    const calls: { args: string[]; input?: string }[] = []
    return { calls, exec: async (args, input) => { calls.push({ args, input }); return reply(args, input) } }
  }
  const ok = (stdout: string): CommandResult => ({ code: 0, stdout, stderr: '' })

  it('findPr는 head·base·모든 상태로 묻는다', async () => {
    const { exec, calls } = fakeExec(() => ok(fx.LIST_SAME_HEAD_CLOSED_THEN_MERGED))
    const pr = await createGhPort(exec).findPr('goal/M1-G1', 'milestone/M1')
    expect(pr?.number).toBe(93)
    const a = calls[0].args
    expect(a.slice(0, 2)).toEqual(['pr', 'list'])
    expect(a[a.indexOf('--head') + 1]).toBe('goal/M1-G1')
    expect(a[a.indexOf('--base') + 1]).toBe('milestone/M1')
    expect(a[a.indexOf('--state') + 1]).toBe('all')
    expect(a[a.indexOf('--json') + 1].split(',')).toEqual(expect.arrayContaining(['number', 'state', 'headRefOid', 'mergeCommit', 'createdAt']))
  })

  it('ciStatus는 머리와 검사 묶음을 한 번의 pr view로 받는다', async () => {
    const { exec, calls } = fakeExec(() => ok(fx.VIEW_93_MERGED))
    const ci = await createGhPort(exec, { requiredChecks: ['hard-gates'] }).ciStatus(93)
    expect(ci.state).toBe('success')
    expect(calls).toHaveLength(1)
    expect(calls[0].args[calls[0].args.indexOf('--json') + 1].split(',')).toEqual(expect.arrayContaining(['headRefOid', 'statusCheckRollup']))
  })

  it('getPr는 없는 PR이면 null, 그 밖의 gh 오류는 던진다', async () => {
    // 녹취 — `gh pr view 999999 --json number`(2026-11-19, 이 저장소): exit 1, stderr 아래 한 줄
    const missing = fakeExec(() => ({ code: 1, stdout: '', stderr: 'GraphQL: Could not resolve to a PullRequest with the number of 999999. (repository.pullRequest)\n' }))
    expect(await createGhPort(missing.exec).getPr(999)).toBeNull()
    const down = fakeExec(() => ({ code: 1, stdout: '', stderr: 'gh: HTTP 502 Bad Gateway' }))
    await expect(createGhPort(down.exec).getPr(1)).rejects.toThrow(/502/)
    await expect(createGhPort(down.exec).ciStatus(1)).rejects.toThrow()
    await expect(createGhPort(down.exec).findPr('a', 'b')).rejects.toThrow()
  })

  it('createPr는 본문을 표준 입력(--body-file -)으로 넘기고, 만든 PR을 다시 읽어 돌려준다', async () => {
    const { exec, calls } = fakeExec((args) => (args[1] === 'create' ? ok(fx.CREATE_STDOUT) : ok(fx.VIEW_OPEN_NO_CHECKS)))
    const pr = await createGhPort(exec).createPr({ head: 'goal/M1-G1', base: 'milestone/M1', title: 'G1: 첫 goal', body: '본문 `code` $(rm -rf /)' })
    expect(pr).toMatchObject({ number: 101, state: 'open' })
    const create = calls[0]
    expect(create.args[create.args.indexOf('--body-file') + 1]).toBe('-')
    expect(create.input).toBe('본문 `code` $(rm -rf /)')
    expect(create.args[create.args.indexOf('--title') + 1]).toBe('G1: 첫 goal')
    expect(calls[1].args.slice(0, 3)).toEqual(['pr', 'view', '101'])
  })
})
