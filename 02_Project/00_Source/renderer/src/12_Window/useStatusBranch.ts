import { useEffect, useRef, useState } from 'react'
import { ipc } from '@renderer/01_Ipc'

// 상태 줄의 가지 — 폴더가 바뀔 때와 실행이 끝날 때 git에서 다시 읽는다
export function useStatusBranch(workspaceRoot: string | null, isRunning: boolean): string | null {
  const [branch, setBranch] = useState<string | null>(null)
  const readRootRef = useRef<string | null>(null)

  useEffect(() => {
    if (!workspaceRoot) return
    if (isRunning && readRootRef.current === workspaceRoot) return
    if (readRootRef.current !== workspaceRoot) setBranch(null)
    readRootRef.current = workspaceRoot
    let live = true
    ipc.git
      .root({ cwd: workspaceRoot })
      .then((root) => (root ? ipc.git.status({ root }) : null))
      .then((status) => { if (live) setBranch(status?.branch || null) })
      .catch(() => { if (live) setBranch(null) })
    return () => { live = false }
  }, [workspaceRoot, isRunning])

  return workspaceRoot ? branch : null
}
