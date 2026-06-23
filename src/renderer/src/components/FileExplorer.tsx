/**
 * FileExplorer.tsx — 좌측 파일 탐색기 (F15-01 폴리싱).
 *
 * 원본 Explorer.tsx 시각 구조 1:1 이식:
 *   - .fe-head (탐색기 라벨 + git 버튼 + 접기 버튼)
 *   - .fe-folders (메인 .fe-frow.main + 레퍼런스 .fe-frow + .fe-folder-add)
 *   - "viewing" 모델: 로컬 state. 레퍼런스 버튼 클릭 → 해당 ref 트리를 .fe-tree에 표시
 *   - .fe-search .kbd (Ctrl F 힌트)
 *   - .fe-blank / .fe-blank-btn (빈상태)
 *   - 기존 .fe-tree / .fe-file / FileBadge 유지 (e2e/검색 보존)
 *
 * 변경: .fe-ref-section 하단 스택 제거 → .fe-folders 스위처로 대체.
 * indent = 8 + depth * 14 (원본 일치).
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. IPC는 store 액션 경유.
 * 인라인 색상 0 — CSS 변수 토큰 (paddingLeft는 색 아님, 허용).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
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
import { getPref, setPref } from '../lib/prefs'
import FileBadge from './FileBadge'
import {
  IconChevRight,
  IconChevLeft,
  IconFolder,
  IconFolderOpen,
  IconSearch,
  IconX,
  IconGitBranch,
  IconPlus,
} from './icons'
import './FileExplorer.css'

const INDENT_BASE = 8
const INDENT_STEP = 14

// ── prefs 키 헬퍼 (원본 Explorer.tsx expandedKey 패턴) ──────────────────────

/**
 * 워크스페이스 루트별 펼침 상태 prefs 키.
 * 원본: 'explorer.expanded:' + cwd.replace(/[\\/]+/g, '/').toLowerCase()
 * 값: string[] (펼쳐진 폴더 절대경로 배열)
 * CRITICAL: 폴더 경로 = 무해 UI 상태. 토큰/시크릿 저장 금지.
 */
function expandedKey(workspaceRoot: string): string {
  return 'explorer.expanded:' + workspaceRoot.replace(/[\\/]+/g, '/').toLowerCase()
}

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

// ── FileExplorer ───────────────────────────────────────────────────────────────

export interface FileExplorerProps {
  /** Git 버튼 클릭 시 호출. GitModal 열기(Shell에서 주입). 미주입 시 버튼 숨김. */
  onOpenGit?: () => void
  /**
   * 탐색기 접기 버튼 클릭 시 호출(F15-02, Shell에서 주입).
   * 미주입 시 접기 버튼 숨김(기존 호출부 무파손).
   */
  onCollapse?: () => void
}

