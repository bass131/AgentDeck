/**
 * useImageAttach.ts — B7 이미지 첨부 훅.
 *
 * drop/paste/picker 세 경로를 하나의 훅으로 통합.
 * - dragHandlers: .composer div에 spread → DragEnter/Over/Leave/Drop 처리.
 * - handlePaste: textarea onPaste — 이미지 클립보드 항목만 추출.
 * - handleAttach: 첨부 버튼 클릭 → 숨김 file input click.
 * - handleFileInputChange: file input onChange → 파일 전달.
 *
 * 상태 출처 단일화: dragOver·dragDepth·fileInputRef는 이 훅이 단독 소유.
 * CRITICAL: renderer untrusted — IPC 0. 파일은 onAttachFiles prop으로 상위 전달.
 */
import { useRef, useState, useCallback, type RefObject } from 'react'

interface UseImageAttachProps {
  onAttachFiles?: (files: File[]) => void
}

export interface UseImageAttachReturn {
  fileInputRef: RefObject<HTMLInputElement | null>
  dragOver: boolean
  handleAttach: () => void
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: () => void
    onDrop: (e: React.DragEvent) => void
  }
}

/** dataTransfer.types에 'Files'가 포함돼 있는지 확인 */
function dragHasFile(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types ?? []
  return Array.from(types).includes('Files')
}

export function useImageAttach({ onAttachFiles }: UseImageAttachProps): UseImageAttachReturn {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  // 중첩 드래그 이벤트 처리: Enter/Leave 쌍의 depth 추적
  const dragDepth = useRef(0)

  // 이미지 첨부 버튼 → 숨김 file input click
  const handleAttach = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // file input onChange → 파일 목록 추출 후 상위 전달. input value 리셋(재첨부 허용)
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length > 0) onAttachFiles?.(files)
      e.target.value = ''
    },
    [onAttachFiles]
  )

  // textarea onPaste → 이미지 파일만 추출. 스크린샷이 텍스트로 붙여넣기되지 않도록 preventDefault.
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items ?? [])
      const imageFiles = items
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null)
      if (imageFiles.length > 0) {
        e.preventDefault()
        onAttachFiles?.(imageFiles)
      }
    },
    [onAttachFiles]
  )

  // .composer div 드래그 핸들러 객체 (JSX spread용)
  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!dragHasFile(e)) return
      dragDepth.current += 1
      setDragOver(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragHasFile(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragOver(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files ?? [])
      if (files.length > 0) onAttachFiles?.(files)
    },
  }

  return { fileInputRef, dragOver, handleAttach, handleFileInputChange, handlePaste, dragHandlers }
}
