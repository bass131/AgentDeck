/**
 * FileExplorer.tsx — 좌측 파일 탐색기.
 *
 * - workspaceOpen IPC → 트리 렌더
 * - AI가 건드린 파일 인디케이터 (store.changedFiles)
 * - 파일 클릭 → store.openFile(코드뷰 1차) + store.selectDiffFile(diff 병행)
 *
 * M2-01: openFile이 기본 동작(코드뷰 표시). selectDiffFile은 diff 탭용으로 병행 유지.
 *
 * CRITICAL: window.api 호출은 store 액션(openWorkspace, openFile) 경유만.
 * fs/Node 직접 접근 0.
 */
import { memo, useCallback } from 'react'
import {
  useAppStore,
  selectFileTree,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectOpenedFile,
} from '../store/appStore'
import type { FileTreeNode } from '../../../shared/ipc-contract'
import './FileExplorer.css'

// ── 트리 노드 컴포넌트 ─────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileTreeNode
  changedFiles: Set<string>
  selectedPath: string | null
  onFileClick: (path: string) => void
  depth: number
}

const TreeNode = memo(function TreeNode({
  node,
  changedFiles,
  selectedPath,
  onFileClick,
  depth,
}: TreeNodeProps): JSX.Element {
  const isChanged = changedFiles.has(node.path)
  const isSelected = selectedPath === node.path

  if (node.kind === 'file') {
    return (
      <button
        className={`fe-node fe-file${isSelected ? ' fe-file--selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onFileClick(node.path)}
        title={node.path}
        type="button"
        aria-selected={isSelected}
      >
        <span className="fe-node-name">{node.name}</span>
        {isChanged && <span className="fe-changed-dot" aria-label="AI 변경됨" />}
      </button>
    )
  }

  // directory
  return (
    <div className="fe-dir">
      <div
        className="fe-node fe-dir-head"
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        title={node.path}
      >
        <span className="fe-dir-chevron" aria-hidden="true">▾</span>
        <span className="fe-node-name">{node.name}</span>
      </div>
      {node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          changedFiles={changedFiles}
          selectedPath={selectedPath}
          onFileClick={onFileClick}
          depth={depth + 1}
        />
      ))}
    </div>
  )
})

// ── FileExplorer ───────────────────────────────────────────────────────────────

export function FileExplorer(): JSX.Element {
  const fileTree = useAppStore(selectFileTree)
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  // M2-01: 선택 기준을 openedFile로 변경 (코드뷰 1차)
  const selectedPath = useAppStore(selectOpenedFile)

  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const openFile = useAppStore((s) => s.openFile)
  const selectDiffFile = useAppStore((s) => s.selectDiffFile)

  const handleOpen = useCallback(() => {
    void openWorkspace()
  }, [openWorkspace])

  const handleFileClick = useCallback(
    (path: string) => {
      // 코드 뷰어가 1차 — IPC fsRead 경유
      void openFile(path)
      // diff도 병행 설정 (좌측 diff 탭에서 접근 가능)
      selectDiffFile(path)
    },
    [openFile, selectDiffFile]
  )

  if (!fileTree) {
    return (
      <div className="file-explorer file-explorer--empty">
        <span className="fe-empty-msg">폴더를 여세요</span>
        <button
          className="fe-open-btn"
          onClick={handleOpen}
          type="button"
          aria-label="폴더 열기"
        >
          폴더 열기
        </button>
      </div>
    )
  }

  const rootName = workspaceRoot
    ? workspaceRoot.split(/[\\/]/).pop() ?? workspaceRoot
    : fileTree.name

  return (
    <div className="file-explorer">
      <div className="fe-workspace-header">
        <span className="fe-workspace-name" title={workspaceRoot ?? ''}>
          {rootName}
        </span>
        <button
          className="fe-reopen-btn"
          onClick={handleOpen}
          type="button"
          aria-label="다른 폴더 열기"
          title="다른 폴더 열기"
        >
          ···
        </button>
      </div>
      <div className="fe-tree" role="tree">
        {fileTree.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            changedFiles={changedFiles}
            selectedPath={selectedPath}
            onFileClick={handleFileClick}
            depth={0}
          />
        ))}
      </div>
    </div>
  )
}

export default memo(FileExplorer)
