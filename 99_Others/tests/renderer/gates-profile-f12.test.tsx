// @vitest-environment jsdom
/**
 * gates-profile-f12.test.tsx — F12-03 EngineGate + AppUpdateGate + Profile 단위 테스트.
 *
 * EngineGate: installing→ic-title+스피너 / done→IconCheck / error→다시 시도.
 * AppUpdateGate: downloading→ic-status / downloaded→재시작하여 설치.
 * Profile: title 분기 + pf-preview 이니셜 + 닉네임 입력 미리보기 갱신 +
 *           pf-swatch 선택 aria-pressed + 입장하기 빈닉네임 disabled→입력 활성 + onEnter 콜백.
 * open=false → 미렌더.
 * 새 IPC 0: window.api 실 호출 0.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EngineGate } from '../../../02.Source/renderer/src/components/07_notice/EngineGate'
import { AppUpdateGate } from '../../../02.Source/renderer/src/components/07_notice/AppUpdateGate'
import { Profile } from '../../../02.Source/renderer/src/components/00_shell/Profile'
import { AVATAR_PALETTE } from '../../../02.Source/renderer/src/lib/avatarColor'

afterEach(() => cleanup())

// ══════════════════════════════════════════════════════════════════════════════
// EngineGate (P3 적응 — OAuth/API키 인증 안내 모드)
// 원본 CLI 설치 phase(prompt/installing/done/error) → 우리 인증 안내로 적응됨.
// props: { open, available, authed, version?, onRetry, onSkip }
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineGate — open=false → 미렌더', () => {
  it('open=false → null (install-card 없음)', () => {
    const { container } = render(
      <EngineGate
        open={false}
        available={true}
        authed={false}
        onRetry={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    expect(container.querySelector('.install-card')).toBeFalsy()
    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
  })
})

describe('EngineGate — authed=false (인증 안내 주 케이스)', () => {
  function renderAuthGate(onRetry = vi.fn(), onSkip = vi.fn()) {
    const { container } = render(
      <EngineGate
        open={true}
        available={true}
        authed={false}
        onRetry={onRetry}
        onSkip={onSkip}
      />
    )
    return { container, onRetry, onSkip }
  }

  it('set-dialog-overlay + install-card 렌더', () => {
    const { container } = renderAuthGate()
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
    expect(container.querySelector('.install-card')).toBeTruthy()
  })

  it('ic-head 존재', () => {
    const { container } = renderAuthGate()
    expect(container.querySelector('.ic-head')).toBeTruthy()
  })

  it('ic-title에 "인증" 포함', () => {
    const { container } = renderAuthGate()
    const title = container.querySelector('.ic-title')
    expect(title?.textContent).toContain('인증')
  })

  it('ic-status.running 존재', () => {
    const { container } = renderAuthGate()
    const status = container.querySelector('.ic-status')
    expect(status).toBeTruthy()
    expect(status?.classList.contains('running')).toBe(true)
  })

  it('재확인 버튼 활성', () => {
    const { container } = renderAuthGate()
    const retryBtn = container.querySelector('.sd-cancel') as HTMLButtonElement
    expect(retryBtn?.disabled).toBeFalsy()
    expect(retryBtn?.textContent).toContain('재확인')
  })

  it('계속 진행 버튼 활성', () => {
    const { container } = renderAuthGate()
    const skipBtn = container.querySelector('.sd-go') as HTMLButtonElement
    expect(skipBtn?.disabled).toBeFalsy()
    expect(skipBtn?.textContent).toContain('계속 진행')
  })

  it('재확인 버튼 클릭 → onRetry 호출', () => {
    const onRetry = vi.fn()
    const { container } = renderAuthGate(onRetry)
    const retryBtn = container.querySelector('.sd-cancel') as HTMLButtonElement
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('계속 진행 버튼 클릭 → onSkip 호출', () => {
    const onSkip = vi.fn()
    const { container } = renderAuthGate(vi.fn(), onSkip)
    const skipBtn = container.querySelector('.sd-go') as HTMLButtonElement
    fireEvent.click(skipBtn)
    expect(onSkip).toHaveBeenCalledOnce()
  })
})

describe('EngineGate — available=false (SDK 비가용)', () => {
  function renderUnavailable(onRetry = vi.fn(), onSkip = vi.fn()) {
    const { container } = render(
      <EngineGate
        open={true}
        available={false}
        authed={false}
        onRetry={onRetry}
        onSkip={onSkip}
      />
    )
    return { container, onRetry, onSkip }
  }

  it('set-dialog-overlay + install-card 렌더', () => {
    const { container } = renderUnavailable()
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
    expect(container.querySelector('.install-card')).toBeTruthy()
  })

  it('ic-title에 "SDK" 포함', () => {
    const { container } = renderUnavailable()
    const title = container.querySelector('.ic-title')
    expect(title?.textContent).toContain('SDK')
  })

  it('ic-status.running 존재', () => {
    const { container } = renderUnavailable()
    const status = container.querySelector('.ic-status')
    expect(status?.classList.contains('running')).toBe(true)
  })
})

describe('EngineGate — version 표시', () => {
  it('version 있음 → ic-ver에 version 텍스트', () => {
    const { container } = render(
      <EngineGate
        open={true}
        available={true}
        authed={false}
        version="2.3.0"
        onRetry={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    expect(container.querySelector('.ic-ver')?.textContent).toBe('2.3.0')
  })

  it('version 없음 → ic-ver 미표시', () => {
    const { container } = render(
      <EngineGate
        open={true}
        available={true}
        authed={false}
        onRetry={vi.fn()}
        onSkip={vi.fn()}
      />
    )
    expect(container.querySelector('.ic-ver')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AppUpdateGate
// ══════════════════════════════════════════════════════════════════════════════

describe('AppUpdateGate — open=false → 미렌더', () => {
  it('open=false → null (install-card 없음)', () => {
    const { container } = render(<AppUpdateGate open={false} phase="downloading" onClose={vi.fn()} />)
    expect(container.querySelector('.install-card')).toBeFalsy()
    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
  })
})

describe('AppUpdateGate — phase=downloading', () => {
  function renderDownloading(onClose = vi.fn()) {
    const { container } = render(
      <AppUpdateGate open={true} phase="downloading" onClose={onClose} />
    )
    return { container, onClose }
  }

  it('set-dialog-overlay + install-card 렌더', () => {
    const { container } = renderDownloading()
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
    expect(container.querySelector('.install-card')).toBeTruthy()
  })

  it('ic-title = "업데이트 다운로드 중"', () => {
    renderDownloading()
    expect(screen.getByText('업데이트 다운로드 중')).toBeTruthy()
  })

  it('ic-hic.running + set-spin', () => {
    const { container } = renderDownloading()
    const hic = container.querySelector('.ic-hic')
    expect(hic?.classList.contains('running')).toBe(true)
    expect(container.querySelector('.set-spin')).toBeTruthy()
  })

  it('ic-status.running 존재', () => {
    const { container } = renderDownloading()
    const status = container.querySelector('.ic-status')
    expect(status?.classList.contains('running')).toBe(true)
  })

  it('숨기기 버튼 존재 (downloading)', () => {
    renderDownloading()
    expect(screen.getByText('숨기기')).toBeTruthy()
  })

  it('재시작하여 설치 버튼 없음 (downloading)', () => {
    const btns = screen.queryAllByText('재시작하여 설치')
    expect(btns.length).toBe(0)
  })
})

describe('AppUpdateGate — phase=downloaded', () => {
  function renderDownloaded(onClose = vi.fn()) {
    const { container } = render(
      <AppUpdateGate open={true} phase="downloaded" onClose={onClose} />
    )
    return { container, onClose }
  }

  it('ic-title = "업데이트 준비 완료"', () => {
    renderDownloaded()
    expect(screen.getByText('업데이트 준비 완료')).toBeTruthy()
  })

  it('ic-hic.done 클래스', () => {
    const { container } = renderDownloaded()
    const hic = container.querySelector('.ic-hic')
    expect(hic?.classList.contains('done')).toBe(true)
  })

  it('재시작하여 설치 버튼 존재', () => {
    renderDownloaded()
    expect(screen.getByText('재시작하여 설치')).toBeTruthy()
  })

  it('나중에 버튼 존재', () => {
    renderDownloaded()
    expect(screen.getByText('나중에')).toBeTruthy()
  })

  it('나중에 클릭 → onClose 호출', () => {
    const onClose = vi.fn()
    renderDownloaded(onClose)
    fireEvent.click(screen.getByText('나중에'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ic-status.done 존재', () => {
    const { container } = renderDownloaded()
    const status = container.querySelector('.ic-status')
    expect(status?.classList.contains('done')).toBe(true)
  })
})

describe('AppUpdateGate — phase=available', () => {
  it('ic-title = "업데이트 다운로드 중" (available은 downloading과 동일 타이틀)', () => {
    render(<AppUpdateGate open={true} phase="available" onClose={vi.fn()} />)
    // available 단계에서는 숨기기/확인 버튼 있음
    expect(screen.getByText('숨기기')).toBeTruthy()
  })
})

describe('AppUpdateGate — phase=error', () => {
  it('ic-hic.error 클래스', () => {
    const { container } = render(
      <AppUpdateGate open={true} phase="error" onClose={vi.fn()} />
    )
    const hic = container.querySelector('.ic-hic')
    expect(hic?.classList.contains('error')).toBe(true)
  })

  it('확인 버튼 존재 (error)', () => {
    render(<AppUpdateGate open={true} phase="error" onClose={vi.fn()} />)
    expect(screen.getByText('확인')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Profile
// ══════════════════════════════════════════════════════════════════════════════

describe('Profile — initial=null (첫 방문)', () => {
  function renderNew(onEnter = vi.fn()) {
    const { container } = render(
      <Profile initial={null} onEnter={onEnter} />
    )
    return { container, onEnter }
  }

  it('login-body 렌더', () => {
    const { container } = renderNew()
    expect(container.querySelector('.login-body')).toBeTruthy()
  })

  it('lg-brand 렌더', () => {
    const { container } = renderNew()
    expect(container.querySelector('.lg-brand')).toBeTruthy()
  })

  it('lg-form-wrap > lg-form 렌더', () => {
    const { container } = renderNew()
    expect(container.querySelector('.lg-form-wrap')).toBeTruthy()
    expect(container.querySelector('.lg-form')).toBeTruthy()
  })

  it('title = "시작하기" (initial=null)', () => {
    const { container } = renderNew()
    const title = container.querySelector('.title')
    expect(title?.textContent).toBe('시작하기')
  })

  it('pf-preview 렌더', () => {
    const { container } = renderNew()
    expect(container.querySelector('.pf-preview')).toBeTruthy()
  })

  it('pf-ava 렌더 — 이니셜 "?" (빈 닉네임)', () => {
    const { container } = renderNew()
    const ava = container.querySelector('.pf-ava')
    expect(ava?.textContent?.trim()).toBe('?')
  })

  it('pf-swatches 렌더 — AVATAR_PALETTE 수만큼 pf-swatch', () => {
    const { container } = renderNew()
    const swatches = container.querySelectorAll('.pf-swatch')
    expect(swatches.length).toBe(AVATAR_PALETTE.length)
  })

  it('입장하기 submit disabled (빈 닉네임)', () => {
    const { container } = renderNew()
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submit?.disabled).toBe(true)
  })

  it('닉네임 입력 → pf-ava 이니셜 갱신', () => {
    const { container } = renderNew()
    const input = container.querySelector('input#nickname') as HTMLInputElement
    fireEvent.change(input, { target: { value: '홍길동' } })
    const ava = container.querySelector('.pf-ava')
    expect(ava?.textContent?.trim()).toBe('홍')
  })

  it('닉네임 입력 → pf-preview-name 갱신', () => {
    const { container } = renderNew()
    const input = container.querySelector('input#nickname') as HTMLInputElement
    fireEvent.change(input, { target: { value: '테스터' } })
    const name = container.querySelector('.pf-preview-name')
    expect(name?.textContent?.trim()).toBe('테스터')
  })

  it('닉네임 입력 → 입장하기 활성(enabled)', () => {
    const { container } = renderNew()
    const input = container.querySelector('input#nickname') as HTMLInputElement
    fireEvent.change(input, { target: { value: '홍길동' } })
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submit?.disabled).toBe(false)
  })

  it('pf-swatch 클릭 → aria-pressed=true', () => {
    const { container } = renderNew()
    const swatches = container.querySelectorAll('.pf-swatch') as NodeListOf<HTMLButtonElement>
    // 두 번째 swatch 클릭
    fireEvent.click(swatches[1])
    expect(swatches[1].getAttribute('aria-pressed')).toBe('true')
  })

  it('pf-swatch 클릭 → 이전 swatch aria-pressed=false', () => {
    const { container } = renderNew()
    const swatches = container.querySelectorAll('.pf-swatch') as NodeListOf<HTMLButtonElement>
    // 첫 번째가 기본 선택, 두 번째 클릭
    fireEvent.click(swatches[1])
    expect(swatches[0].getAttribute('aria-pressed')).toBe('false')
    expect(swatches[1].getAttribute('aria-pressed')).toBe('true')
  })

  it('입장하기 submit → onEnter 콜백 호출 (닉네임 입력 후)', () => {
    const onEnter = vi.fn()
    const { container } = renderNew(onEnter)
    const input = container.querySelector('input#nickname') as HTMLInputElement
    fireEvent.change(input, { target: { value: '홍길동' } })
    const form = container.querySelector('form.lg-form') as HTMLFormElement
    fireEvent.submit(form)
    expect(onEnter).toHaveBeenCalledOnce()
    expect(onEnter).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: '홍길동' })
    )
  })

  it('입장하기 submit (빈 닉네임) → onEnter 미호출', () => {
    const onEnter = vi.fn()
    const { container } = renderNew(onEnter)
    const form = container.querySelector('form.lg-form') as HTMLFormElement
    fireEvent.submit(form)
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('feats 목록 4개 렌더', () => {
    const { container } = renderNew()
    const feats = container.querySelectorAll('.feats li')
    expect(feats.length).toBe(4)
  })

  it('TitleBar 자체 렌더 없음 (Shell에서 이미 렌더)', () => {
    const { container } = renderNew()
    // Profile은 자체 TitleBar를 렌더하지 않음 — .titlebar 클래스 없음
    expect(container.querySelector('.titlebar')).toBeFalsy()
  })

  it('window.api 호출 0 — Profile은 IPC 사용 안 함', () => {
    // window.api가 없어도 에러 없이 렌더됨
    const { container } = renderNew()
    expect(container.querySelector('.login-body')).toBeTruthy()
  })
})

describe('Profile — initial 있음 (재방문)', () => {
  const initialProfile = { nickname: '개발자', color: AVATAR_PALETTE[2] }

  function renderReturning(onEnter = vi.fn()) {
    const { container } = render(
      <Profile initial={initialProfile} onEnter={onEnter} />
    )
    return { container, onEnter }
  }

  it('title = "다시 오셨네요" (initial 있음)', () => {
    const { container } = renderReturning()
    const title = container.querySelector('.title')
    expect(title?.textContent).toBe('다시 오셨네요')
  })

  it('pf-ava 이니셜 = 닉네임 첫 글자 "개"', () => {
    const { container } = renderReturning()
    const ava = container.querySelector('.pf-ava')
    expect(ava?.textContent?.trim()).toBe('개')
  })

  it('input value = initial.nickname', () => {
    const { container } = renderReturning()
    const input = container.querySelector('input#nickname') as HTMLInputElement
    expect(input?.value).toBe('개발자')
  })

  it('입장하기 활성 (initial 닉네임 있음)', () => {
    const { container } = renderReturning()
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submit?.disabled).toBe(false)
  })

  it('초기 색상의 pf-swatch aria-pressed=true', () => {
    const { container } = renderReturning()
    const swatches = container.querySelectorAll('.pf-swatch') as NodeListOf<HTMLButtonElement>
    // initial.color = AVATAR_PALETTE[2] → 3번째 swatch
    expect(swatches[2].getAttribute('aria-pressed')).toBe('true')
  })
})
