/**
 * FileExplorer.tsx — 좌측 파일 탐색기 (Phase 35 M7: lazy 로딩 + listFiles 검색 전환).
 *
 * 원본 AgentCodeGUI Explorer.tsx 설계 미러:
 *   - 폴더 펼칠 때 IPC(fsListDir) 1레벨씩 lazy 로드. buildTree 1레벨 의존 제거.
 *   - 검색: treeFilter(재귀) 대신 listFiles 플랫 배열 기반(깊은 파일 검색 보존 — B1·CRITICAL).
 *   - prefs 경로: root-상대 POSIX 통일(S2). 절대경로 기존 prefs 하위호환.
 *   - 조상 롤업(변경 배지): changed 파일 → 조상 dir 점 배지(new 우선).
 *   - genRef race 가드: 워크스페이스 전환·빠른 펼침/접기 시 stale async 무시.
 *   - refreshKey: fileTree 변경(refreshFileTree) 시 보이는 폴더 재로드 + allFiles 무효화.
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. window.api 경유만.
 * 인라인 색상 0 — CSS 변수 토큰. paddingLeft(레이아웃 수치)는 허용.
 */
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
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

// ── 조상 rollup 계산 (원본 Explorer.tsx L87-102 미러) ─────────────────────────

type ChangeTag = 'new' | 'edit'

function buildChgMaps(
  changed: Set<string>,
  changedTagMap: Map<string, ChangeTag>,
  viewing: boolean
) {
  const files = new Map<string, ChangeTag>()
  const dirs = new Map<string, ChangeTag>()
  if (viewing) return { files, dirs }
  for (const [filePath, tag] of changedTagMap) {
    files.set(filePath, tag)
    let p = filePath
    while (p.includes('/')) {
      p = p.slice(0, p.lastIndexOf('/'))
      if (dirs.get(p) !== 'new') dirs.set(p, tag) // new 우선
    }
  }
  // changedTagMap이 없을 때 단순 Set 기반 fallback
  if (changedTagMap.size === 0) {
    for (const filePath of changed) {
      files.set(filePath, 'edit')
      let p = filePath
      while (p.includes('/')) {
        p = p.slice(0, p.lastIndexOf('/'))
        if (dirs.get(p) !== 'new') dirs.set(p, 'edit')
      }
    }
  }
  return { files, dirs }
}

// ── prefs 헬퍼 ────────────────────────────────────────────────────────────────

function expandedKey(root: string): string {
  return 'explorer.expanded:' + root.replace(/[\\/]+/g, '/').toLowerCase()
}

/** root-상대 경로로 정규화. 절대경로면 root prefix strip 시도(하위호환). */
function normalizeToRel(saved: string[], root: string): string[] {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  return saved.map((p) => {
    const norm = p.replace(/\\/g, '/')
    if (norm.startsWith(normRoot + '/')) {
      return norm.slice(normRoot.length + 1)
    }
    // 이미 상대경로거나 루트 밖이면 그대로
    return norm
  }).filter((p) => !p.startsWith('/') && !p.startsWith('..'))
}

/** rel 경로의 모든 조상 경로 목록. 예: 'a/b/c' → ['a', 'a/b'] */
function getAncestors(rel: string): string[] {
  const parts = rel.split('/')
  const ancestors: string[] = []
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join('/'))
  }
  return ancestors
}

/** saved expanded 목록에서 실제 로드가 필요한 모든 경로(조상 포함) 반환. */
function allDirsToLoad(savedExpanded: string[]): string[] {
  const dirs = new Set<string>()
  for (const rel of savedExpanded) {
    for (const anc of getAncestors(rel)) {
      dirs.add(anc)
    }
    dirs.add(rel)
  }
  return Array.from(dirs)
}

// ── 검색 hits (원본 Explorer.tsx hits useMemo 미러) ───────────────────────────

function computeHits(allFiles: string[], query: string, limit = 100): string[] {
  const q = query.trim().toLowerCase()
  if (!q || !allFiles.length) return []
  const starts: string[] = []
  const names: string[] = []
  const paths: string[] = []
  for (const f of allFiles) {
    const name = f.slice(f.lastIndexOf('/') + 1).toLowerCase()
    if (name.startsWith(q)) starts.push(f)
    else if (name.includes(q)) names.push(f)
    else if (f.toLowerCase().includes(q)) paths.push(f)
    if (starts.length >= limit) break
  }
  return [...starts, ...names, ...paths].slice(0, limit)
}

// ── 들여쓰기 헬퍼 ─────────────────────────────────────────────────────────────

