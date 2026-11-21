// @vitest-environment jsdom
// 노드를 지점별로 보이고, 풀린 노드만 토글한다. 봉인이 깨지면 맨 위에 경고와 확인 버튼을 둔다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { ControlsState, ControlNodeView } from '@shared/ipcContract'
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
  node({ id: 'mode-auto-bypass-allow', name: '자동 모드는 허용', locked: false }),
  node({ id: 'readonly-allow', name: '읽기 도구는 허용', locked: false, enabled: false }),
  node({ id: 'engine-path-file-deny', name: '엔진 파일 거부', point: 'permissionRules', results: ['deny'] }),
  node({ id: 'engine-path-bash-lock', name: '엔진 경로 셸 거부', point: 'preToolUse', results: ['deny'], protection: 'L3', timeoutMs: 10000 }),
]

const state = (over: Partial<ControlsState> = {}): ControlsState => ({
  status: 'ok',
  fileReadable: true,
  nodes: NODES,
  engine: { seal: 'none', active: null },
  ...over,
})

const api = {
  getControlsState: vi.fn<() => Promise<ControlsState>>(),
  setControlEnabled: vi.fn<(req: { id: string; enabled: boolean }) => Promise<{ ok: boolean; error?: string }>>(),
  confirmControls: vi.fn<(req: { disabled: string[] }) => Promise<{ ok: boolean }>>(),
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
  const { ControlsView } = await import('@renderer/11_Settings/ControlsView')
  render(<ControlsView />)
  await screen.findByText('자동 모드는 허용')
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
    expect(screen.getByRole('switch', { name: /자동 모드는 허용/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: /읽기 도구는 허용/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('풀린 노드를 누르면 끄기 요청을 보내고 상태를 다시 읽는다', async () => {
    await renderView()
    fireEvent.click(screen.getByRole('switch', { name: /자동 모드는 허용/ }))
    await waitFor(() => expect(api.setControlEnabled).toHaveBeenCalledWith({ id: 'mode-auto-bypass-allow', enabled: false }))
    await waitFor(() => expect(api.getControlsState).toHaveBeenCalledTimes(2))
  })

  it('토글이 거절되면 오류 문장을 보인다', async () => {
    api.setControlEnabled.mockResolvedValue({ ok: false, error: '거절됨' })
    await renderView()
    fireEvent.click(screen.getByRole('switch', { name: /자동 모드는 허용/ }))
    expect(await screen.findByText(/거절됨/)).toBeTruthy()
  })

  it('봉인이 깨지면 경고와 확인 버튼을 보이고, 토글은 막는다. 확인은 화면에 보인 꺼진 노드를 함께 보낸다', async () => {
    api.getControlsState.mockResolvedValueOnce(state({ status: 'mismatch' })).mockResolvedValue(state())
    await renderView()
    expect(screen.getByRole('alert').textContent).toMatch(/앱 밖에서 바뀌었/)
    expect(screen.getByRole('alert').textContent).toMatch(/지금 파일 내용/)
    expect((screen.getByRole('switch', { name: /자동 모드는 허용/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /지금 내용으로 확인/ }))
    await waitFor(() => expect(api.confirmControls).toHaveBeenCalledWith({ disabled: ['readonly-allow'] }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('파일이 없거나 읽을 수 없으면 경고가 「확인하면 전부 켬」이라고 말한다 (G5 검수 중요 2)', async () => {
    api.getControlsState.mockResolvedValue(state({ status: 'mismatch', fileReadable: false }))
    await renderView()
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toMatch(/전부 켬/)
    expect(text).not.toMatch(/지금 파일 내용/)
  })

  it('읽기 오류(error)면 사유를 보이고 확인 버튼은 두지 않는다 (G5 검수 사소 4)', async () => {
    api.getControlsState.mockResolvedValue(state({ status: 'error', error: 'EISDIR: illegal operation', fileReadable: false }))
    await renderView()
    expect(screen.getByRole('alert').textContent).toMatch(/EISDIR/)
    expect(screen.queryByRole('button', { name: /지금 내용으로 확인/ })).toBeNull()
    expect((screen.getByRole('switch', { name: /자동 모드는 허용/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('엔진 상태가 없어도(null) 패널은 그려진다', async () => {
    api.getControlsState.mockResolvedValue(state({ engine: null }))
    await renderView()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('토글 요청이 끝나기 전에는 그 토글을 다시 누를 수 없다 (G5 검수 사소 7)', async () => {
    let release: (v: { ok: boolean }) => void = () => {}
    api.setControlEnabled.mockReturnValue(new Promise((r) => (release = r)))
    await renderView()
    const sw = screen.getByRole('switch', { name: /자동 모드는 허용/ }) as HTMLButtonElement
    fireEvent.click(sw)
    await waitFor(() => expect(sw.disabled).toBe(true))
    fireEvent.click(sw)
    expect(api.setControlEnabled).toHaveBeenCalledTimes(1)
    release({ ok: true })
    await waitFor(() => expect(sw.disabled).toBe(false))
  })

  it('거절 문장은 화면 낭독기에 알린다', async () => {
    api.setControlEnabled.mockResolvedValue({ ok: false, error: '거절됨' })
    await renderView()
    fireEvent.click(screen.getByRole('switch', { name: /자동 모드는 허용/ }))
    expect((await screen.findByRole('status')).textContent).toMatch(/거절됨/)
  })

  it('머리말은 SDK가 먼저 승인하는 호출은 노드까지 오지 않는다고 밝힌다 (G5 검수 중요 3)', async () => {
    await renderView()
    expect(document.body.textContent).toMatch(/노드까지 오지 않/)
    // 실측: Bypass는 모든 호출, 자동 모드는 SDK 분류기가 승인한 호출이 콜백을 거치지 않는다
    expect(document.body.textContent).toMatch(/Bypass 모드의 모든 호출/)
    expect(document.body.textContent).toMatch(/자동 모드에서 SDK 분류기가 승인한 호출/)
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

  // 노드마다 메모리에 남은 최근 판정 수를 보인다
  it('[M11-G3 M07-13] 노드 줄에 「최근 판정」 수를 보인다', async () => {
    api.getControlsState.mockResolvedValue(state({
      nodes: [
        node({ id: 'mode-auto-bypass-allow', name: '자동 모드는 허용', recentVerdicts: 3 }),
        node({ id: 'merge-deny', name: '병합 거부', recentVerdicts: 0 }),
      ],
    }))
    await renderView()
    const rows = document.querySelectorAll('.ctl-node')
    expect(rows[0].textContent).toContain('최근 판정 3')
    expect(rows[1].textContent).toContain('최근 판정 0')
  })

  it('[M11-G3 M07-13 검수] 앱이 판정을 보지 못하는 노드는 수 대신 「최근 판정 기록 없음」이다', async () => {
    api.getControlsState.mockResolvedValue(state({
      nodes: [
        node({ id: 'mode-auto-bypass-allow', name: '자동 모드는 허용', recentVerdicts: 1 }),
        node({ id: 'engine-path-file-deny', name: '엔진 파일 거부', recentVerdicts: null }),
      ],
    }))
    await renderView()
    const rows = document.querySelectorAll('.ctl-node')
    expect(rows[1].textContent).toContain('최근 판정 기록 없음')
    expect(rows[1].textContent).not.toMatch(/최근 판정 \d/)
  })
})

describe('설정 모달의 컨트롤 메뉴 (M07 G5)', () => {
  it('설정 메뉴에 「컨트롤」이 있고 누르면 패널이 열린다', async () => {
    const { SettingsModal } = await import('@renderer/11_Settings/SettingsModal')
    render(<SettingsModal onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '컨트롤' }))
    expect(await screen.findByText('자동 모드는 허용')).toBeTruthy()
  })
})
