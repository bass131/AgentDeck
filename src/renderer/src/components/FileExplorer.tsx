/**
 * FileExplorer.tsx — 좌측 파일 탐색기 (F2-02 개편).
 *
 * - workspaceOpen IPC → 트리 렌더 (lazy 접이식: 디렉토리 chevron 토글, 로컬 expanded Set)
 * - 파일타입 컬러 배지(FileBadge) + AI 변경 표시(.fe-changed-dot + .fe-file--changed 이름색)
 * - 파일 검색(클라이언트 필터, treeFilter) — 입력 시 평탄 결과
 * - 파일 클릭 → openFile(코드뷰) + selectDiffFile(diff 병행), 레퍼런스는 읽기전용(refId, diff 미연동)
 *
 * 선택자 보존(plan-auditor 🔴①): .fe-file·.fe-tree·.fe-changed-dot·.fe-ref-section .fe-file 유지.
 * 새 IPC 0 — 검색/펼침은 store in-memory 트리 + 로컬 state.
 * CRITICAL: window.api 호출은 store 액션 경유만. fs/Node 직접 접근 0.
 *
 * 변경색: 현재 store는 changedFiles=Set<string>(타입 무구분) → 단일 변경색(.fe-file--changed).
 *   new/edit(green/yellow) 분리는 store 변경타입 추적 후속.
 */
import { memo, useCallback, useMemo, useState, type JSX } from 'react'
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
import { filterFiles } from '../lib/treeFilter'
import FileBadge from './FileBadge'
import {
  IconChevRight,
  IconFolder,
  IconFolderOpen,
  IconSearch,
  IconPlus,
  IconX,
  IconDots,
} from './icons'
import './FileExplorer.css'

const INDENT_BASE = 10
const INDENT_STEP = 14

// ── 트리 노드 ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileTreeNode
  changedFiles: Set<string>
  selectedPath: string | null
  onFileClick: (path: string) => void
  expanded: Set<string>
  onToggle: (path: string) => void
  depth: number
  showChangedDot?: boolean
}

