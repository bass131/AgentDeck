// @vitest-environment jsdom
// M07 G5 컨트롤 패널 — 노드를 지점별로 보이고, 풀린 노드만 토글한다. 봉인이 깨지면 맨 위에 경고와 확인 버튼을 둔다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { ControlsState, ControlNodeView } from '../../../../02_Project/00_Source/shared/ipcContract'
import { installWindowApi } from '../00_Helpers/windowApiMock'

const node = (over: Partial<ControlNodeView>): ControlNodeView => ({
  id: 'x',
  name: '노드',
  point: 'canUseTool',
  judge: 'rule',
  results: ['allow'],
  protection: 'L2',
  locked: true,
  onFailure: 'block',
  timeoutMs: null,
  enabled: true,
  ...over,
})

const NODES: ControlNodeView[] = [
  node({ id: 'no-suggestion-card', name: '규칙 제안 없는 호출은 카드', results: ['ask'] }),
  node({ id: 'mode-auto-bypass-allow', name: '자동·Bypass 모드는 허용', locked: false }),
  node({ id: 'readonly-allow', name: '읽기 도구는 허용', locked: false, enabled: false }),
  node({ id: 'engine-path-file-deny', name: '엔진 파일 거부', point: 'permissionRules', results: ['deny'] }),
  node({ id: 'engine-path-bash-lock', name: '엔진 경로 셸 거부', point: 'preToolUse', results: ['deny'], protection: 'L3', timeoutMs: 10000 }),
]

const state = (over: Partial<ControlsState> = {}): ControlsState => ({
  status: 'ok',
  nodes: NODES,
  engine: { seal: 'none', active: null },
  ...over,
})

const api = {
  getControlsState: vi.fn<() => Promise<ControlsState>>(),
  setControlEnabled: vi.fn<(req: { id: string; enabled: boolean }) => Promise<{ ok: boolean; error?: string }>>(),
  confirmControls: vi.fn<() => Promise<{ ok: boolean }>>(),
  setActiveEngine: vi.fn<(version: string) => Promise<{ ok: boolean }>>(),
}

beforeEach(() => {
  api.getControlsState.mockResolvedValue(state())
  api.setControlEnabled.mockResolvedValue({ ok: true })
  api.confirmControls.mockResolvedValue({ ok: true })
  api.setActiveEngine.mockResolvedValue({ ok: true })
  installWindowApi(api)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderView(): Promise<void> {
  const { ControlsView } = await import('../../../../02_Project/00_Source/renderer/src/11_Settings/ControlsView')
  render(<ControlsView />)
  await screen.findByText('자동·Bypass 모드는 허용')
}

describe('컨트롤 패널 (M07 G5)', () => {
  it('노드를 지점별 묶음으로 보이고, 보호 수준 배지를 붙인다', async () => {
    await renderView()
    const groups = Array.from(document.querySelectorAll('[data-point]')).map((g) => g.getAttribute('data-point'))
    expect(groups).toEqual(['canUseTool', 'permissionRules', 'preToolUse'])
    expect(screen.getAllByText('L2').length).toBeGreaterThan(0)
    expect(screen.getByText('L3')).toBeTruthy()
  })

  it('잠긴 노드의 토글은 눌리지 않고, 풀린 노드의 토글은 켜짐 상태를 보인다', async () => {
    await renderView()
    const locked = screen.getByRole('switch', { name: /규칙 제안 없는 호출은 카드/ })
    expect((locked as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('switch', { name: /자동·Bypass 모드는 허용/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: /읽기 도구는 허용/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('풀린 노드를 누르면 끄기 요청을 보내고 상태를 다시 읽는다', async () => {
    await renderView()
    fireEvent.click(screen.getByRole('switch', { name: /자동·Bypass 모드는 허용/ }))
    await waitFor(() => expect(api.setControlEnabled).toHaveBeenCalledWith({ id: 'mode-auto-bypass-allow', enabled: false }))
    await waitFor(() => expect(api.getControlsState).toHaveBeenCalledTimes(2))
  })

  it('토글이 거절되면 오류 문장을 보인다', async () => {
    api.setControlEnabled.mockResolvedValue({ ok: false, error: '거절됨' })
    await renderView()
    fireEvent.click(screen.getByRole('switch', { name: /자동·Bypass 모드는 허용/ }))
    expect(await screen.findByText(/거절됨/)).toBeTruthy()
  })

  it('봉인이 깨지면 경고와 확인 버튼을 보이고, 토글은 막는다', async () => {
    api.getControlsState.mockResolvedValueOnce(state({ status: 'mismatch' })).mockResolvedValue(state())
    await renderView()
    expect(screen.getByRole('alert').textContent).toMatch(/앱 밖에서 바뀌었/)
    expect((screen.getByRole('switch', { name: /자동·Bypass 모드는 허용/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /지금 내용으로 확인/ }))
    await waitFor(() => expect(api.confirmControls).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('엔진 봉인이 깨지면 그 엔진을 다시 고르는 버튼을 보인다', async () => {
    api.getControlsState.mockResolvedValue(state({ engine: { seal: 'mismatch', active: '0.3.326' } }))
    await renderView()
    expect(screen.getByRole('alert').textContent).toMatch(/0\.3\.326/)
    fireEvent.click(screen.getByRole('button', { name: /이 엔진 다시 고르기/ }))
    await waitFor(() => expect(api.setActiveEngine).toHaveBeenCalledWith('0.3.326'))
  })

  it('다시 고른 엔진이 재시작을 기다리면 안내만 보이고 버튼은 없다', async () => {
    api.getControlsState.mockResolvedValue(state({ engine: { seal: 'restart', active: '0.3.326' } }))
    await renderView()
    expect(screen.getByRole('alert').textContent).toMatch(/재시작/)
    expect(screen.queryByRole('button', { name: /이 엔진 다시 고르기/ })).toBeNull()
  })

  it('정상 상태에서는 경고가 없다', async () => {
    await renderView()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('설정 모달의 컨트롤 메뉴 (M07 G5)', () => {
  it('설정 메뉴에 「컨트롤」이 있고 누르면 패널이 열린다', async () => {
    const { SettingsModal } = await import('../../../../02_Project/00_Source/renderer/src/11_Settings/SettingsModal')
    render(<SettingsModal onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '컨트롤' }))
    expect(await screen.findByText('자동·Bypass 모드는 허용')).toBeTruthy()
  })
})
