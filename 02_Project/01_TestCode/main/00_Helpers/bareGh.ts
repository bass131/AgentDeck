// GitHub 흉내 — 원격 base가 PR 머리를 품으면 병합됨으로 닫는다(GitHub가 하는 일). 임시 bare 원격에만 닿는다.
import type { CiStatus } from '@main/05_Loop/executor'
import type { GhPort, PrInfo, PrState } from '@main/05_Loop/ports'
import type { TempRepos } from './tempGit'

interface BarePr { number: number; head: string; base: string; state: PrState; mergedHead: string | null; mergeCommit: string | null }

export class BareGh implements GhPort {
  readonly calls: string[] = []
  readonly prs: BarePr[] = []
  // PR 머리 브랜치 → 본문(goal PR 본문의 검증 줄)
  readonly bodies = new Map<string, string>()
  constructor(private readonly repos: TempRepos) {}
  tip(branch: string): string | null {
    try { return this.repos.bare(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) || null } catch { return null }
  }
  private contains(base: string, sha: string): boolean {
    try { this.repos.bare(['merge-base', '--is-ancestor', sha, base]); return true } catch { return false }
  }
  private view(pr: BarePr): PrInfo {
    const head = pr.mergedHead ?? this.tip(pr.head) ?? ''
    const base = this.tip(pr.base)
    if (pr.state === 'open' && head && base && this.contains(base, head)) {
      pr.state = 'merged'
      pr.mergedHead = head
      pr.mergeCommit = base
    }
    return { number: pr.number, state: pr.state, headSha: head, mergeCommitSha: pr.mergeCommit }
  }
  async findPr(head: string, base: string): Promise<PrInfo | null> {
    this.calls.push(`findPr ${head}`)
    const pr = [...this.prs].reverse().find((p) => p.head === head && p.base === base)
    return pr ? this.view(pr) : null
  }
  async getPr(number: number): Promise<PrInfo | null> {
    const pr = this.prs.find((p) => p.number === number)
    return pr ? this.view(pr) : null
  }
  async createPr(req: { head: string; base: string; body?: string }): Promise<PrInfo> {
    this.calls.push(`createPr ${req.head} ${req.base}`)
    if (!this.tip(req.head)) throw new Error(`원격에 ${req.head}가 없다`)
    if (req.body !== undefined) this.bodies.set(req.head, req.body)
    const pr: BarePr = { number: this.prs.length + 1, head: req.head, base: req.base, state: 'open', mergedHead: null, mergeCommit: null }
    this.prs.push(pr)
    return this.view(pr)
  }
  async openPrHeads(base: string): Promise<{ number: number; head: string }[]> {
    this.calls.push(`openPrHeads ${base}`)
    return this.prs.filter((p) => p.base === base && this.view(p).state === 'open').map((p) => ({ number: p.number, head: p.head }))
  }
  // 앞으로 몇 번의 CI 조회를 「도는 중」으로 돌려줄지(구동자의 CI 재시도)
  ciPending = 0
  ciPolls = 0
  async ciStatus(number: number): Promise<CiStatus> {
    this.ciPolls++
    const pr = this.prs.find((p) => p.number === number)
    const headSha = (pr && this.tip(pr.head)) ?? ''
    if (this.ciPending > 0) {
      this.ciPending--
      return { state: 'pending', headSha, summary: 'hard-gates PENDING' }
    }
    return { state: 'success', headSha, summary: 'hard-gates SUCCESS' }
  }
  // 사람이 GitHub에서 마일스톤 PR을 병합한 것 — 원격 base를 PR 머리로 옮긴다(fast-forward).
  mergeByHuman(number: number): void {
    const pr = this.prs.find((p) => p.number === number)
    const head = pr && this.tip(pr.head)
    if (!pr || !head) throw new Error(`병합할 PR ${number}이 없다`)
    this.repos.bare(['update-ref', `refs/heads/${pr.base}`, head])
  }
}
