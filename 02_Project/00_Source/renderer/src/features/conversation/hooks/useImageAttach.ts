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

function dragHasFile(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types ?? []
  return Array.from(types).includes('Files')
}

export function useImageAttach({ onAttachFiles }: UseImageAttachProps): UseImageAttachReturn {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length > 0) onAttachFiles?.(files)
      e.target.value = ''
    },
    [onAttachFiles]
  )

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
