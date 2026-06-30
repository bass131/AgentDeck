// @vitest-environment jsdom
/**
 * useImageAttach.test.ts — B7 이미지 첨부 훅 단위 테스트.
 *
 * Composer.tsx 리팩토링 Phase 14: 이미지 drop/paste/picker 핸들러 훅화 검증.
 *
 * 검증:
 *   1. 초기 dragOver=false
 *   2. dragHandlers.onDragEnter(파일 포함) → dragOver=true
 *   3. dragHandlers.onDragLeave → dragOver=false (depth 0일 때)
 *   4. handlePaste(이미지 클립보드) → onAttachFiles 호출
 *   5. handleFileInputChange → onAttachFiles 호출
 *   6. handleAttach → fileInputRef.current.click() (ref 연결 시)
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useImageAttach } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useImageAttach'

describe('useImageAttach', () => {
  it('초기 dragOver=false', () => {
    const { result } = renderHook(() => useImageAttach({ onAttachFiles: vi.fn() }))
    expect(result.current.dragOver).toBe(false)
  })

  it('dragHandlers.onDragEnter(파일 있는 event) → dragOver=true', () => {
    const { result } = renderHook(() => useImageAttach({ onAttachFiles: vi.fn() }))
    act(() => {
      result.current.dragHandlers.onDragEnter({
        dataTransfer: { types: ['Files'] },
      } as unknown as React.DragEvent)
    })
    expect(result.current.dragOver).toBe(true)
  })

  it('dragHandlers.onDragEnter(파일 없는 event) → dragOver 변화 없음', () => {
    const { result } = renderHook(() => useImageAttach({ onAttachFiles: vi.fn() }))
    act(() => {
      result.current.dragHandlers.onDragEnter({
        dataTransfer: { types: [] },
      } as unknown as React.DragEvent)
    })
    expect(result.current.dragOver).toBe(false)
  })

  it('onDragLeave → depth=0 되면 dragOver=false', () => {
    const { result } = renderHook(() => useImageAttach({ onAttachFiles: vi.fn() }))
    act(() => {
      result.current.dragHandlers.onDragEnter({
        dataTransfer: { types: ['Files'] },
      } as unknown as React.DragEvent)
    })
    act(() => {
      result.current.dragHandlers.onDragLeave()
    })
    expect(result.current.dragOver).toBe(false)
  })

  it('handlePaste: 이미지 클립보드 → onAttachFiles 호출', () => {
    const onAttachFiles = vi.fn()
    const { result } = renderHook(() => useImageAttach({ onAttachFiles }))
    const mockFile = new File([], 'test.png', { type: 'image/png' })
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => mockFile }],
      },
      preventDefault: vi.fn(),
    } as unknown as React.ClipboardEvent<HTMLTextAreaElement>
    act(() => {
      result.current.handlePaste(event)
    })
    expect(onAttachFiles).toHaveBeenCalledWith([mockFile])
  })

  it('handlePaste: 텍스트만 → onAttachFiles 미호출', () => {
    const onAttachFiles = vi.fn()
    const { result } = renderHook(() => useImageAttach({ onAttachFiles }))
    const event = {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain' }],
      },
      preventDefault: vi.fn(),
    } as unknown as React.ClipboardEvent<HTMLTextAreaElement>
    act(() => {
      result.current.handlePaste(event)
    })
    expect(onAttachFiles).not.toHaveBeenCalled()
  })

  it('handleFileInputChange: 파일 있음 → onAttachFiles 호출', () => {
    const onAttachFiles = vi.fn()
    const { result } = renderHook(() => useImageAttach({ onAttachFiles }))
    const mockFile = new File([], 'img.png', { type: 'image/png' })
    const mockInput = { value: '' }
    const event = {
      target: { files: [mockFile], ...mockInput, value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    Object.defineProperty(event.target, 'value', {
      writable: true,
      value: 'C:\\fakepath\\img.png',
    })
    act(() => {
      result.current.handleFileInputChange(event)
    })
    expect(onAttachFiles).toHaveBeenCalledWith([mockFile])
  })

  it('onAttachFiles 미전달 시 핸들러 호출돼도 에러 없음', () => {
    const { result } = renderHook(() => useImageAttach({}))
    expect(() => {
      act(() => {
        result.current.handlePaste({
          clipboardData: { items: [] },
          preventDefault: vi.fn(),
        } as unknown as React.ClipboardEvent<HTMLTextAreaElement>)
      })
    }).not.toThrow()
  })
})
