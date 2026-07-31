import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  useAppStore,
  selectFileTree,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectOpenedFile,
  selectReferences,
} from '../../store/appStore'
import type { ReferenceEntry } from '../../store/appStore'
import type { FileTreeNode } from '../../../../shared/ipcContract'
import { getPref, setPref } from '../../lib/prefs'
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
} from '../common/icons'
import './FileExplorer.css'

const INDENT_BASE = 8
const INDENT_STEP = 14

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
      if (dirs.get(p) !== 'new') dirs.set(p, tag)
    }
  }
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

function expandedKey(root: string): string {
  return 'explorer.expanded:' + root.replace(/[\\/]+/g, '/').toLowerCase()
}

function normalizeToRel(saved: string[], root: string): string[] {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  return saved.map((p) => {
    const norm = p.replace(/\\/g, '/')
    if (norm.startsWith(normRoot + '/')) {
      return norm.slice(normRoot.length + 1)
    }
    return norm
  }).filter((p) => !p.startsWith('/') && !p.startsWith('..'))
}

function getAncestors(rel: string): string[] {
  const parts = rel.split('/')
  const ancestors: string[] = []
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join('/'))
  }
  return ancestors
}

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

function indent(depth: number): number {
  return INDENT_BASE + depth * INDENT_STEP
}

function basename(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

export interface FileExplorerProps {
  onOpenGit?: () => void
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

  const [viewing, setViewing] = useState<string>('')
  const [prevWorkspaceRoot, setPrevWorkspaceRoot] = useState<string | null>(workspaceRoot)

  if (prevWorkspaceRoot !== workspaceRoot) {
    setPrevWorkspaceRoot(workspaceRoot)
    setViewing('')
  }

  const viewingRef_state: ReferenceEntry | null = useMemo(
    () => (viewing ? references.find((r) => r.id === viewing) ?? null : null),
    [viewing, references]
  )

  const [childrenCache, setChildrenCache] = useState<Map<string, FileTreeNode[]>>(new Map())

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [query, setQuery] = useState('')
  const [allFiles, setAllFiles] = useState<string[] | null>(null)

  const genRef = useRef(0)

  const chg = useMemo(() => {
    const tagMap = new Map<string, ChangeTag>()
    for (const p of changedFiles) tagMap.set(p, 'edit')
    return buildChgMaps(changedFiles, tagMap, !!viewing)
  }, [changedFiles, viewing])

  const loadDir = useCallback(
    (relDir: string, rootId?: string): void => {
      const gen = genRef.current
      const req = rootId ? { rootId, relDir } : { relDir }
      window.api
        .fsListDir(req)
        .then(({ entries }) => {
          if (gen !== genRef.current) return
          setChildrenCache((m) => {
            const next = new Map(m)
            next.set(relDir, entries)
            return next
          })
        })
        .catch(() => {
        })
    },
    []
  )

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

    const rawSaved = getPref<string[]>(expandedKey(effectiveRoot), [])
    const savedRels = normalizeToRel(rawSaved, effectiveRoot)
    const savedSet = new Set(savedRels)
    setExpanded(savedSet)

    loadDir('', viewing ? (viewingRef_state?.id ?? undefined) : undefined)

    const toLoad = allDirsToLoad(savedRels)
    for (const rel of toLoad) {
      loadDir(rel, viewing ? (viewingRef_state?.id ?? undefined) : undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot, viewing])

  const prevFileTree = useRef(fileTree)
  useEffect(() => {
    if (prevFileTree.current === fileTree) return
    prevFileTree.current = fileTree

    if (!workspaceRoot) return

    const rootId = viewing ? (viewingRef_state?.id ?? undefined) : undefined
    loadDir('', rootId)
    expanded.forEach((rel) => loadDir(rel, rootId))
    setAllFiles(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileTree])

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

  const hits = useMemo(
    () => (searching && allFiles ? computeHits(allFiles, query) : []),
    [searching, allFiles, query]
  )

  const toggleDir = useCallback(
    (relPath: string, rootId?: string): void => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(relPath)) {
          next.delete(relPath)
        } else {
          next.add(relPath)
          if (!childrenCache.has(relPath)) {
            loadDir(relPath, rootId)
          }
        }
        if (workspaceRoot) {
          setPref(expandedKey(workspaceRoot), Array.from(next).slice(0, 300))
        }
        return next
      })
    },
    [childrenCache, loadDir, workspaceRoot]
  )

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

  const onFileClickActive = viewing
    ? (path: string) => handleRefFileClick(path, viewing)
    : handleFileClick

  const renderRows = (base: string, depth: number, rootId?: string): React.ReactNode => {
    const list = childrenCache.get(base)

    if (list === undefined) {
      if (base === '') {
        const fallbackTree = viewing ? viewingRef_state?.tree : fileTree
        if (fallbackTree) {
          const rootChildren = fallbackTree.children ?? []
          return rootChildren.map((node) =>
            renderNode(node, depth, rootId)
          )
        }
      }
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

  const workspaceName = workspaceRoot
    ? basename(workspaceRoot)
    : fileTree?.name ?? 'AgentDeck'

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

  const activeRootId = viewing || undefined

  return (
    <div className="file-explorer">
      {header}
      {folderList}

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
