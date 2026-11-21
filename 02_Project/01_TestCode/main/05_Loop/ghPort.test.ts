// 실행 층(gh 인자)과 순수 JSON 해석 층을 나눠 본다. 해석은 녹취 JSON 픽스처로 시험한다.
// findPr는 열림·병합·닫힘 중 가장 최근 것, ciStatus는 머리 SHA와 검사 묶음을 한 호출로 받고, 새 머리의 검사가 시작 전이거나
// rollup이 비면 pending이다. 모르는 값은 pending이고(통과로 떨어지지 않는다), PR 상태가 모르는 값이면 던진다.
import { describe, expect, it } from 'vitest'
import { parseCiStatus, parsePr, pickLatestPr, prNumberFromUrl, repoSlugOf } from '@main/05_Loop/realPorts/ghParse'
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

  // 실측: 같은 머리에 같은 이름 검사가 둘(push·pull_request) 돌면 하나가 끝나도 다른 하나를 기다린다.
  it('[M11-G3 M09-11] 같은 이름 검사가 둘이면 모두 성공해야 success다 — 하나가 도는 중이면 pending, 하나가 실패면 failure', () => {
    const run = (status: string, conclusion: string | null) => ({ __typename: 'CheckRun', name: 'hard-gates', status, conclusion })
    const two = (a: unknown, b: unknown) => ({ headRefOid: 'f'.repeat(40), statusCheckRollup: [a, b] })
    expect(parseCiStatus(two(run('COMPLETED', 'SUCCESS'), run('IN_PROGRESS', null)), ['hard-gates']).state).toBe('pending')
    expect(parseCiStatus(two(run('COMPLETED', 'SUCCESS'), run('COMPLETED', 'FAILURE')), ['hard-gates']).state).toBe('failure')
    expect(parseCiStatus(two(run('COMPLETED', 'SUCCESS'), run('COMPLETED', 'SUCCESS')), ['hard-gates']).state).toBe('success')
  })

  it('gh pr create 출력에서 PR 번호를 읽는다', () => {
    expect(prNumberFromUrl(fx.CREATE_STDOUT)).toBe(101)
    expect(prNumberFromUrl('Warning: 1 uncommitted change\nhttps://github.com/a/b/pull/7\n')).toBe(7)
    expect(prNumberFromUrl('no url')).toBeNull()
  })
})

// gh도 실행기 환경(자격 있음)에서 git을 부를 수 있어, 호출 직전에 git 설정을 대조한다
describe('실행 층 — 설정 대조', () => {
  it('대조가 던지면 gh를 부르지 않는다', async () => {
    let asked = 0
    let ran = 0
    const exec = createGhExec({
      cwd: '.', repo: 'github.com/o/r', run: async () => { ran++; return { code: 0, stdout: '', stderr: '', timedOut: false } },
      guard: { assert: async () => { asked++; throw new Error('실행기 git 설정이 실행기 밖에서 바뀌었다') } },
    })
    await expect(exec(['pr', 'view', '1'])).rejects.toThrow('설정이 실행기 밖에서')
    expect(asked).toBe(1)
    expect(ran).toBe(0)
  })
})

