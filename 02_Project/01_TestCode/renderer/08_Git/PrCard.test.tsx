// @vitest-environment jsdom
// M07 G8 PR 카드 — main이 읽어 준 값만 보이고, 버튼 활성·확인 단계·병합 호출의 SHA를 고정한다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import type { PrView, PrReadResponse, PrMergeResponse } from '../../../../02_Project/00_Source/shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

afterEach(() => cleanup())

const SHA = 'f4e0ff3812cde4caf1585a73ac77d3f9836bc2dd'
const MERGE_SHA = '0123456789abcdef0123456789abcdef01234567'
const CWD = 'C:/Dev/AgentDeck'

const view = (over: Partial<PrView> = {}): PrView => ({
  owner: 'bass131', repo: 'AgentDeck', number: 74, title: 'G8 병합 버튼', url: 'https://github.com/bass131/AgentDeck/pull/74',
  state: 'open', draft: false, merged: false, mergeable: true, baseRef: 'master', headRef: 'feat/m07-g8-merge-button', headSha: SHA,
  protected: true, checks: [{ name: 'hard-gates', result: 'success' }], canMerge: true, reasons: [], notes: [], ...over,
})

let git: { prRead: ReturnType<typeof vi.fn>; prMerge: ReturnType<typeof vi.fn> }

function setApi(read: PrReadResponse, merge: PrMergeResponse = { status: 'merged', message: 'ok', mergeSha: MERGE_SHA }) {
  git = { prRead: vi.fn().mockResolvedValue(read), prMerge: vi.fn().mockResolvedValue(merge) }
  Object.defineProperty(window, 'api', { value: adaptFlatApi({ git }), writable: true, configurable: true })
}

beforeEach(() => setApi({ ok: true, pr: view() }))

async function renderCard(props: { cwd?: string | null; number?: number; url?: string }) {
  const { PrCard } = await import('@renderer/08_Git')
  const r = render(<PrCard cwd={props.cwd === undefined ? CWD : props.cwd} number={props.number} url={props.url} />)
  await act(async () => { await new Promise((res) => setTimeout(res, 0)) })
  return r
}

describe('PR 카드 (M07 G8)', () => {
  it('main이 읽은 번호·제목·base←head·짧은 SHA(전체는 title)·필수 검사를 보인다', async () => {
    await renderCard({ number: 74 })
    expect(git.prRead).toHaveBeenCalledWith({ cwd: CWD, number: 74, url: undefined })
    expect(screen.getByText('#74')).toBeTruthy()
    expect(screen.getByText('G8 병합 버튼')).toBeTruthy()
    expect(screen.getByText('master ← feat/m07-g8-merge-button')).toBeTruthy()
    const sha = screen.getByText('f4e0ff3')
    expect(sha.getAttribute('title')).toBe(SHA)
    expect(screen.getByText('hard-gates')).toBeTruthy()
    expect(screen.getByText('성공')).toBeTruthy()
    expect((screen.getByRole('button', { name: '병합' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('병합 조건을 채우지 못하면 버튼이 꺼지고 사유가 보인다', async () => {
    setApi({ ok: true, pr: view({ canMerge: false, checks: [{ name: 'hard-gates', result: 'pending' }], reasons: ['필수 검사 hard-gates: 대기 중'] }) })
    await renderCard({ number: 74 })
    expect((screen.getByRole('button', { name: '병합' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('필수 검사 hard-gates: 대기 중')).toBeTruthy()
  })

  it('병합을 누르면 전체 SHA를 다시 보이는 확인을 거치고, 취소하면 부르지 않는다', async () => {
    await renderCard({ number: 74 })
    fireEvent.click(screen.getByRole('button', { name: '병합' }))
    expect(screen.getByText(`이 커밋 ${SHA}를 master에 병합`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(git.prMerge).not.toHaveBeenCalled()
    expect(screen.queryByText(`이 커밋 ${SHA}를 master에 병합`)).toBeNull()
  })

  it('확인하면 보인 SHA로 병합을 부르고 병합 커밋 SHA를 보인다. 그 뒤 버튼은 다시 읽기 전까지 꺼진다', async () => {
    await renderCard({ number: 74 })
    fireEvent.click(screen.getByRole('button', { name: '병합' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '확인' }))
      await new Promise((res) => setTimeout(res, 0))
    })
    expect(git.prMerge).toHaveBeenCalledWith({ cwd: CWD, number: 74, sha: SHA })
    expect(screen.getByText(`병합했어요 — 병합 커밋 ${MERGE_SHA}`)).toBeTruthy()
    expect((screen.getByRole('button', { name: '병합' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('거부 사유를 카드에 보인다', async () => {
    setApi({ ok: true, pr: view() }, { status: 'refused', message: '화면의 머리 SHA가 마지막으로 읽은 값과 달라요' })
    await renderCard({ number: 74 })
    fireEvent.click(screen.getByRole('button', { name: '병합' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '확인' }))
      await new Promise((res) => setTimeout(res, 0))
    })
    expect(screen.getByText('병합하지 않았어요 — 화면의 머리 SHA가 마지막으로 읽은 값과 달라요')).toBeTruthy()
  })

  it('다른 저장소 PR이면 main의 거절 문구만 보이고 버튼이 없다', async () => {
    setApi({ ok: false, error: '다른 저장소 PR — 불러오지 않음', otherRepo: true })
    await renderCard({ url: 'https://github.com/x/y/pull/1' })
    expect(git.prRead).toHaveBeenCalledWith({ cwd: CWD, number: undefined, url: 'https://github.com/x/y/pull/1' })
    expect(screen.getByText('다른 저장소 PR — 불러오지 않음')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '병합' })).toBeNull()
  })

  it('작업 폴더가 없으면 읽지 않는다', async () => {
    await renderCard({ cwd: null, number: 74 })
    expect(git.prRead).not.toHaveBeenCalled()
  })

  it('읽는 동안에는 확인과 병합이 꺼진다 (검수 사소 5)', async () => {
    await renderCard({ number: 74 })
    fireEvent.click(screen.getByRole('button', { name: '병합' }))
    let release: (r: PrReadResponse) => void = () => {}
    git.prRead.mockImplementationOnce(() => new Promise<PrReadResponse>((res) => { release = res }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
      await new Promise((res) => setTimeout(res, 0))
    })
    expect((screen.getByRole('button', { name: '확인' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '병합' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(git.prMerge).not.toHaveBeenCalled()
    await act(async () => {
      release({ ok: true, pr: view() })
      await new Promise((res) => setTimeout(res, 0))
    })
    expect((screen.getByRole('button', { name: '병합' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('다시 렌더해도 마운트당 한 번만 읽고, 다시 읽기를 누르면 또 읽는다', async () => {
    const { PrCard } = await import('@renderer/08_Git')
    const r = render(<PrCard cwd={CWD} number={74} />)
    await act(async () => { await new Promise((res) => setTimeout(res, 0)) })
    r.rerender(<PrCard cwd={CWD} number={74} />)
    await act(async () => { await new Promise((res) => setTimeout(res, 0)) })
    expect(git.prRead).toHaveBeenCalledTimes(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
      await new Promise((res) => setTimeout(res, 0))
    })
    expect(git.prRead).toHaveBeenCalledTimes(2)
  })
})
