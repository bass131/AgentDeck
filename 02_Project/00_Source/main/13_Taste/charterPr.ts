// 프로젝트 헌장·Taste 확정의 PR 길. 원격 기본 브랜치 머리에서 새 브랜치를 갈라 문서를 쓰고, 커밋·push한 뒤 기본 브랜치로 PR을 연다.
// 끝나면(실패해도) 원래 브랜치로 돌아온다. 실행기가 돌고 있거나 작업 트리가 더러우면 아무것도 만지지 않는다.
// 병합은 사람이 PR 카드의 병합 버튼으로 한다 — 이 모듈은 병합하지 않는다.
import type { GhPort, GitPort } from '@main/05_Loop/ports'

export interface CharterGit extends Pick<GitPort,
  'hasChanges' | 'syncToRemote' | 'headSha' | 'remoteSha' | 'branchExists' | 'createBranch' | 'checkout' | 'commitAll' | 'push'> {
  currentBranch?(): Promise<string | null>
}

export interface CharterPrRequest {
  git: CharterGit
  gh: Pick<GhPort, 'createPr'>
  // 원격의 기본 브랜치 이름
  base: string
  now: Date
  // 돌고 있으면 사유
  executorBusy(): Promise<string | null>
  // 지금 체크아웃된 작업 트리에 문서를 쓴다. 거절하면 쓰기 전에 던진다
  write(): Promise<void>
  title: string
  body: string
}

export type CharterPrResult = { ok: true; pr: number; branch: string; warning?: string } | { ok: false; reason: string }

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const refuse = (reason: string): CharterPrResult => ({ ok: false, reason })

export function charterBranchName(now: Date): string {
  return `agentdeck/charter-${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}`
}

async function onBranch(req: CharterPrRequest, name: string): Promise<CharterPrResult> {
  const { git, base } = req
  try {
    await git.checkout(name)
    try { await req.write() } catch (e) { return refuse(`문서를 쓰지 않았다 — ${errText(e)}`) }
    if (!(await git.hasChanges())) return refuse(`${base}의 문서와 같아 바뀐 것이 없다 — PR을 열지 않았다`)
    const sha = await git.commitAll(req.title)
    try { await git.push(name, sha) } catch (e) {
      return refuse(`push하지 못했다 — 커밋은 로컬 ${name}에 남았다: ${errText(e)}`)
    }
    const pr = await req.gh.createPr({ head: name, base, title: req.title, body: req.body })
    return { ok: true, pr: pr.number, branch: name }
  } catch (e) {
    return refuse(`${name}에서 확정하지 못했다 — ${errText(e)}`)
  }
}

export async function openCharterPr(req: CharterPrRequest): Promise<CharterPrResult> {
  const busy = await req.executorBusy()
  if (busy !== null) return refuse(busy)
  const { git, base } = req
  const name = charterBranchName(req.now)
  let original = ''
  try {
    if (await git.hasChanges()) return refuse('작업 트리에 커밋하지 않은 변경이 있다 — 정리한 뒤 다시 확정한다')
    const current = (await git.currentBranch?.()) ?? null
    if (current === null) return refuse('지금 브랜치를 알 수 없다(분리된 HEAD) — 브랜치로 옮긴 뒤 다시 확정한다')
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
  const out = await onBranch(req, name)
  try {
    await git.checkout(original)
  } catch (e) {
    const back = `${original}로 돌아오지 못했다 — ${errText(e)}`
    return out.ok ? { ...out, warning: back } : refuse(`${out.reason} / ${back}`)
  }
  return out
}