function indent(depth: number): number {
  return INDENT_BASE + depth * INDENT_STEP
}

// ── basename 헬퍼 ─────────────────────────────────────────────────────────────

function basename(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

// ── FileExplorer 컴포넌트 ─────────────────────────────────────────────────────

export interface FileExplorerProps {
  /** Git 버튼 클릭 시 호출. */
  onOpenGit?: () => void
  /** 접기 버튼 클릭 시 호출. */
  onCollapse?: () => void
}

export function FileExplorer({ onOpenGit, onCollapse }: FileExplorerProps = {}): JSX.Element {
  // store 구독
  const fileTree = useAppStore(selectFileTree)
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  const selectedPath = useAppStore(selectOpenedFile)
  const references = useAppStore(selectReferences)

  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const openFile = useAppStore((s) => s.openFile)
  const selectDiffFile = useAppStore((s) => s.selectDiffFile)
  const addReference = useAppStore((s) => s.addReference)

  // ── viewing: '' = 메인, 'ref-N' = 레퍼런스 ────────────────────────────────
  const [viewing, setViewing] = useState<string>('')
  const [prevWorkspaceRoot, setPrevWorkspaceRoot] = useState<string | null>(workspaceRoot)

  // 워크스페이스 루트 변경 → viewing 초기화 (stale 참고 폴더 방지)
  if (prevWorkspaceRoot !== workspaceRoot) {
    setPrevWorkspaceRoot(workspaceRoot)
    setViewing('')
  }

  const viewingRef_state: ReferenceEntry | null = useMemo(
    () => (viewing ? references.find((r) => r.id === viewing) ?? null : null),
    [viewing, references]
  )

  // (root는 내부 렌더 로직에서 직접 workspaceRoot를 사용하므로 별도 변수 불필요)

  // ── lazy childrenCache ──────────────────────────────────────────────────────
  // Map<relPath, FileTreeNode[]>
  // key 존재 = 로드됨(빈 배열이면 빈 폴더), key 없음 = 미로드
  const [childrenCache, setChildrenCache] = useState<Map<string, FileTreeNode[]>>(new Map())

  // ── expanded Set ────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // ── 검색 ────────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  // allFiles: null = 미로드, [] = 로드됨(빈), string[] = 로드됨
  const [allFiles, setAllFiles] = useState<string[] | null>(null)

  // ── genRef race 가드 (원본 Explorer.tsx:85) ──────────────────────────────────
  // 워크스페이스 전환·빠른 펼침/접기 시 stale async 무시
  const genRef = useRef(0)

  // ── 선택 파일 ───────────────────────────────────────────────────────────────
  // (selectedPath는 store에서 구독)

  // ── 조상 롤업 (원본 L87-102 미러) ───────────────────────────────────────────
  // changedFiles(Set<string>)에서 tag 정보가 없으므로 모두 'edit'로 처리.
  // 향후 tag 분리가 필요하면 store 확장.
  const chg = useMemo(() => {
    const tagMap = new Map<string, ChangeTag>()
    for (const p of changedFiles) tagMap.set(p, 'edit')
    return buildChgMaps(changedFiles, tagMap, !!viewing)
  }, [changedFiles, viewing])

  // ── loadDir (lazy IPC 로드) ──────────────────────────────────────────────────
  const loadDir = useCallback(
    (relDir: string, rootId?: string): void => {
      const gen = genRef.current
      const req = rootId ? { rootId, relDir } : { relDir }
      window.api
        .fsListDir(req)
        .then(({ entries }) => {
          if (gen !== genRef.current) return // race 가드 — stale 무시
          setChildrenCache((m) => {
            const next = new Map(m)
            next.set(relDir, entries)
            return next
          })
        })
        .catch(() => {
          // 실패 시 silent — cache 미설정 → 미로드 상태 유지
        })
    },
    [] // deps 없음 — genRef는 ref
  )

  // ── root 변경 시 트리 초기화 + prefs 복원 ────────────────────────────────────
  // 원본 Explorer.tsx useEffect([root]) 미러
  useEffect(() => {
    genRef.current += 1

    setChildrenCache(new Map())
    setQuery('')
    setAllFiles(null)

    const effectiveRoot = workspaceRoot ?? ''
    if (!effectiveRoot) {
      setExpanded(new Set())
      return
    }

    // prefs 복원 — root-상대 정규화
    const rawSaved = getPref<string[]>(expandedKey(effectiveRoot), [])
    const savedRels = normalizeToRel(rawSaved, effectiveRoot)
    const savedSet = new Set(savedRels)
    setExpanded(savedSet)

    // 루트 1레벨 로드
    loadDir('', viewing ? (viewingRef_state?.id ?? undefined) : undefined)

    // 복원된 expanded 폴더 + 조상 모두 로드
    const toLoad = allDirsToLoad(savedRels)
    for (const rel of toLoad) {
      // genRef 체크는 loadDir 내부에서 수행
      loadDir(rel, viewing ? (viewingRef_state?.id ?? undefined) : undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot, viewing])

  // ── refreshKey: fileTree 변경 시 보이는 폴더 재로드 + allFiles 무효화 ──────────
  // fileTree가 refreshFileTree()로 갱신될 때 탐색기도 최신화한다.
  // 원본 Explorer.tsx useEffect([refreshKey]) 미러.
  const prevFileTree = useRef(fileTree)
  useEffect(() => {
    if (prevFileTree.current === fileTree) return
    prevFileTree.current = fileTree

    if (!workspaceRoot) return

    const rootId = viewing ? (viewingRef_state?.id ?? undefined) : undefined
    // 루트 + 현재 expanded 폴더 재로드
    loadDir('', rootId)
    expanded.forEach((rel) => loadDir(rel, rootId))
    // allFiles 무효화 — 다음 검색 시 재fetch
    setAllFiles(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileTree])

  // ── 검색: allFiles 첫 로드 ──────────────────────────────────────────────────
  const searching = query.trim().length > 0
  useEffect(() => {
    if (!searching || allFiles !== null || !workspaceRoot) return
    const gen = genRef.current
    window.api
      .listFiles({})
      .then(({ files }) => {
        if (gen !== genRef.current) return
        setAllFiles(files)
      })
      .catch(() => {
        if (gen !== genRef.current) return
        setAllFiles([])
      })
  }, [searching, allFiles, workspaceRoot])

  // ── 검색 hits (원본 hits useMemo 미러) ──────────────────────────────────────
  const hits = useMemo(
    () => (searching && allFiles ? computeHits(allFiles, query) : []),
    [searching, allFiles, query]
  )

  // ── toggleDir ───────────────────────────────────────────────────────────────
  const toggleDir = useCallback(
    (relPath: string, rootId?: string): void => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(relPath)) {
          next.delete(relPath)
        } else {
          next.add(relPath)
          // 미로드 시에만 IPC 호출 (cache hit이면 skip)
          if (!childrenCache.has(relPath)) {
            loadDir(relPath, rootId)
          }
        }
        // prefs 저장 (root-상대)
        if (workspaceRoot) {
          setPref(expandedKey(workspaceRoot), Array.from(next).slice(0, 300))
        }
        return next
      })
    },
    [childrenCache, loadDir, workspaceRoot]
  )

  // ── openFile 핸들러 ─────────────────────────────────────────────────────────
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

  const handleOpen = useCallback(() => void openWorkspace(), [openWorkspace])
  const handleAddReference = useCallback(() => void addReference(), [addReference])

  // ── 파일 클릭(메인 vs 레퍼런스 분기) ──────────────────────────────────────────
  const onFileClickActive = viewing
    ? (path: string) => handleRefFileClick(path, viewing)
    : handleFileClick

  // ── 트리 renderRows (원본 Explorer.tsx renderRows 미러) ──────────────────────
  const renderRows = (base: string, depth: number, rootId?: string): React.ReactNode => {
    const list = childrenCache.get(base)

    // 미로드 → fallback (lazy 로드 전 임시 표시)
    if (list === undefined) {
      if (base === '') {
        // viewing=레퍼런스면 레퍼런스 트리 fallback, 메인이면 buildTree fallback
        const fallbackTree = viewing ? viewingRef_state?.tree : fileTree
        if (fallbackTree) {
          const rootChildren = fallbackTree.children ?? []
          return rootChildren.map((node) =>
            renderNode(node, depth, rootId)
          )
        }
      }
      // 깊은 폴더 미로드 → 로딩 중 표시
      return (
        <div
          className="fe-note"
          style={{ paddingLeft: indent(depth) + 18 }}
          key={base + '/...'}
        >
          읽는 중…
        </div>
      )
    }

    if (list.length === 0) {
      return (
        <div
          className="fe-note"
          style={{ paddingLeft: indent(depth) + 18 }}
          key={base + '/empty'}
        >
          비어 있음
        </div>
      )
    }

    return list.map((node) => renderNode(node, depth, rootId))
  }

  const renderNode = (node: FileTreeNode, depth: number, rootId?: string): React.ReactNode => {
    const relPath = node.path

    if (node.kind === 'file') {
      const tag = !viewing ? chg.files.get(relPath) : undefined
      const isSelected = selectedPath === relPath
      return (
        <button
          key={relPath}
          className={`fe-node fe-file${isSelected ? ' fe-file--selected' : ''}${tag ? ` chg-${tag}` : ''}`}
          style={{ paddingLeft: `${indent(depth) + 15}px` }}
          onClick={() => onFileClickActive(relPath)}
          title={relPath}
          type="button"
        >
          <span className="exp-fbadge">
            <FileBadge path={node.name} size={15} />
          </span>
          <span className="fe-node-name">{node.name}</span>
          {tag && <span className={`exp-chg ${tag}`}>{tag === 'new' ? 'N' : 'M'}</span>}
        </button>
      )
    }

    // directory
    const isOpen = expanded.has(relPath)
    const dot = !viewing ? chg.dirs.get(relPath) : undefined

    return (
      <Fragment key={relPath}>
        <button
          className="fe-node fe-dir-head"
          style={{ paddingLeft: `${indent(depth)}px` }}
          onClick={() => toggleDir(relPath, rootId)}
          title={relPath}
          type="button"
          aria-expanded={isOpen}
        >
          <span className={`exp-tw${isOpen ? ' open' : ''}`} aria-hidden="true">
            <IconChevRight size={11} />
          </span>
          <span className="exp-fic" aria-hidden="true">
            {isOpen ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
          </span>
          <span className="fe-node-name fe-dir-name">{node.name}</span>
          {dot && <span className={`exp-dot ${dot}`} />}
        </button>
        {isOpen && renderRows(relPath, depth + 1, rootId)}
      </Fragment>
    )
  }

  // ── 워크스페이스 이름 ────────────────────────────────────────────────────────
  const workspaceName = workspaceRoot
    ? basename(workspaceRoot)
    : fileTree?.name ?? 'AgentDeck'

  // ── 헤더 ────────────────────────────────────────────────────────────────────
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

  // ── 빈상태 ──────────────────────────────────────────────────────────────────
  if (!fileTree && !workspaceRoot) {
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
          <button
            className="fe-blank-btn"
            onClick={handleOpen}
            type="button"
            aria-label="폴더 선택"
          >
            폴더 선택
          </button>
        </div>
      </div>
    )
  }

  // ── 폴더 리스트 ─────────────────────────────────────────────────────────────
  const folderList = (
    <div className="fe-folders">
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
              if (viewing === ref.id) setViewing('')
            }}
          >
            <IconX size={10} />
          </span>
        </button>
      ))}

      <button className="fe-folder-add" onClick={handleAddReference} type="button">
        <IconPlus size={11} /> 폴더 추가
      </button>
    </div>
  )

  // ── 현재 rootId (레퍼런스 보기 중이면 ref.id) ───────────────────────────────
  const activeRootId = viewing || undefined

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
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              e.stopPropagation()
              setQuery('')
            }
          }}
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
          {allFiles === null ? (
            <div className="fe-note">파일 목록 읽는 중…</div>
          ) : hits.length === 0 ? (
            <div className="fe-note">'{query.trim()}' 결과가 없어요</div>
          ) : (
            hits.map((f) => {
              const cut = f.lastIndexOf('/')
              const name = cut >= 0 ? f.slice(cut + 1) : f
              const dir = cut >= 0 ? f.slice(0, cut) : ''
              const tag = !viewing ? chg.files.get(f) : undefined
              return (
                <button
                  key={f}
                  className={`fe-node fe-file${selectedPath === f ? ' fe-file--selected' : ''}${tag ? ` chg-${tag}` : ''}`}
                  style={{ paddingLeft: `${INDENT_BASE}px` }}
                  onClick={() => onFileClickActive(f)}
                  title={f}
                  type="button"
                >
                  <span className="exp-fbadge">
                    <FileBadge path={name} size={15} />
                  </span>
                  <span className="fe-node-name">{name}</span>
                  {dir && <span className="fe-result-path">{dir}</span>}
                  {tag && <span className={`exp-chg ${tag}`}>{tag === 'new' ? 'N' : 'M'}</span>}
                </button>
              )
            })
          )}
        </div>
      ) : (
        <div className="fe-tree" role="tree">
          {renderRows('', 0, activeRootId)}
        </div>
      )}
    </div>
  )
}

export default memo(FileExplorer)
