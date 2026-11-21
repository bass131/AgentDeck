// @vitest-environment jsdom
// 설정의 「GitHub 계정」 칸 — 연결 버튼, 사용자 코드·복사·GitHub에서 열기, 기다림·성공·실패 문구, 연결된 계정, 연결 해제.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GithubAuthStatus } from '@shared/ipcContract'
import { installWindowApi } from '../00_Helpers/windowApiMock'

const PENDING: GithubAuthStatus = { phase: 'pending', userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device', expiresAt: '2026-11-22T10:15:00.000Z' }

let push: ((s: GithubAuthStatus) => void) | null
let uninstall: () => void
const makeApi = () => ({
  githubStatus: vi.fn(async (): Promise<GithubAuthStatus> => ({ phase: 'disconnected' })),
  githubConnect: vi.fn(async (): Promise<GithubAuthStatus> => PENDING),
  githubCancel: vi.fn(async (): Promise<GithubAuthStatus> => ({ phase: 'disconnected', error: '연결을 취소했어요' })),
  githubDisconnect: vi.fn(async (): Promise<GithubAuthStatus> => ({ phase: 'disconnected' })),
  githubOpenVerification: vi.fn(async () => ({ ok: true })),
  onGithubState: vi.fn((cb: (s: GithubAuthStatus) => void) => { push = cb; return () => { push = null } }),
})
let api: ReturnType<typeof makeApi>

beforeEach(() => {
  push = null
  api = makeApi()
  uninstall = installWindowApi(api).uninstall
})
afterEach(() => {
  cleanup()
  uninstall()
})

async function renderView(): Promise<void> {
  const { GitHubAccountView } = await import('@renderer/11_Settings/GitHubAccountView')
  await act(async () => { render(<GitHubAccountView />) })
}

describe('GitHub 계정 칸', () => {
  it('연결 전에는 연결 버튼을 보이고, 누르면 사용자 코드와 GitHub에서 열기를 보인다', async () => {
    await renderView()
    expect(screen.getByLabelText('GitHub 연결 상태').textContent).toContain('연결되지 않았어요')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'GitHub 연결' })) })
    expect(api.githubConnect).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('사용자 코드').textContent).toBe('WDJB-MJHT')
    expect(screen.getByLabelText('GitHub 연결 상태').textContent).toContain('기다리고 있어요')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'GitHub에서 열기' })) })
    expect(api.githubOpenVerification).toHaveBeenCalledTimes(1)
    expect(api.githubOpenVerification.mock.calls[0]).toEqual([])
  })

  it('사용자 코드를 복사한다', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    api.githubStatus.mockResolvedValue(PENDING)
    await renderView()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사용자 코드 복사' })) })
    expect(writeText).toHaveBeenCalledWith('WDJB-MJHT')
    expect(screen.getByText('코드를 복사했어요')).toBeTruthy()
  })

  it('기다림 뒤 연결되면 성공 문구와 계정 이름을, 해제를 누르면 연결 전으로 돌아간다', async () => {
    api.githubStatus.mockResolvedValue(PENDING)
    await renderView()
    await act(async () => { push?.({ phase: 'connected', login: 'octocat' }) })
    expect(screen.getByText('연결됐어요')).toBeTruthy()
    expect(screen.getByLabelText('연결된 계정').textContent).toBe('octocat')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '연결 해제' })) })
    expect(api.githubDisconnect).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'GitHub 연결' })).toBeTruthy()
  })

  it('실패는 main이 준 문구를 알림으로 보이고, 기다림 중 취소할 수 있다', async () => {
    api.githubStatus.mockResolvedValue(PENDING)
    await renderView()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '연결 취소' })) })
    expect(api.githubCancel).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain('연결을 취소했어요')
    await act(async () => { push?.({ phase: 'disconnected', error: 'GitHub 연결 준비가 안 됐어요' }) })
    expect(screen.getByRole('alert').textContent).toContain('GitHub 연결 준비가 안 됐어요')
  })

  it('요청이 실패하면 오류 문구를 보이고 상태를 다시 읽으며, 버튼이 다시 눌린다', async () => {
    api.githubDisconnect.mockRejectedValueOnce(new Error('ipc down'))
    api.githubStatus.mockResolvedValue({ phase: 'connected', login: 'octocat' })
    await renderView()
    const reads = api.githubStatus.mock.calls.length
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '연결 해제' })) })
    expect(screen.getByText('요청을 처리하지 못했어요 — 다시 시도해 주세요')).toBeTruthy()
    expect(api.githubStatus.mock.calls.length).toBe(reads + 1)
    expect((screen.getByRole('button', { name: '연결 해제' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByLabelText('연결된 계정').textContent).toBe('octocat')
  })
})
