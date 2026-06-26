// @vitest-environment jsdom
/**
 * engineUpdateNotice.test.tsx — EngineUpdateNotice 컴포넌트 단위 테스트 (TDD).
 *
 * (a) 기존 테스트 — 회귀 보호:
 *   - open=false → null 렌더
 *   - open=true → set-dialog-overlay + 제목 + 현재/최신 버전 텍스트
 *   - 오버레이 클릭 → onClose (prompt 단계)
 *   - null current/latest graceful
 *
 * (b) 신규 테스트 — phase 흐름:
 *   - prompt: "나중에" + "업데이트" 2버튼 렌더
 *   - "나중에" 클릭 → onClose, installEngine 미호출
 *   - "업데이트" 클릭 → installEngine 호출 + installing 단계 전이
 *   - installing: .install-card + .ic-hic.running + .set-spin + .ic-log 렌더
 *   - installing 중 overlay mousedown → onClose 호출 안 됨
 *   - onEngineInstallProgress line → .ic-log에 라인 누적
 *   - done{ok:true} → setActiveEngine 호출 + done 단계 (.ic-hic.done + IconCheck)
 *   - done{ok:false,error} → error 단계 (.ic-hic.error + error 메시지)
 *   - error: "다시 시도" 클릭 → installEngine 재호출
 *   - done 단계 "확인" 클릭 → onClose
 *
 * CRITICAL: window.api mock(installEngine/setActiveEngine/onEngineInstallProgress)만.
 *           인라인 색상 0 — CSS 변수 토큰. renderer untrusted.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { EngineUpdateNotice } from '../../src/renderer/src/components/07_notice/EngineUpdateNotice'

afterEach(() => cleanup())

// ── window.api mock 헬퍼 ───────────────────────────────────────────────────
type ProgressCb = (p: { version: string; line?: string; done?: boolean; ok?: boolean; error?: string }) => void

function makeApi(overrides: Partial<{
  installEngine: () => Promise<{ ok: boolean; error?: string }>
  setActiveEngine: () => Promise<{ ok: boolean }>
  onEngineInstallProgress: (cb: ProgressCb) => () => void
}> = {}) {
  return {
    installEngine: vi.fn().mockResolvedValue({ ok: true }),
    setActiveEngine: vi.fn().mockResolvedValue({ ok: true }),
    onEngineInstallProgress: vi.fn().mockReturnValue(vi.fn()),
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// (a) 회귀 보호 — open=false
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — open=false → 미렌더', () => {
  it('open=false → null (set-dialog-overlay 없음)', () => {
    const { container } = render(
      <EngineUpdateNotice
        open={false}
        current="1.0.0"
        latest="1.1.0"
        onClose={vi.fn()}
      />
    )
    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    expect(container.firstChild).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// (a) 회귀 보호 — prompt 단계 기본 렌더
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — prompt 단계 기본 렌더', () => {
  function renderNotice(props?: Partial<Parameters<typeof EngineUpdateNotice>[0]>) {
    const defaults = {
      open: true as const,
      current: '1.0.0',
      latest: '1.1.0',
      onClose: vi.fn(),
    }
    return render(<EngineUpdateNotice {...defaults} {...props} />)
  }

  it('set-dialog-overlay 렌더', () => {
    const { container } = renderNotice()
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
  })

  it('set-dialog 내부 카드 렌더', () => {
    const { container } = renderNotice()
    expect(container.querySelector('.set-dialog')).toBeTruthy()
  })

  it('.sd-ic.warn 아이콘 영역 렌더', () => {
    const { container } = renderNotice()
    const icon = container.querySelector('.sd-ic.warn')
    expect(icon).toBeTruthy()
  })

  it('.sd-title = "새 엔진 버전"', () => {
    const { container } = renderNotice()
    const title = container.querySelector('.sd-title')
    expect(title?.textContent).toContain('새 엔진 버전')
  })

  it('.sd-msg에 현재 버전 텍스트 포함 (current=1.0.0)', () => {
    const { container } = renderNotice({ current: '1.0.0' })
    const msg = container.querySelector('.sd-msg')
    expect(msg?.textContent).toContain('1.0.0')
  })

  it('.sd-msg에 최신 버전 텍스트 포함 (latest=1.1.0)', () => {
    const { container } = renderNotice({ latest: '1.1.0' })
    const msg = container.querySelector('.sd-msg')
    expect(msg?.textContent).toContain('1.1.0')
  })

  it('.sd-btns 렌더', () => {
    const { container } = renderNotice()
    expect(container.querySelector('.sd-btns')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// (b) 신규 — prompt 2버튼
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — prompt 2버튼', () => {
  let api: ReturnType<typeof makeApi>

  beforeEach(() => {
    api = makeApi()
    ;(window as unknown as Record<string, unknown>).api = api
  })

  it('"나중에" 버튼(.sd-cancel) 존재', () => {
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={vi.fn()} />
    )
    const btn = container.querySelector('.sd-cancel')
    expect(btn).toBeTruthy()
    expect(btn?.textContent).toContain('나중에')
  })

  it('"업데이트" 버튼(.sd-go) 존재', () => {
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={vi.fn()} />
    )
    const btn = container.querySelector('.sd-go')
    expect(btn).toBeTruthy()
    expect(btn?.textContent).toContain('업데이트')
  })

  it('"나중에" 클릭 → onClose 호출, installEngine 미호출', () => {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    const btn = container.querySelector('.sd-cancel') as HTMLButtonElement
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.installEngine).not.toHaveBeenCalled()
  })

  it('오버레이 mousedown(prompt 단계) → onClose 호출', () => {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    const overlay = container.querySelector('.set-dialog-overlay') as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('카드(.set-dialog) mousedown → onClose 호출 안 됨 (버블 차단)', () => {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    const dialog = container.querySelector('.set-dialog') as HTMLElement
    fireEvent.mouseDown(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('"업데이트" 클릭 → installEngine("1.1.0") 호출', async () => {
    // installEngine을 pending 상태로 유지 (설치 진행 중 시뮬레이션)
    let resolveInstall!: (v: { ok: boolean }) => void
    api.installEngine = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean }>((res) => { resolveInstall = res })
    )
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={vi.fn()} />
    )
    const btn = container.querySelector('.sd-go') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(api.installEngine).toHaveBeenCalledWith('1.1.0')
    resolveInstall({ ok: true })
  })

  it('"업데이트" 클릭 후 → installing 단계 (.install-card 렌더)', async () => {
    let resolveInstall!: (v: { ok: boolean }) => void
    api.installEngine = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean }>((res) => { resolveInstall = res })
    )
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={vi.fn()} />
    )
    const btn = container.querySelector('.sd-go') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(container.querySelector('.install-card')).toBeTruthy()
    resolveInstall({ ok: true })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// (b) 신규 — installing 단계
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — installing 단계', () => {
  let api: ReturnType<typeof makeApi>
  let capturedProgressCb: ProgressCb | null = null

  beforeEach(() => {
    capturedProgressCb = null
    api = makeApi({
      installEngine: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
      onEngineInstallProgress: vi.fn().mockImplementation((cb: ProgressCb) => {
        capturedProgressCb = cb
        return vi.fn()
      }),
    })
    ;(window as unknown as Record<string, unknown>).api = api
  })

  async function renderInstalling() {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    const btn = container.querySelector('.sd-go') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(btn)
    })
    return { container, onClose }
  }

  it('installing: .install-card 렌더', async () => {
    const { container } = await renderInstalling()
    expect(container.querySelector('.install-card')).toBeTruthy()
  })

  it('installing: .ic-hic.running 렌더', async () => {
    const { container } = await renderInstalling()
    expect(container.querySelector('.ic-hic.running')).toBeTruthy()
  })

  it('installing: .set-spin 스피너 렌더', async () => {
    const { container } = await renderInstalling()
    expect(container.querySelector('.set-spin')).toBeTruthy()
  })

  it('installing: .ic-log 렌더', async () => {
    const { container } = await renderInstalling()
    expect(container.querySelector('.ic-log')).toBeTruthy()
  })

  it('installing: .ic-ver에 latest 버전 표시', async () => {
    const { container } = await renderInstalling()
    const ver = container.querySelector('.ic-ver')
    expect(ver?.textContent).toContain('1.1.0')
  })

  it('installing 중 overlay mousedown → onClose 호출 안 됨', async () => {
    const { container, onClose } = await renderInstalling()
    const overlay = container.querySelector('.set-dialog-overlay') as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('onEngineInstallProgress line → .ic-log에 라인 누적', async () => {
    const { container } = await renderInstalling()
    await act(async () => {
      capturedProgressCb?.({ version: '1.1.0', line: '패키지 다운로드 중…' })
    })
    const log = container.querySelector('.ic-log')
    expect(log?.textContent).toContain('패키지 다운로드 중…')
  })

  it('복수 라인 → .ic-ln 여러 개 누적', async () => {
    const { container } = await renderInstalling()
    await act(async () => {
      capturedProgressCb?.({ version: '1.1.0', line: '라인1' })
      capturedProgressCb?.({ version: '1.1.0', line: '라인2' })
    })
    const lines = container.querySelectorAll('.ic-ln')
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// (b) 신규 — done 단계 (ok:true)
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — done 단계', () => {
  let api: ReturnType<typeof makeApi>
  let capturedProgressCb: ProgressCb | null = null

  beforeEach(() => {
    capturedProgressCb = null
    api = makeApi({
      installEngine: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
      onEngineInstallProgress: vi.fn().mockImplementation((cb: ProgressCb) => {
        capturedProgressCb = cb
        return vi.fn()
      }),
    })
    ;(window as unknown as Record<string, unknown>).api = api
  })

  async function renderDone() {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    await act(async () => {
      fireEvent.click(container.querySelector('.sd-go') as HTMLButtonElement)
    })
    // done{ok:true} 이벤트 발행
    await act(async () => {
      capturedProgressCb?.({ version: '1.1.0', done: true, ok: true })
    })
    return { container, onClose }
  }

  it('done: .ic-hic.done 렌더', async () => {
    const { container } = await renderDone()
    expect(container.querySelector('.ic-hic.done')).toBeTruthy()
  })

  it('done: setActiveEngine("1.1.0") 호출', async () => {
    await renderDone()
    expect(api.setActiveEngine).toHaveBeenCalledWith('1.1.0')
  })

  it('done: .ic-status.done 렌더', async () => {
    const { container } = await renderDone()
    expect(container.querySelector('.ic-status.done')).toBeTruthy()
  })

  it('done: "확인" 버튼(.sd-go) 활성화 상태', async () => {
    const { container } = await renderDone()
    const goBtn = container.querySelector('.sd-go') as HTMLButtonElement
    expect(goBtn).toBeTruthy()
    expect(goBtn.disabled).toBeFalsy()
  })

  it('done: "확인" 클릭 → onClose', async () => {
    const { container, onClose } = await renderDone()
    await act(async () => {
      fireEvent.click(container.querySelector('.sd-go') as HTMLButtonElement)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// (b) 신규 — error 단계 (ok:false)
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — error 단계', () => {
  let api: ReturnType<typeof makeApi>
  let capturedProgressCb: ProgressCb | null = null

  beforeEach(() => {
    capturedProgressCb = null
    api = makeApi({
      installEngine: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
      onEngineInstallProgress: vi.fn().mockImplementation((cb: ProgressCb) => {
        capturedProgressCb = cb
        return vi.fn()
      }),
    })
    ;(window as unknown as Record<string, unknown>).api = api
  })

  async function renderError() {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    await act(async () => {
      fireEvent.click(container.querySelector('.sd-go') as HTMLButtonElement)
    })
    await act(async () => {
      capturedProgressCb?.({ version: '1.1.0', done: true, ok: false, error: '네트워크 오류' })
    })
    return { container, onClose }
  }

  it('error: .ic-hic.error 렌더', async () => {
    const { container } = await renderError()
    expect(container.querySelector('.ic-hic.error')).toBeTruthy()
  })

  it('error: .ic-ln.err에 오류 메시지 표시', async () => {
    const { container } = await renderError()
    const errLine = container.querySelector('.ic-ln.err')
    expect(errLine?.textContent).toContain('네트워크 오류')
  })

  it('error: "다시 시도" 버튼(.sd-cancel) 존재', async () => {
    const { container } = await renderError()
    const btn = container.querySelector('.sd-cancel')
    expect(btn).toBeTruthy()
    expect(btn?.textContent).toContain('다시 시도')
  })

  it('error: "다시 시도" 클릭 → installEngine 재호출', async () => {
    const { container } = await renderError()
    // vi.fn()으로 교체하여 never-resolving promise 재설정
    ;(api as Record<string, unknown>).installEngine = vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ }))
    await act(async () => {
      fireEvent.click(container.querySelector('.sd-cancel') as HTMLButtonElement)
    })
    // 총 2번: renderError 내 1번 + 다시 시도 1번
    expect((api as Record<string, unknown>).installEngine as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
  })

  it('error: .ic-status.error 렌더', async () => {
    const { container } = await renderError()
    expect(container.querySelector('.ic-status.error')).toBeTruthy()
  })

  it('error: "확인" 클릭 → onClose', async () => {
    const { container, onClose } = await renderError()
    await act(async () => {
      fireEvent.click(container.querySelector('.sd-go') as HTMLButtonElement)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('setActiveEngine 미호출 (error 경우)', async () => {
    await renderError()
    expect(api.setActiveEngine).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// (a) 회귀 — null current/latest graceful
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — null 값 graceful', () => {
  it('current=null, latest=null → 크래시 없이 렌더', () => {
    expect(() =>
      render(
        <EngineUpdateNotice open={true} current={null} latest={null} onClose={vi.fn()} />
      )
    ).not.toThrow()
  })

  it('current=null → .sd-msg 렌더됨', () => {
    const { container } = render(
      <EngineUpdateNotice open={true} current={null} latest="2.0.0" onClose={vi.fn()} />
    )
    expect(container.querySelector('.sd-msg')).toBeTruthy()
  })
})
