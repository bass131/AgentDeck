/**
 * FileExplorer.tsx — 좌측 파일 탐색기.
 *
 * - workspaceOpen IPC → 트리 렌더
 * - AI가 건드린 파일 인디케이터 (store.changedFiles)
 * - 파일 클릭 → store.openFile(코드뷰 1차) + store.selectDiffFile(diff 병행)
 * - 레퍼런스 폴더 섹션 (M2-03): 읽기전용, diff 미연동
 *
 * CRITICAL: window.api 호출은 store 액션(openWorkspace, openFile, addReference) 경유만.
 * fs/Node 직접 접근 0.
 */
import { memo, useCallback } from 'react'
import {
  useAppStore,
  selectFileTree,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectOpenedFile,
  selectReferences,
} from '../store/appStore'
import type { ReferenceEntry } from '../store/appStore'
import type { FileTreeNode } from '../../../shared/ipc-contract'
import './FileExplorer.css'

// ── 트리 노드 컴포넌트 ─────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileTreeNode
  changedFiles: Set<string>
  selectedPath: string | null
  onFileClick: (path: string) => void
  depth: number
  /** 변경 인디케이터 표시 여부 (레퍼런스 트리에서는 false) */
  showChangedDot?: boolean
}

const TreeNode = memo(function TreeNode({
  node,
  changedFiles,
  selectedPath,
  onFileClick,
  depth,
  showChangedDot = true,
}: TreeNodeProps): JSX.Element {
  const isChanged = showChangedDot && changedFiles.has(node.path)
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
          showChangedDot={showChangedDot}
        />
      ))}
    </div>
  )
})

// ── ReferenceSection — 레퍼런스 폴더 하나의 섹션 ─────────────────────────────

interface ReferenceSectionProps {
  entry: ReferenceEntry
  selectedPath: string | null
  onFileClick: (path: string, refId: string) => void
}

const ReferenceSection = memo(function ReferenceSection({
  entry,
  selectedPath,
  onFileClick,
}: ReferenceSectionProps): JSX.Element {
  const handleClick = useCallback(
    (path: string) => onFileClick(path, entry.id),
    [onFileClick, entry.id]
  )

  return (
    <div className="fe-ref-section">
      <div className="fe-ref-header">
        <span className="fe-node-name fe-ref-name">{entry.name}</span>
        <span className="fe-ref-badge" aria-label="읽기전용">읽기전용</span>
      </div>
      {entry.tree?.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          changedFiles={new Set()}
          selectedPath={selectedPath}
          onFileClick={handleClick}
          depth={0}
          showChangedDot={false}
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
  const references = useAppStore(selectReferences)

  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const openFile = useAppStore((s) => s.openFile)
  const selectDiffFile = useAppStore((s) => s.selectDiffFile)
  const addReference = useAppStore((s) => s.addReference)

  const handleOpen = useCallback(() => {
    void openWorkspace()
  }, [openWorkspace])

  const handleFileClick = useCallback(
    (path: string) => {
      // 코드 뷰어가 1차 — IPC fsRead 경유 (root 없음 = 워크스페이스)
      void openFile(path)
      // diff도 병행 설정 (좌측 diff 탭에서 접근 가능)
      selectDiffFile(path)
    },
    [openFile, selectDiffFile]
  )

  // 레퍼런스 파일 클릭 — rootId 포함, diff 미연동
  const handleRefFileClick = useCallback(
    (path: string, refId: string) => {
      void openFile(path, refId)
      // selectDiffFile 호출하지 않음 — 레퍼런스는 읽기전용, diff 연동 X
    },
    [openFile]
  )

  const handleAddReference = useCallback(() => {
    void addReference()
  }, [addReference])

  // ── 레퍼런스 섹션 (fileTree 유무와 무관하게 항상 렌더) ─────────────────────

  const referenceSection = (
    <div className="fe-ref-container">
      <div className="fe-ref-section-header">
        <span className="fe-ref-section-title">레퍼런스</span>
        <button
          className="fe-ref-add-btn"
          onClick={handleAddReference}
          type="button"
          aria-label="레퍼런스 폴더 추가"
          title="레퍼런스 폴더 추가"
        >
          +
        </button>
      </div>
      {references.map((ref) => (
        <ReferenceSection
          key={ref.id}
          entry={ref}
          selectedPath={selectedPath}
          onFileClick={handleRefFileClick}
        />
      ))}
    </div>
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
        {referenceSection}
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
      {referenceSection}
    </div>
  )
}

export default memo(FileExplorer)
