// 프로젝트 헌장·Taste 확정의 PR 길. 원격 기본 브랜치 머리에서 새 브랜치를 갈라 문서를 쓰고, 문서 경로만 커밋·push한 뒤 기본 브랜치로 PR을 연다.
// 끝나면(실패해도) 원래 브랜치로 돌아온다. 커밋하지 못한 문서는 돌아가기 전에 되돌려 사람의 브랜치로 따라가지 않는다.
// 병합은 사람이 PR 카드의 병합 버튼으로 한다 — 이 모듈은 병합하지 않는다.
import type { GhPort, GitPort } from '@main/05_Loop/ports'

export interface CharterGit extends Pick<GitPort, 'syncToRemote' | 'headSha' | 'remoteSha' | 'branchExists' | 'createBranch' | 'checkout' | 'push'> {
  currentBranch(): Promise<string | null>
  changedPaths(): Promise<string[]>
  commitPaths(paths: string[], message: string): Promise<string>
  discardPaths(paths: string[]): Promise<void>
}

export interface CharterCut { original: string; branch: string }

interface CharterPrRequest {
  git: CharterGit
  gh: Pick<GhPort, 'createPr'>
  // 원격의 기본 브랜치 이름
  base: string
  now: Date
  // 쓰는 문서의 저장소 상대 경로 — 이 경로만 커밋한다
  paths: string[]
  // 돌고 있으면 사유
  executorBusy(): Promise<string | null>
  // 브랜치를 가른 직후, 옮겨 가기 전에 부른다(앱이 꺼져도 사람에게 알릴 수 있게)
  onCut?(cut: CharterCut): void
  // 지금 체크아웃된 작업 트리에 문서를 쓴다. 거절하면 쓰기 전에 던진다
  write(): Promise<void>
  title: string
  body: string
}

type CharterPrResult = { ok: true; pr: number; branch: string; warning?: string } | { ok: false; reason: string }

export const CHARTER_BRANCH_PREFIX = 'agentdeck/charter-'
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const refuse = (reason: string): CharterPrResult => ({ ok: false, reason })
const listed = (ps: string[]): string => ps.slice(0, 5).join(', ') + (ps.length > 5 ? ` 외 ${ps.length - 5}개` : '')

export function charterBranchName(now: Date): string {
  return `${CHARTER_BRANCH_PREFIX}${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}`
}

async function onBranch(req: CharterPrRequest, name: string): Promise<CharterPrResult> {
  const { git, base, paths } = req
  const outside = (ps: string[]): string[] => ps.filter((p) => !paths.includes(p))
  let written = false
  const discard = async (why: string): Promise<CharterPrResult> => {
    if (!written) return refuse(why)
    try { await git.discardPaths(paths) } catch (e) { return refuse(`${why} / 쓴 문서를 되돌리지 못했다: ${errText(e)}`) }
    return refuse(why)
  }
  try {
    await git.checkout(name)
    const exposed = await git.changedPaths()
    if (exposed.length > 0) {
      return refuse(`${base}로 옮기자 추적 밖이 아닌 파일이 드러났다(${listed(exposed)}) — 지금 브랜치에서만 무시되는 파일이 PR에 섞이지 않게 쓰지 않았다. 그 파일을 치우거나 ${base}의 .gitignore에 더한 뒤 다시 확정한다`)
    }
    written = true
    try { await req.write() } catch (e) { return await discard(`문서를 쓰지 않았다 — ${errText(e)}`) }
    const changed = await git.changedPaths()
    const extra = outside(changed)
    if (extra.length > 0) return await discard(`문서 밖의 경로가 바뀌어 커밋하지 않았다(${listed(extra)})`)
    if (changed.length === 0) return refuse(`${base}의 문서와 같아 바뀐 것이 없다 — PR을 열지 않았다`)
    let sha: string
    try { sha = await git.commitPaths(changed, req.title) } catch (e) { return await discard(`커밋하지 못했다 — ${errText(e)}`) }
    written = false
    try { await git.push(name, sha) } catch (e) {
      return refuse(`push하지 못했다 — 커밋은 로컬 ${name}에 남았다: ${errText(e)}`)
    }
    try {
      const pr = await req.gh.createPr({ head: name, base, title: req.title, body: req.body })
      return { ok: true, pr: pr.number, branch: name }
    } catch (e) {
      return refuse(`PR을 열지 못했다 — 원격 ${name}에 push는 됐다: ${errText(e)}`)
    }
  } catch (e) {
    return await discard(`${name}에서 확정하지 못했다 — ${errText(e)}`)
  }
}

export async function openCharterPr(req: CharterPrRequest): Promise<CharterPrResult> {
  const busy = await req.executorBusy()
  if (busy !== null) return refuse(busy)
  const { git, base } = req
  const name = charterBranchName(req.now)
  let original = ''
  try {
    if ((await git.changedPaths()).length > 0) return refuse('작업 트리에 커밋하지 않은 변경이 있다 — 정리한 뒤 다시 확정한다')
    const current = await git.currentBranch()
    if (current === null) return refuse('지금 브랜치를 알 수 없다(분리된 HEAD) — 브랜치로 옮긴 뒤 다시 확정한다')
    if (current.startsWith(CHARTER_BRANCH_PREFIX)) return refuse(`지금 브랜치 ${current}가 문서 확정 브랜치다 — 작업하던 브랜치로 옮긴 뒤 다시 확정한다`)
    original = current
    await git.syncToRemote(base)
    const local = await git.headSha(base)
    const remote = await git.remoteSha(base)
    if (remote === null) return refuse(`원격에 ${base} 브랜치가 없다`)
    if (local !== remote) return refuse(`로컬 ${base}가 원격 머리와 다르다 — push하지 않은 커밋을 정리한 뒤 다시 확정한다`)
    if (await git.branchExists(name)) return refuse(`${name} 브랜치가 이미 있다 — 잠시 뒤 다시 확정한다`)
    await git.createBranch(name, base)
  } catch (e) {
    return refuse(`${base}에서 브랜치를 가르지 못했다 — ${errText(e)}`)
  }
  req.onCut?.({ original, branch: name })
  const out = await onBranch(req, name)
  try {
    await git.checkout(original)
  } catch (e) {
    const back = `${original}로 돌아오지 못했다 — 지금 ${name}에 있을 수 있다: ${errText(e)}`
    return out.ok ? { ...out, warning: back } : refuse(`${out.reason} / ${back}`)
  }
  return out
}