export function FileExplorer({ onOpenGit, onCollapse }: FileExplorerProps = {}): JSX.Element {
  const fileTree = useAppStore(selectFileTree)
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  const selectedPath = useAppStore(selectOpenedFile)
  const references = useAppStore(selectReferences)

  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const openFile = useAppStore((s) => s.openFile)
  const selectDiffFile = useAppStore((s) => s.selectDiffFile)
  const addReference = useAppStore((s) => s.addReference)

  // viewing: '' = 메인, 'ref-N' = 해당 레퍼런스 ID
  const [viewing, setViewing] = useState<string>('')
  // 디렉토리 펼침 — prefs 복원(워크스페이스별 영속).
  // 루트 없으면 빈 Set(graceful). 루트 변경 시 useEffect에서 갱신.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!workspaceRoot) return new Set()
    const saved = getPref<string[]>(expandedKey(workspaceRoot), [])
    return new Set(saved)
  })
  const [query, setQuery] = useState('')

  // 이전 워크스페이스 루트 추적 — 루트 변경 시 해당 키로 복원
  const prevRootRef = useRef<string | null>(workspaceRoot)

  useEffect(() => {
    const prevRoot = prevRootRef.current
    prevRootRef.current = workspaceRoot
    // 루트 변경 시에만 복원 (최초 마운트 시 prevRoot === workspaceRoot 이면 이미 초기화됨)
    if (prevRoot === workspaceRoot) return
    if (!workspaceRoot) {
      setExpanded(new Set())
      return
    }
    const saved = getPref<string[]>(expandedKey(workspaceRoot), [])
    setExpanded(new Set(saved))
  }, [workspaceRoot])

  const onToggle = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        // 영속: 루트 있을 때만 저장 (루트 없으면 skip — graceful)
        // CRITICAL: 폴더 경로는 무해 UI 상태. 토큰/시크릿 저장 금지.
        if (workspaceRoot) {
          setPref(expandedKey(workspaceRoot), [...next])
        }
        return next
      })
    },
    [workspaceRoot]
  )

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

  // viewing 대상 ref entry
  const viewingRef: ReferenceEntry | null = useMemo(
    () => (viewing ? references.find((r) => r.id === viewing) ?? null : null),
    [viewing, references]
  )

  const searching = query.trim().length > 0

  // 현재 보여줄 트리 (메인 or 레퍼런스)
  const activeTree: FileTreeNode | null = viewingRef ? viewingRef.tree : fileTree

  const results = useMemo(
    () => (searching ? filterFiles(activeTree, query) : []),
    [activeTree, query, searching]
  )

  const workspaceName = workspaceRoot
    ? workspaceRoot.split(/[\\/]/).pop() ?? workspaceRoot
    : fileTree?.name ?? 'AgentDeck'

  // ── 헤더 (공통 — 빈상태에서도 렌더) ──────────────────────────────────────
  const header = (
    <div className="fe-head">
      <span className="fe-title">탐색기</span>
      {onOpenGit && (
        <button
          className="exp-act git"
          onClick={onOpenGit}
          type="button"
          aria-label="Git"
          title="Git"
        >
          <IconGitBranch size={14} />
        </button>
      )}
      {onCollapse && (
        <button
          className="exp-act"
          onClick={onCollapse}
          type="button"
          aria-label="탐색기 접기"
          title="탐색기 접기"
        >
          <IconChevLeft size={13} />
        </button>
      )}
    </div>
  )

  // ── 빈상태 ─────────────────────────────────────────────────────────────────
  if (!fileTree) {
    return (
      <div className="file-explorer">
        {header}
        <div className="fe-blank">
          <div className="fe-blank-ic">
            <IconFolder size={18} />
          </div>
          <div className="fe-blank-text">
            폴더를 선택하면
            <br />
            프로젝트 파일이 표시돼요
          </div>
          <button className="fe-blank-btn" onClick={handleOpen} type="button" aria-label="폴더 선택">
            폴더 선택
          </button>
        </div>
      </div>
    )
  }

  // ── 폴더 리스트 ───────────────────────────────────────────────────────────
  const folderList = (
    <div className="fe-folders">
      {/* 메인 작업 폴더 버튼 — 레퍼런스 보기 중이면 메인 복귀, 이미 메인이면 다른 폴더 열기 */}
      <button
        className={`fe-frow main${viewing === '' ? ' active' : ''}`}
        onClick={() => (viewing ? setViewing('') : handleOpen())}
        type="button"
        aria-label="메인 작업 폴더"
        title={viewing ? '메인 폴더로' : '클릭하면 다른 폴더 열기'}
      >
        <IconFolder className="f-ic" size={14} />
        <span className="f-name">{workspaceName}</span>
        {references.length > 0 ? (
          <span className="f-main-chip">메인</span>
        ) : (
          <span className="kbd">Ctrl O</span>
        )}
      </button>

      {/* 레퍼런스 폴더들 */}
      {references.map((ref) => (
        <button
          key={ref.id}
          className={`fe-frow${viewing === ref.id ? ' active' : ''}`}
          onClick={() => setViewing(viewing === ref.id ? '' : ref.id)}
          type="button"
          aria-label={`레퍼런스 폴더: ${ref.name}`}
        >
          <IconFolder className="f-ic" size={14} />
          <span className="f-name">{ref.name}</span>
          <span
            className="f-x"
            role="button"
            aria-label="레퍼런스 폴더 닫기"
            onClick={(e) => {
              e.stopPropagation()
              // 닫기 → 메인으로 복귀
              if (viewing === ref.id) setViewing('')
            }}
          >
            <IconX size={10} />
          </span>
        </button>
      ))}

      {/* 폴더 추가 점선 버튼 */}
      <button className="fe-folder-add" onClick={handleAddReference} type="button">
        <IconPlus size={11} /> 폴더 추가
      </button>
    </div>
  )

  // ── 파일 클릭 핸들러 (메인 vs 레퍼런스 분기) ──────────────────────────────
  const onFileClickActive = viewing
    ? (path: string) => handleRefFileClick(path, viewing)
    : handleFileClick

  return (
    <div className="file-explorer">
      {header}
      {folderList}

      {/* 검색창 */}
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
        {searching ? (
          <button
            className="fe-search-x"
            onClick={() => setQuery('')}
            type="button"
            aria-label="검색 지우기"
          >
            <IconX size={12} />
          </button>
        ) : (
          <span className="kbd">Ctrl F</span>
        )}
      </div>

      {/* 트리 or 검색 결과 */}
      {searching ? (
        <div className="fe-tree fe-results" role="tree">
          {results.length === 0 ? (
            <p className="fe-note">결과 없음</p>
          ) : (
            results.map((f) => (
              <button
                key={f.path}
                className={`fe-node fe-file${selectedPath === f.path ? ' fe-file--selected' : ''}${!viewing && changedFiles.has(f.path) ? ' fe-file--changed' : ''}`}
                style={{ paddingLeft: `${INDENT_BASE}px` }}
                onClick={() => onFileClickActive(f.path)}
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
          {activeTree?.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              changedFiles={viewing ? new Set() : changedFiles}
              selectedPath={selectedPath}
              onFileClick={onFileClickActive}
              expanded={expanded}
              onToggle={onToggle}
              depth={0}
              showChangedDot={!viewing}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(FileExplorer)