// gh는 git 설정(remote.*.gh-resolved)으로 기본 저장소를 고른다. 실행기 gh는 열 때 origin 주소에서 정한
// HOST/OWNER/REPO를 모든 호출에 -R로 준다.
describe('실행 층 — 저장소 고정(-R)', () => {
  it('모든 gh 호출에 -R HOST/OWNER/REPO를 하위 명령 바로 뒤에 넣고, 업데이트 알림·질의를 끈다', async () => {
    const seen: { file: string; args: readonly string[]; env?: NodeJS.ProcessEnv }[] = []
    const exec = createGhExec({
      cwd: '.', repo: 'github.com/acme/widgets', env: { PATH: 'x' },
      run: async (file, args, o) => { seen.push({ file, args, env: o.env }); return { code: 0, stdout: '[]', stderr: '', timedOut: false } },
    })
    const port = createGhPort(exec)
    await port.findPr('goal/M1-G1', 'milestone/M1')
    await port.ciStatus(7).catch(() => undefined)
    await port.getPr(7).catch(() => undefined)
    expect(seen.length).toBeGreaterThanOrEqual(3)
    for (const s of seen) {
      expect(s.file).toBe('gh')
      expect(s.args.slice(2, 4)).toEqual(['-R', 'github.com/acme/widgets'])
      expect(s.env?.GH_PROMPT_DISABLED).toBe('1')
    }
    expect(seen[0].args.slice(0, 2)).toEqual(['pr', 'list'])
  })

  it('repo view는 -R이 없어 고정 저장소를 위치 인자로 넣는다 — 기본 브랜치를 그 저장소에서 읽는다(M09 G4)', async () => {
    // 실측(gh 2.96.0, 2026-11-19): `gh repo view github.com/octocat/Hello-World --json defaultBranchRef`가
    // {"defaultBranchRef":{"name":"master"}}를 돌려줬다. repo view의 도움말에는 -R이 없고 위치 인자 [<repository>]만 있다.
    const seen: (readonly string[])[] = []
    const exec = createGhExec({
      cwd: '.', repo: 'github.com/acme/widgets',
      run: async (_f, args) => { seen.push(args); return { code: 0, stdout: '{"defaultBranchRef":{"name":"main"}}', stderr: '', timedOut: false } },
    })
    expect(await createGhPort(exec).defaultBranch?.()).toBe('main')
    expect(seen[0]).toEqual(['repo', 'view', 'github.com/acme/widgets', '--json', 'defaultBranchRef'])
  })

  it('기본 브랜치를 읽지 못하면(오류·빈 이름·이상한 이름) null이다', async () => {
    const replies = [
      { code: 1, stdout: '', stderr: 'HTTP 404' },
      { code: 0, stdout: '{"defaultBranchRef":null}', stderr: '' },
      { code: 0, stdout: '{"defaultBranchRef":{"name":"-x"}}', stderr: '' },
      { code: 0, stdout: 'not json', stderr: '' },
    ]
    for (const r of replies) {
      const port = createGhPort(async () => r)
      expect(await port.defaultBranch?.()).toBeNull()
    }
  })

  it('저장소 이름이 HOST/OWNER/REPO 꼴이 아니면 만들지 않는다', () => {
    expect(() => createGhExec({ cwd: '.', repo: '' })).toThrow()
    expect(() => createGhExec({ cwd: '.', repo: '-R' })).toThrow()
    expect(() => createGhExec({ cwd: '.', repo: 'acme/widgets --jq x' })).toThrow()
  })

  it('origin 주소에서 HOST/OWNER/REPO를 읽는다 — https·ssh·scp 꼴, 자격 부분과 .git을 뗀다. 로컬 경로는 null', () => {
    expect(repoSlugOf('https://github.com/acme/widgets.git')).toBe('github.com/acme/widgets')
    expect(repoSlugOf('https://x-access-token:abc@github.com/acme/widgets')).toBe('github.com/acme/widgets')
    expect(repoSlugOf('git@github.com:acme/widgets.git')).toBe('github.com/acme/widgets')
    expect(repoSlugOf('ssh://git@ghe.example.com:2222/acme/widgets.git')).toBe('ghe.example.com/acme/widgets')
    expect(repoSlugOf('https://GitHub.com/Acme/Widgets/')).toBe('github.com/Acme/Widgets')
    expect(repoSlugOf('C:/tmp/remote.git')).toBeNull()
    expect(repoSlugOf('/tmp/remote.git')).toBeNull()
    expect(repoSlugOf('file:///tmp/remote.git')).toBeNull()
    expect(repoSlugOf('https://github.com/acme')).toBeNull()
    expect(repoSlugOf('https://github.com/acme/widgets/extra')).toBeNull()
    expect(repoSlugOf('ext::sh -c x')).toBeNull()
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

  it('openPrHeads는 base로 가는 열린 PR의 번호와 머리 브랜치를 읽고, 꼴이 틀리거나 오류면 던진다', async () => {
    const { exec, calls } = fakeExec(() => ok('[{"number":7,"headRefName":"agentdeck/charter-20261121T010000"},{"number":9,"headRefName":"feat/x"}]'))
    expect(await createGhPort(exec).openPrHeads?.('master')).toEqual([
      { number: 7, head: 'agentdeck/charter-20261121T010000' }, { number: 9, head: 'feat/x' },
    ])
    const a = calls[0].args
    expect(a.slice(0, 2)).toEqual(['pr', 'list'])
    expect(a[a.indexOf('--base') + 1]).toBe('master')
    expect(a[a.indexOf('--state') + 1]).toBe('open')
    expect(a[a.indexOf('--json') + 1]).toBe('number,headRefName')
    await expect(createGhPort(fakeExec(() => ok('[{"number":"7"}]')).exec).openPrHeads?.('master')).rejects.toThrow()
    await expect(createGhPort(fakeExec(() => ({ code: 1, stdout: '', stderr: 'HTTP 502' })).exec).openPrHeads?.('master')).rejects.toThrow(/502/)
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