const TreeNode = memo(function TreeNode({
  node,
  changedFiles,
  selectedPath,
  onFileClick,
  expanded,
  onToggle,
  depth,
  showChangedDot = true,
}: TreeNodeProps): JSX.Element {
  const pad = INDENT_BASE + depth * INDENT_STEP

  if (node.kind === 'file') {
    const isChanged = showChangedDot && changedFiles.has(node.path)
    const isSelected = selectedPath === node.path
    return (
      <button
        className={`fe-node fe-file${isSelected ? ' fe-file--selected' : ''}${isChanged ? ' fe-file--changed' : ''}`}
        style={{ paddingLeft: `${pad}px` }}
        onClick={() => onFileClick(node.path)}
        title={node.path}
        type="button"
        aria-selected={isSelected}
      >
        <FileBadge path={node.path} size={15} />
        <span className="fe-node-name">{node.name}</span>
        {isChanged && <span className="fe-changed-dot" aria-label="AI 변경됨" />}
      </button>
    )
  }

  // directory
  const isOpen = expanded.has(node.path)
  return (
    <div className="fe-dir">
      <button
        className="fe-node fe-dir-head"
        style={{ paddingLeft: `${pad}px` }}
        onClick={() => onToggle(node.path)}
        title={node.path}
        type="button"
        aria-expanded={isOpen}
      >
        <span className={`fe-dir-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
          <IconChevRight size={13} stroke={1.8} />
        </span>
        <span className="fe-dir-ic" aria-hidden="true">
          {isOpen ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
        </span>
        <span className="fe-node-name fe-dir-name">{node.name}</span>
      </button>
      {isOpen &&
        node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            changedFiles={changedFiles}
            selectedPath={selectedPath}
            onFileClick={onFileClick}
            expanded={expanded}
            onToggle={onToggle}
            depth={depth + 1}
            showChangedDot={showChangedDot}
          />
        ))}
    </div>
  )
})

// ── 레퍼런스 섹션 ─────────────────────────────────────────────────────────────

interface ReferenceSectionProps {
  entry: ReferenceEntry
  selectedPath: string | null
  onFileClick: (path: string, refId: string) => void
  expanded: Set<string>
  onToggle: (path: string) => void
}

const ReferenceSection = memo(function ReferenceSection({
  entry,
  selectedPath,
  onFileClick,
  expanded,
  onToggle,
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
          expanded={expanded}
          onToggle={onToggle}
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
  const selectedPath = useAppStore(selectOpenedFile)
  const references = useAppStore(selectReferences)

  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const openFile = useAppStore((s) => s.openFile)
  const selectDiffFile = useAppStore((s) => s.selectDiffFile)
  const addReference = useAppStore((s) => s.addReference)

  // 디렉토리 펼침(로컬). 기본 빈 Set = 루트 직계만 노출, 중첩 디렉토리는 접힘.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleOpen = useCallback(() => void openWorkspace(), [openWorkspace])

  const handleFileClick = useCallback(
    (path: string) => {
      void openFile(path)
      selectDiffFile(path)
    },
    [openFile, selectDiffFile]
  )

  const handleRefFileClick = useCallback(
    (path: string, refId: string) => void openFile(path, refId),
    [openFile]
  )

  const handleAddReference = useCallback(() => void addReference(), [addReference])

  const searching = query.trim().length > 0
  // 검색 결과는 fileTree/query 변경 시에만 재계산(expanded 등 무관 리렌더 회피, reviewer 🟡#1).
  const results = useMemo(
    () => (searching ? filterFiles(fileTree, query) : []),
    [fileTree, query, searching]
  )

  // ── 레퍼런스 섹션 ─────────────────────────────────────────────────────────
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
          <IconPlus size={13} />
        </button>
      </div>
      {references.map((ref) => (
        <ReferenceSection
          key={ref.id}
          entry={ref}
          selectedPath={selectedPath}
          onFileClick={handleRefFileClick}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </div>
  )

  if (!fileTree) {
    return (
      <div className="file-explorer file-explorer--empty">
        <span className="fe-empty-msg">폴더를 여세요</span>
        <button className="fe-open-btn" onClick={handleOpen} type="button" aria-label="폴더 열기">
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
        {references.length > 0 && <span className="fe-main-chip">메인</span>}
        <button
          className="fe-reopen-btn"
          onClick={handleOpen}
          type="button"
          aria-label="다른 폴더 열기"
          title="다른 폴더 열기"
        >
          <IconDots size={14} />
        </button>
      </div>

      <div className="fe-search">
        <IconSearch size={14} className="fe-search-ic" />
        <input
          className="fe-search-input"
          type="text"
          placeholder="파일 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="파일 검색"
        />
        {searching && (
          <button
            className="fe-search-x"
            onClick={() => setQuery('')}
            type="button"
            aria-label="검색 지우기"
          >
            <IconX size={12} />
          </button>
        )}
      </div>

      {searching ? (
        <div className="fe-tree fe-results" role="tree">
          {results.length === 0 ? (
            <p className="fe-note">결과 없음</p>
          ) : (
            results.map((f) => (
              <button
                key={f.path}
                className={`fe-node fe-file${selectedPath === f.path ? ' fe-file--selected' : ''}${changedFiles.has(f.path) ? ' fe-file--changed' : ''}`}
                style={{ paddingLeft: `${INDENT_BASE}px` }}
                onClick={() => handleFileClick(f.path)}
                title={f.path}
                type="button"
              >
                <FileBadge path={f.path} size={15} />
                <span className="fe-node-name">{f.name}</span>
                <span className="fe-result-path">{f.path}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="fe-tree" role="tree">
          {fileTree.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              changedFiles={changedFiles}
              selectedPath={selectedPath}
              onFileClick={handleFileClick}
              expanded={expanded}
              onToggle={onToggle}
              depth={0}
            />
          ))}
        </div>
      )}

      {referenceSection}
    </div>
  )
}

export default memo(FileExplorer)
