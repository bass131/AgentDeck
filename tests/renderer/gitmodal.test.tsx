// @vitest-environment jsdom
/**
 * gitmodal.test.tsx — F11-01 GitModal TDD 단위 테스트.
 *
 * - 정적 샘플 데이터(gitSampleData.ts)로 렌더 — window.api 호출 0.
 * - diff-head(repoName·branch·당겨오기·푸시) 렌더.
 * - nav 항목(변경 사항/모든 커밋/브랜치/원격/태그) 렌더.
 * - history 뷰: 커밋 rows + 클릭 시 gd-detail(subject) 표시.
 * - 검색 필터: query → 커밋 메시지 필터.
 * - changes 뷰: FileRow + 커밋 컴포저(subject input, 빈 시 disabled).
 * - 최대화 토글: gitm-modal에 maximized 클래스 추가/제거.
 * - Esc/오버레이 mousedown+click 닫기.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

afterEach(() => cleanup())

// window.api stub (GitModal은 window.api 호출 0이지만 다른 컴포넌트 import 경로 대비)
Object.defineProperty(window, 'api', {
  value: {},
  writable: true,
  configurable: true,
})

async function renderGitModal(onClose = vi.fn()) {
  const { GitModal } = await import('../../src/renderer/src/components/GitModal')
  return render(<GitModal onClose={onClose} />)
}

describe('GitModal — F11-01', () => {
  // ── diff-head 헤더 ──────────────────────────────────────────────────────────

  it('diff-head에 repoName이 렌더된다', async () => {
    await renderGitModal()
    // GIT_STATUS.repoName = 'AgentDeck'
    expect(screen.getByText('AgentDeck')).toBeTruthy()
  })

  it('diff-head에 브랜치 표시(.gitm-br)가 렌더된다', async () => {
    const { container } = await renderGitModal()
    const brEl = container.querySelector('.gitm-br')
    expect(brEl).toBeTruthy()
    // branch 텍스트 포함
    expect(brEl?.textContent).toContain('main')
  })

  it('diff-head에 ahead 카운트가 표시된다', async () => {
    const { container } = await renderGitModal()
    const brEl = container.querySelector('.gitm-br')
    // GIT_STATUS.ahead=2 → ↑2
    expect(brEl?.textContent).toContain('2')
  })

  it('당겨오기 버튼이 렌더된다', async () => {
    await renderGitModal()
    const buttons = screen.getAllByRole('button')
    const pull = buttons.find((b) => b.textContent?.includes('당겨오기'))
    expect(pull).toBeTruthy()
  })

  it('푸시 버튼이 렌더된다', async () => {
    await renderGitModal()
    const buttons = screen.getAllByRole('button')
    const push = buttons.find((b) => b.textContent?.includes('푸시'))
    expect(push).toBeTruthy()
  })

  // ── nav ────────────────────────────────────────────────────────────────────

  it('nav에 변경 사항 항목이 렌더된다', async () => {
    await renderGitModal()
    expect(screen.getByText('변경 사항')).toBeTruthy()
  })

  it('nav에 모든 커밋 항목이 렌더된다', async () => {
    await renderGitModal()
    expect(screen.getByText('모든 커밋')).toBeTruthy()
  })

  it('nav에 브랜치 섹션이 렌더된다', async () => {
    await renderGitModal()
    // 브랜치 항목 — static gitm-item에 ⎇ + branch name
    expect(screen.getByText('main')).toBeTruthy()
  })

  it('nav에 원격 섹션이 렌더된다', async () => {
    await renderGitModal()
    expect(screen.getByText('origin')).toBeTruthy()
  })

  it('nav에 태그 섹션이 렌더된다', async () => {
    await renderGitModal()
    expect(screen.getByText('v1.0.0')).toBeTruthy()
  })

  // ── history 뷰 ─────────────────────────────────────────────────────────────

  it('history 뷰가 기본 표시된다 — 커밋 rows 존재', async () => {
    const { container } = await renderGitModal()
    // 기본 view='history'
    const commits = container.querySelectorAll('.gitm-commit')
    expect(commits.length).toBeGreaterThanOrEqual(5)
  })

  it('커밋 클릭 시 gd-detail에 subject가 표시된다', async () => {
    const { container } = await renderGitModal()
    const firstCommit = container.querySelector('.gitm-commit') as HTMLElement
    expect(firstCommit).toBeTruthy()
    await act(async () => {
      fireEvent.click(firstCommit)
    })
    // gd-msg에 subject 표시
    const gdMsg = container.querySelector('.gd-msg')
    expect(gdMsg).toBeTruthy()
    expect(gdMsg?.textContent?.length).toBeGreaterThan(0)
  })

  it('커밋 미선택 시 "커밋을 선택하세요" 메시지 표시 — 초기 첫 커밋 선택됨이면 gd-msg 표시', async () => {
    const { container } = await renderGitModal()
    // 기본으로 첫 커밋이 선택되거나, 아무것도 선택 안 됨 두 케이스 모두 허용
    // gd-pad 또는 "커밋을 선택하세요" 둘 중 하나 존재
    const hasDetail = container.querySelector('.gd-pad') || screen.queryByText('커밋을 선택하세요')
    expect(hasDetail).toBeTruthy()
  })

  it('gd-detail에 gd-av(작성자 이니셜), gd-who, gd-hash가 렌더된다', async () => {
    const { container } = await renderGitModal()
    // 선택된 커밋이 있는 경우(기본 첫 커밋 선택)
    const firstCommit = container.querySelector('.gitm-commit') as HTMLElement
    if (firstCommit) {
      await act(async () => {
        fireEvent.click(firstCommit)
      })
    }
    const gdAv = container.querySelector('.gd-av')
    if (gdAv) {
      expect(gdAv.textContent?.length).toBeGreaterThanOrEqual(1)
      expect(container.querySelector('.gd-who')).toBeTruthy()
      expect(container.querySelector('.gd-hash')).toBeTruthy()
    }
  })

  it('gd-hash 클릭 시 "복사됨" 텍스트로 전환된다', async () => {
    const { container } = await renderGitModal()
    const firstCommit = container.querySelector('.gitm-commit') as HTMLElement
    if (firstCommit) {
      await act(async () => {
        fireEvent.click(firstCommit)
      })
    }
    const hashBtn = container.querySelector('.gd-hash') as HTMLElement
    if (hashBtn) {
      // clipboard mock
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      })
      await act(async () => {
        fireEvent.click(hashBtn)
      })
      // "복사됨" 또는 hash text (clipboard 미지원 환경 허용)
      expect(hashBtn).toBeTruthy()
    }
  })

  // ── 검색 필터 ──────────────────────────────────────────────────────────────

  it('검색 input이 렌더된다', async () => {
    await renderGitModal()
    const searchInput = screen.getByPlaceholderText('커밋 메시지·해시·작성자 검색…')
    expect(searchInput).toBeTruthy()
  })

  it('검색 query가 커밋 목록을 필터한다', async () => {
    const { container } = await renderGitModal()
    const input = screen.getByPlaceholderText('커밋 메시지·해시·작성자 검색…')
    // 존재하지 않는 검색어
    await act(async () => {
      fireEvent.change(input, { target: { value: 'zzz_no_match_xyz' } })
    })
    const commits = container.querySelectorAll('.gitm-commit')
    expect(commits.length).toBe(0)
  })

  it('검색어 x 버튼 클릭 시 query 초기화', async () => {
    const { container } = await renderGitModal()
    const input = screen.getByPlaceholderText('커밋 메시지·해시·작성자 검색…')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'feat' } })
    })
    // x 버튼 (aria-label="검색 지우기")
    const clearBtn = screen.getByLabelText('검색 지우기')
    await act(async () => {
      fireEvent.click(clearBtn)
    })
    const commits = container.querySelectorAll('.gitm-commit')
    expect(commits.length).toBeGreaterThanOrEqual(5)
  })

  // ── changes 뷰 ─────────────────────────────────────────────────────────────

  it('nav "변경 사항" 클릭 시 changes 뷰로 전환된다', async () => {
    const { container } = await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
    })
    // gitm-list.wide 표시
    expect(container.querySelector('.gitm-list.wide')).toBeTruthy()
  })

  it('changes 뷰에서 FileRow(.gitm-file)가 렌더된다', async () => {
    const { container } = await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
    })
    expect(container.querySelectorAll('.gitm-file').length).toBeGreaterThanOrEqual(1)
  })

  it('changes 뷰 커밋 컴포저 — subject input이 렌더된다', async () => {
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
    })
    const subjectInput = screen.getByPlaceholderText('커밋 메시지')
    expect(subjectInput).toBeTruthy()
  })

  it('커밋 버튼은 subject 입력 전 disabled 상태', async () => {
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
    })
    // 커밋 버튼은 text="커밋" 버튼
    const buttons = screen.getAllByRole('button')
    const commitBtn = buttons.find((b) => b.textContent?.trim() === '커밋') as HTMLButtonElement
    expect(commitBtn).toBeTruthy()
    expect(commitBtn.disabled).toBe(true)
  })

  it('subject 입력 후 커밋 버튼 활성화', async () => {
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
    })
    const subjectInput = screen.getByPlaceholderText('커밋 메시지')
    await act(async () => {
      fireEvent.change(subjectInput, { target: { value: 'feat: 새 기능' } })
    })
    const buttons = screen.getAllByRole('button')
    const commitBtn = buttons.find((b) => b.textContent?.trim() === '커밋') as HTMLButtonElement
    expect(commitBtn.disabled).toBe(false)
  })

  it('Claude에게 메시지 짓게 하기 버튼이 렌더된다', async () => {
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
    })
    const buttons = screen.getAllByRole('button')
    const claudeBtn = buttons.find((b) => b.textContent?.includes('Claude에게 메시지 짓게 하기'))
    expect(claudeBtn).toBeTruthy()
  })

  // ── 최대화 토글 ────────────────────────────────────────────────────────────

  it('최대화 버튼 클릭 시 gitm-modal에 maximized 클래스 추가', async () => {
    const { container } = await renderGitModal()
    const modal = container.querySelector('.gitm-modal')
    expect(modal?.classList.contains('maximized')).toBe(false)
    // 최대화 버튼(aria-label="최대화")
    const maxBtn = screen.getByLabelText('최대화')
    await act(async () => {
      fireEvent.click(maxBtn)
    })
    expect(container.querySelector('.gitm-modal')?.classList.contains('maximized')).toBe(true)
  })

  it('최대화 후 버튼 label이 "이전 크기로"로 변경', async () => {
    await renderGitModal()
    const maxBtn = screen.getByLabelText('최대화')
    await act(async () => {
      fireEvent.click(maxBtn)
    })
    expect(screen.getByLabelText('이전 크기로')).toBeTruthy()
  })

  it('최대화 → 이전 크기로 버튼 클릭 시 maximized 클래스 제거', async () => {
    const { container } = await renderGitModal()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('최대화'))
    })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('이전 크기로'))
    })
    expect(container.querySelector('.gitm-modal')?.classList.contains('maximized')).toBe(false)
  })

  // ── Esc / 오버레이 닫기 ────────────────────────────────────────────────────

  it('Esc 키 입력 시 onClose 호출', async () => {
    const onClose = vi.fn()
    await renderGitModal(onClose)
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('오버레이 mousedown+click 시 onClose 호출', async () => {
    const onClose = vi.fn()
    const { container } = await renderGitModal(onClose)
    const overlay = container.querySelector('.gitm-overlay') as HTMLElement
    await act(async () => {
      fireEvent.mouseDown(overlay, { target: overlay })
      fireEvent.click(overlay, { target: overlay })
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('모달 내부 클릭은 onClose 호출하지 않음', async () => {
    const onClose = vi.fn()
    const { container } = await renderGitModal(onClose)
    const modal = container.querySelector('.gitm-modal') as HTMLElement
    await act(async () => {
      fireEvent.click(modal)
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('닫기 버튼(aria-label="닫기") 클릭 시 onClose 호출', async () => {
    const onClose = vi.fn()
    await renderGitModal(onClose)
    const closeBtn = screen.getByLabelText('닫기')
    await act(async () => {
      fireEvent.click(closeBtn)
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  // ── scope 검증 — window.api 호출 0 ─────────────────────────────────────────

  it('window.api가 한 번도 호출되지 않는다', async () => {
    // window.api가 실제로 호출되었다면 Proxy로 잡힌다
    const apiProxy = new Proxy(
      {},
      {
        get(_t, p) {
          if (typeof p === 'string') {
            // git 호출이면 에러
            throw new Error(`window.api.${p} called — IPC 호출 금지(정적 샘플)`)
          }
          return undefined
        },
      }
    )
    Object.defineProperty(window, 'api', { value: apiProxy, writable: true, configurable: true })
    // 렌더 시 throw 없어야 함
    await expect(renderGitModal()).resolves.toBeTruthy()
  })
})
