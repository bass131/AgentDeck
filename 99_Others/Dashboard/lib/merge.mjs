// 현황판 병합 모듈 — PR을 GitHub에서 직접 읽고, 사람 확인 창의 「병합」 뒤에만 비동기 병합 API를 부른다.
// 앱 쪽 같은 로직(02_Project/00_Source/main/08_Git/prMerge.ts)을 빌드 없는 .mjs로 옮겼다. 두 구현은 모듈을 나눠 쓰지 않고,
// 같은 응답 꼴을 지키는지는 test/merge.test.mjs의 사례 표(prMerge.test.ts에서 옮김)로 맞춘다.
//
// gh는 셸 없이 인자 배열로 부른다(주입 가능). 저장소는 설정 repoPath의 `git remote get-url origin`이다(고정 인자 하나, lib/git.mjs의 읽기 전용 목록과 별개).
// 실측(2026-11-18, 읽기 전용 gh api):
//   `gh api` 실패 — exit 1, stdout에 오류 본문 JSON({message, documentation_url, status:"404"}), stderr `gh: Not Found (HTTP 404)`.
//   `gh api -i` — 첫 줄 `HTTP/2.0 404 Not Found`, 머리글 뒤 빈 줄 다음이 본문.
//   PR 파일 목록 — [{filename, status, previous_filename?, patch?, blob_url, changes}]. 이름만 바뀐 파일과 큰 diff는 patch 칸이 없다.
//   contents — {type:"file", encoding:"base64", content: 60자마다 줄바꿈}. 1MB를 넘으면 encoding "none".
//   필수 검사 — 보호 API `checks:[{context:"hard-gates", app_id:15368}]`, check run `app.id: 15368`.
// 병합 길: readPr(마지막으로 보인 SHA 기억) → prepareMerge(SHA 소비·다시 읽기·대조) → 사람 확인(정확히 {answer:'yes'}) → sendMerge(다시 읽기·PUT·결과 조회).
// 열린 PR 목록 listPrs는 이 길 밖의 읽기다. 고른 PR은 다시 readPr로 읽어야 병합 길에 들어간다.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const FILES_PER_PAGE = 100;
// GitHub의 PR 파일 목록은 3000개에서 끊긴다. 거기 닿으면 「꼭 볼 것」을 다 판정했다고 할 수 없어 막는다.
export const FILES_CAP = 3000;

export function parseGithubRepo(url) {
  const m = /^(?:https?:\/\/(?:[^@/\s]+@)?github\.com(?::\d+)?\/|ssh:\/\/(?:[^@/\s]+@)?github\.com(?::\d+)?\/|[^@/\s]+@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(String(url ?? '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}
export const maskCredentials = msg => String(msg ?? '').replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1***@');
const isPrNumber = n => typeof n === 'number' && Number.isInteger(n) && n > 0;
const isSha = s => typeof s === 'string' && /^[0-9a-f]{40}$/i.test(s);
const rec = v => (v && typeof v === 'object' ? v : {});
const str = v => (typeof v === 'string' ? v : '');
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const messageOf = body => str(rec(body).message);

// `-i` 없는 호출: 성공이면 200, 실패면 stderr의 `(HTTP n)` 또는 본문의 status 칸
function parsePlain(r) {
  const body = parseJson(r.stdout);
  if (r.code === 0) return { status: 200, body, message: '' };
  const fromErr = /\(HTTP (\d{3})\)/.exec(r.stderr);
  const fromBody = Number(rec(body).status);
  return { status: fromErr ? Number(fromErr[1]) : Number.isFinite(fromBody) && fromBody > 0 ? fromBody : null, body, message: messageOf(body) || String(r.stderr ?? '').trim() };
}
// `-i` 호출: 첫 줄의 상태 번호와 빈 줄 뒤 본문
function parseIncluded(r) {
  const head = /^HTTP\/[\d.]+ (\d{3})/.exec(r.stdout);
  if (!head) return { status: null, body: null, message: String(r.stderr ?? '').trim() || 'gh 응답을 읽지 못했어요' };
  const sep = /\r?\n\r?\n/.exec(r.stdout);
  const body = sep ? parseJson(r.stdout.slice(sep.index + sep[0].length)) : null;
  return { status: Number(head[1]), body, message: messageOf(body) };
}

// 「꼭 볼 것」 경로 — 대소문자를 가리지 않는다(작업 사본이 Windows라 `.Claude/`도 `.claude/`에 풀린다). 헌법 파일은 어느 깊이든 본다.
const MUST_SEE = [
  [p => p === '.claude' || p.startsWith('.claude/'), '하네스 설정·훅(.claude/)'],
  [p => p.split('/').pop() === 'claude.md', '헌법(CLAUDE.md)'],
  [p => p.split('/').pop() === 'agents.md', '헌법(AGENTS.md)'],
  [p => p.startsWith('98_management/01_gatestate/'), '게이트 상태(98_Management/01_GateState/)'],
  [p => p.startsWith('.github/workflows/'), 'CI 작업 흐름(.github/workflows/)'],
];
export function mustSeeWhy(path) {
  const p = String(path ?? '').toLowerCase();
  for (const [hit, why] of MUST_SEE) if (hit(p)) return why;
  return null;
}
// 이름은 대소문자를 가리지 않는다(작업 사본이 Windows라 Package.JSON도 package.json에 풀린다)
const isPackageJson = path => String(path ?? '').split('/').pop().toLowerCase() === 'package.json';
const diffUrl = (repo, n, path) => `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/pull/${n}/files#diff-${createHash('sha256').update(path).digest('hex')}`;
const contentsPath = path => path.split('/').map(encodeURIComponent).join('/');
// scripts 비교는 키 순서를 무시한다(순서만 바뀐 것은 같은 동작이다)
const sortKeys = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : Array.isArray(v) ? v.map(sortKeys) : v);

// 버튼 활성 판정 — 「꼭 볼 것」 펼침 게이트는 화면 쪽이라 여기서 막지 않는다. 파일 목록을 다 읽지 못한 것(filesError)은 막는다.
const CHECK_TEXT = { success: '성공', pending: '대기 중', failure: '실패', missing: '결과 없음' };
export function mergeEligibility(pr) {
  const reasons = [], notes = [];
  if (pr.merged) reasons.push('이미 병합된 PR이에요');
  else if (pr.state !== 'open') reasons.push('닫힌 PR이에요');
  if (pr.draft) reasons.push('초안 PR이에요');
  if (pr.mergeable === false) reasons.push('base와 충돌해 병합할 수 없어요');
  if (pr.requiredError) reasons.push(`필수 검사 목록을 읽지 못했어요 — ${pr.requiredError}`);
  if (pr.checksError) reasons.push(`검사 결과를 읽지 못했어요 — ${pr.checksError}`);
  if (pr.filesError) reasons.push(`바뀐 파일 목록을 다 읽지 못해 「꼭 볼 것」을 판정하지 못했어요 — ${pr.filesError}`);
  for (const c of pr.checks || []) if (c.result !== 'success') reasons.push(`필수 검사 ${c.name}: ${CHECK_TEXT[c.result] ?? c.result}`);
  if (!pr.protected && !pr.requiredError) notes.push(`${pr.baseRef} 브랜치에 보호가 없어 필수 검사가 없어요`);
  else if (pr.protected && !pr.requiredError && (pr.checks || []).length === 0) notes.push(`${pr.baseRef} 브랜치 보호에 필수 검사가 없어요`);
  return { canMerge: reasons.length === 0, reasons, notes };
}

// 보호 API 본문의 필수 검사. checks(context·app_id)를 우선하고 contexts에만 있는 이름은 앱 제한 없이 더한다. 모양이 이상하면 null(닫힌 실패).
function requiredOf(body) {
  const { checks, contexts } = rec(body);
  if (checks !== undefined && !Array.isArray(checks)) return null;
  if (contexts !== undefined && !Array.isArray(contexts)) return null;
  if (checks === undefined && contexts === undefined) return null;
  const out = [];
  for (const c of checks ?? []) {
    const name = str(rec(c).context);
    if (!name) return null;
    const app = rec(c).app_id;
    out.push({ name, appId: typeof app === 'number' && app !== -1 ? app : null });
  }
  for (const c of contexts ?? []) {
    if (typeof c !== 'string') return null;
    if (!out.some(r => r.name === c)) out.push({ name: c, appId: null });
  }
  return out;
}
// 한 필수 검사의 결과 — 실패 > 대기 > 성공 > 없음. 앱이 정해진 검사는 그 앱의 check run만 본다(같은 이름의 commit status는 보지 않는다).
function checkResult(req, runs, statuses) {
  const seen = new Set();
  for (const r of runs) {
    if (r.name !== req.name || (req.appId !== null && r.appId !== req.appId)) continue;
    seen.add(r.status !== 'completed' ? 'pending' : r.conclusion === 'success' ? 'success' : 'failure');
  }
  if (req.appId === null) for (const s of statuses) if (s.context === req.name) seen.add(s.state === 'success' ? 'success' : s.state === 'pending' ? 'pending' : 'failure');
  for (const want of ['failure', 'pending', 'success']) if (seen.has(want)) return want;
  return 'missing';
}
// 409가 돌려준 대기 요청을 이어받아도 되는가 — 우리가 보낼 것과 같은 옵션일 때만. 다른 칸 이름을 돌려준다.
function pendingMismatch(p) {
  const bad = [];
  if (p.bypass_rules === true) bad.push('bypass_rules');
  if (p.merge_method !== undefined && p.merge_method !== 'merge') bad.push('merge_method');
  if (p.merge_action !== undefined && p.merge_action !== 'direct_merge') bad.push('merge_action');
  return bad;
}
const UNKNOWN = Object.freeze({ status: 'unknown', message: '결과 모름 — 다시 읽기로 확인하세요' });
const CHANGED = Object.freeze({ status: 'refused', message: 'PR이 바뀌었어요 — 다시 읽어 주세요' });

export function createPrService({ gh, originUrl, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(), pollIntervalMs = 2000, pollTimeoutMs = 90000 }) {
  // 마지막으로 읽어 보인 PR — (저장소, 번호)마다. 확인 창은 이 값만 보인다(요청 본문의 글은 쓰지 않는다).
  const shown = new Map();
  // 세대 — 병합 준비가 SHA를 쓰면 올린다. 그 전에 시작한 읽기가 늦게 끝나도 SHA를 다시 무장하지 않는다.
  const generation = new Map();
  // 확인 뒤 보내기 표 — 이 서비스가 만든 것만, 한 번만 쓴다.
  const issued = new WeakSet();
  const keyOf = (r, n) => `${r.owner}/${r.repo}#${n}`.toLowerCase();
  const originRepo = async cwd => { const url = await Promise.resolve().then(() => originUrl(cwd)).catch(() => null); return url ? parseGithubRepo(url) : null; };
  const api = async (cwd, path) => parsePlain(await gh(['api', path], cwd));

  async function readFiles(cwd, base, n, expected) {
    const files = [];
    for (let page = 1; page <= FILES_CAP / FILES_PER_PAGE; page++) {
      const r = await api(cwd, `${base}/pulls/${n}/files?per_page=${FILES_PER_PAGE}&page=${page}`);
      if (r.status !== 200 || !Array.isArray(r.body)) return { files, error: `${page}쪽 읽기 실패 (HTTP ${r.status ?? '?'}) ${maskCredentials(r.message)}`.trim() };
      files.push(...r.body);
      if (r.body.length < FILES_PER_PAGE) break;
    }
    if (files.length >= FILES_CAP) return { files, error: `파일이 ${FILES_CAP}개 이상이라 GitHub가 목록을 끝까지 주지 않아요` };
    if (typeof expected === 'number' && files.length !== expected) return { files, error: `읽은 파일 ${files.length}개가 PR의 바뀐 파일 수 ${expected}개와 달라요 — 다시 읽어 주세요` };
    return { files, error: null };
  }
  // package.json 한쪽의 scripts. 없는 쪽(새 파일의 base, 지운 파일의 head)은 undefined, 읽기·해석 실패는 던진다.
  async function scriptsAt(cwd, base, path, ref) {
    const r = await api(cwd, `${base}/contents/${contentsPath(path)}?ref=${ref}`);
    if (r.status !== 200) throw new Error(`${path}@${ref.slice(0, 7)} 읽기 실패 (HTTP ${r.status ?? '?'})`);
    const b = rec(r.body);
    if (Array.isArray(r.body) || b.type !== 'file' || b.encoding !== 'base64' || typeof b.content !== 'string') throw new Error(`${path}@${ref.slice(0, 7)}가 읽을 수 있는 파일이 아니에요(큰 파일이거나 폴더)`);
    let text = Buffer.from(b.content, 'base64').toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const json = parseJson(text);
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(`${path}@${ref.slice(0, 7)}의 JSON을 읽지 못했어요`);
    return json.scripts;
  }
  async function packageWhy(cwd, base, f, baseSha, headSha) {
    // 이름 바꾸기·복사가 package.json 이름에 닿으면 비교하지 않고 「꼭 볼 것」이다 — 같은 scripts가 새 자리에 생겨도 새 파일과 같은 뜻이라서(닫힌 쪽)
    if (f.previousPath || f.status === 'renamed' || f.status === 'copied') return 'package.json의 이름 바꾸기·복사예요 — scripts를 직접 보세요';
    try {
      const before = f.status === 'added' ? undefined : await scriptsAt(cwd, base, f.previousPath ?? f.path, baseSha);
      const after = f.status === 'removed' ? undefined : await scriptsAt(cwd, base, f.path, headSha);
      return isDeepStrictEqual(sortKeys(before), sortKeys(after)) ? null : 'package.json의 scripts가 바뀌었어요';
    } catch (e) { return `package.json의 scripts를 비교하지 못했어요 — ${maskCredentials(e.message)}`; }
  }

  async function readPr(cwd, req) {
    const number = req?.number;
    if (!isPrNumber(number)) return { ok: false, error: 'PR 번호는 양의 정수여야 해요' };
    const repo = await originRepo(cwd);
    if (!repo) return { ok: false, error: '저장소의 origin이 GitHub 저장소가 아니에요' };
    const key = keyOf(repo, number), gen = generation.get(key) ?? 0, base = `repos/${repo.owner}/${repo.repo}`;
    const prRes = await api(cwd, `${base}/pulls/${number}`);
    if (prRes.status !== 200) return { ok: false, error: `PR #${number}을 읽지 못했어요 (HTTP ${prRes.status ?? '?'}) ${maskCredentials(prRes.message)}`.trim() };
    const p = rec(prRes.body), head = rec(p.head), headSha = str(head.sha), baseSha = str(rec(p.base).sha);
    if (!isSha(headSha)) return { ok: false, error: 'PR의 머리 SHA를 읽지 못했어요' };
    const view = { owner: repo.owner, repo: repo.repo, number, title: str(p.title), url: str(p.html_url), state: p.state === 'open' ? 'open' : 'closed',
      draft: p.draft === true, merged: p.merged === true, mergeable: typeof p.mergeable === 'boolean' ? p.mergeable : null,
      baseRef: str(rec(p.base).ref), baseSha, headRef: str(head.ref), headSha, protected: true, checks: [], files: 0, mustSee: [], canMerge: false, reasons: [], notes: [] };

    // 필수 검사 — 「Branch not protected」 404만 보호 없음, 「Required status checks not enabled」 404는 보호는 있되 필수 검사 없음.
    // 나머지 실패(권한 없는 토큰의 `Not Found` 포함)와 이상한 목록 모양은 닫힌 실패다.
    const prot = await api(cwd, `${base}/branches/${encodeURIComponent(view.baseRef)}/protection/required_status_checks`);
    let required = [];
    if (prot.status === 200) { const r = requiredOf(prot.body); if (r) required = r; else view.requiredError = '보호 설정의 필수 검사 목록 모양을 읽지 못했어요'; }
    else if (prot.status === 404 && /branch not protected/i.test(prot.message)) view.protected = false;
    else if (prot.status === 404 && /required status checks not enabled/i.test(prot.message)) required = [];
    else view.requiredError = `보호 설정 읽기 실패 (HTTP ${prot.status ?? '?'}) ${maskCredentials(prot.message)}`.trim();
    if (required.length > 0) {
      const [runsRes, statusRes] = await Promise.all([api(cwd, `${base}/commits/${headSha}/check-runs?per_page=100`), api(cwd, `${base}/commits/${headSha}/status`)]);
      if (runsRes.status !== 200 || statusRes.status !== 200) { const bad = runsRes.status !== 200 ? runsRes : statusRes; view.checksError = `HTTP ${bad.status ?? '?'} ${maskCredentials(bad.message)}`.trim(); }
      const runsRaw = rec(runsRes.body).check_runs, stRaw = rec(statusRes.body).statuses;
      const runs = (Array.isArray(runsRaw) ? runsRaw : []).map(r => { const app = rec(rec(r).app).id; return { name: str(rec(r).name), status: str(rec(r).status), conclusion: str(rec(r).conclusion), appId: typeof app === 'number' ? app : null }; });
      const statuses = (Array.isArray(stRaw) ? stRaw : []).map(s => ({ context: str(rec(s).context), state: str(rec(s).state) }));
      view.checks = required.map(r => ({ name: r.name, result: checkResult(r, runs, statuses) }));
    }

    // 「꼭 볼 것」 — 이름 바꾸기는 옛 경로도 본다. package.json은 base·head 두 SHA의 scripts 객체를 비교한다. patch는 꼭 볼 것만 화면에 보낸다.
    const { files, error } = await readFiles(cwd, base, number, typeof p.changed_files === 'number' ? p.changed_files : undefined);
    view.files = files.length;
    if (error) view.filesError = error;
    for (const raw of files) {
      const f = { path: str(rec(raw).filename), previousPath: str(rec(raw).previous_filename) || undefined, status: str(rec(raw).status) };
      if (!f.path) continue;
      const own = mustSeeWhy(f.path), old = f.previousPath ? mustSeeWhy(f.previousPath) : null;
      let why = own ?? (old ? `${old} — 옛 경로 ${f.previousPath}` : null);
      if (!why && (isPackageJson(f.path) || isPackageJson(f.previousPath))) why = await packageWhy(cwd, base, f, baseSha, headSha);
      if (!why) continue;
      const entry = { path: f.path, why, patch: typeof raw.patch === 'string' ? raw.patch : null, diffUrl: diffUrl(repo, number, f.path) };
      if (f.previousPath) entry.previousPath = f.previousPath;
      view.mustSee.push(entry);
    }

    Object.assign(view, mergeEligibility(view));
    if ((generation.get(key) ?? 0) === gen) shown.set(key, { sha: headSha, baseRef: view.baseRef, headRef: view.headRef, title: view.title, canMerge: view.canMerge, mustSee: view.mustSee.map(m => m.path) });
    return { ok: true, pr: view };
  }

  // 대조: 머리 SHA·base·열림·미병합이 보인 값과 같은가
  async function stillSame(cwd, base, number, sha, baseRef) {
    const r = await api(cwd, `${base}/pulls/${number}`);
    if (r.status !== 200) return { status: 'refused', message: `병합 직전에 PR을 다시 읽지 못했어요 (HTTP ${r.status ?? '?'}) — 다시 읽어 주세요` };
    const p = rec(r.body);
    if (str(rec(p.head).sha).toLowerCase() !== sha.toLowerCase() || str(rec(p.base).ref) !== baseRef || p.state !== 'open' || p.merged === true) return CHANGED;
    return null;
  }

  // 병합 준비: 마지막으로 보인 SHA만 받고, 쓰는 순간 소비한다. PR을 다시 읽어 대조한 뒤 확인 창에 보일 값과 보내기 표를 준다.
  async function prepareMerge(cwd, number, sha) {
    if (!isPrNumber(number) || !isSha(sha)) return { ok: false, result: { status: 'refused', message: 'PR 번호나 머리 SHA 꼴이 올바르지 않아요' } };
    const repo = await originRepo(cwd);
    if (!repo) return { ok: false, result: { status: 'refused', message: '저장소의 origin이 GitHub 저장소가 아니에요' } };
    const key = keyOf(repo, number), last = shown.get(key);
    if (!last || last.sha.toLowerCase() !== sha.toLowerCase()) return { ok: false, result: { status: 'refused', message: '화면의 머리 SHA가 마지막으로 읽은 값과 달라요 — 다시 읽은 뒤 병합하세요' } };
    if (!last.canMerge) return { ok: false, result: { status: 'refused', message: '마지막으로 읽은 PR이 병합 조건을 채우지 못했어요 — 다시 읽기로 확인하세요' } };
    shown.delete(key);
    generation.set(key, (generation.get(key) ?? 0) + 1);
    const base = `repos/${repo.owner}/${repo.repo}`;
    const changed = await stillSame(cwd, base, number, sha, last.baseRef);
    if (changed) return { ok: false, result: changed };
    // 표는 여기서 만들기만 한다. 무장(issued)은 mergePr가 확인 결과가 정확히 yes일 때만 한다 — 준비만 한 표로는 보내지 못한다
    const ticket = Object.freeze({ cwd, repo: `${repo.owner}/${repo.repo}`, base, number, sha: last.sha, baseRef: last.baseRef });
    return { ok: true, ticket, view: { repo: `${repo.owner}/${repo.repo}`, number, title: last.title, baseRef: last.baseRef, headRef: last.headRef, sha: last.sha, mustSee: [...last.mustSee] } };
  }

  function finalOf(b) {
    const d = rec(b.details);
    switch (b.status) {
      case 'merged': { const out = { status: 'merged', message: str(d.message) || '병합했어요' }; if (str(d.sha)) out.mergeSha = str(d.sha); return out; }
      case 'enqueued': return { status: 'enqueued', message: str(d.message) || '병합 큐에 들어갔어요' };
      case 'failed': return { status: 'failed', message: str(d.message) || '병합에 실패했어요' };
      default: return null;
    }
  }
  async function poll(cwd, path) {
    const deadline = now() + pollTimeoutMs;
    while (now() < deadline) {
      await sleep(pollIntervalMs);
      const r = parseIncluded(await gh(['api', '-i', path], cwd));
      if (r.status === 404) return { status: 'failed', message: '병합 결과를 찾지 못했어요(만료됐을 수 있어요) — 다시 읽기로 확인하세요' };
      if (r.status !== 200) continue;
      const out = finalOf(rec(r.body));
      if (out) return out;
    }
    return { status: 'timeout', message: '결과 대기 시간 초과 — 다시 읽기로 확인하세요' };
  }

  // 보내기: 표는 한 번만 쓴다. PUT 바로 앞에서 PR을 한 번 더 읽어 대조한다(확인 창이 떠 있는 동안 바뀌었을 수 있다).
  async function sendMerge(ticket) {
    if (!ticket || !issued.has(ticket)) return { status: 'refused', message: '확인을 거친 병합 요청이 아니에요 — 다시 읽은 뒤 병합하세요' };
    issued.delete(ticket);
    const { cwd, base, number, sha, baseRef } = ticket;
    const changed = await stillSame(cwd, base, number, sha, baseRef);
    if (changed) return changed;
    const path = `${base}/pulls/${number}/merge-async`;
    const r = parseIncluded(await gh(['api', '-i', '-X', 'PUT', path, '-f', `sha=${sha}`, '-f', 'merge_method=merge', '-f', 'merge_action=direct_merge', '-F', 'bypass_rules=false'], cwd));
    // 보낸 뒤 HTTP 상태 없이 끝났다(시간 초과·네트워크) — 서버가 받았는지 알 수 없다
    if (r.status === null) return { ...UNKNOWN };
    const b = rec(r.body), d = rec(b.details), detail = r.message ? ` — ${maskCredentials(r.message)}` : '';
    switch (r.status) {
      case 202:
        if (str(d.expected_head_sha).toLowerCase() !== sha.toLowerCase() || !str(d.uuid)) return { status: 'failed', message: '서버가 받은 머리 SHA가 보낸 값과 달라요 — 다시 읽기로 확인하세요' };
        return poll(cwd, `${path}/${str(d.uuid)}`);
      case 200: return finalOf(b) ?? { status: 'failed', message: '병합 응답을 읽지 못했어요' };
      case 409: {
        const pending = Object.keys(d).length > 0 ? d : b;
        if (str(pending.expected_head_sha).toLowerCase() !== sha.toLowerCase() || !str(pending.uuid)) return { status: 'refused', message: `이미 다른 머리 SHA로 대기 중인 병합 요청이 있어요${detail}` };
        const bad = pendingMismatch(pending);
        if (bad.length > 0) return { status: 'refused', message: `이미 대기 중인 병합 요청의 옵션이 달라요(${bad.join(', ')}) — GitHub에서 확인하세요` };
        return poll(cwd, `${path}/${str(pending.uuid)}`);
      }
      case 400: return { status: 'refused', message: `PR이 병합할 수 없는 상태예요(닫힘 등)${detail}` };
      case 403: return { status: 'refused', message: `병합 권한이 없어요${detail}` };
      case 404: return { status: 'refused', message: `PR을 찾지 못했어요${detail}` };
      case 422: return { status: 'refused', message: `요청이 검증에 실패했어요${detail}` };
      default: return { status: 'failed', message: `병합 요청 실패 (HTTP ${r.status})${detail}` };
    }
  }

  // 준비 → 사람 확인 → 보내기. 확인 결과가 정확히 { answer: 'yes' }가 아니면(던짐 포함) 보내지 않는다. 쓴 SHA는 어느 경우든 다시 읽어야 열린다.
  async function mergePr(cwd, number, sha, { confirm, send = sendMerge } = {}) {
    const prep = await prepareMerge(cwd, number, sha);
    if (!prep.ok) return prep.result;
    try {
      let answer = null;
      try { answer = typeof confirm === 'function' ? await confirm(prep.view) : null; } catch { answer = null; }
      if (!answer || typeof answer !== 'object' || answer.answer !== 'yes') {
        const reason = answer && typeof answer.reason === 'string' && answer.reason ? ` (${answer.reason})` : '';
        return { status: 'cancelled', message: `확인 창에서 병합하지 않았어요${reason}. 다시 하려면 다시 읽기를 눌러 주세요` };
      }
      issued.add(prep.ticket);
      return await send(prep.ticket);
    } finally { issued.delete(prep.ticket); }
  }

  // 열린 PR 목록 — 읽기만 한다. 보인 SHA(shown)·세대(generation)·보내기 표(issued)를 건드리지 않는다.
  // 목록의 SHA는 화면 표시용이다. 병합에 쓰는 SHA는 언제나 readPr가 다시 읽은 값이다.
  async function listPrs(cwd) {
    const repo = await originRepo(cwd);
    if (!repo) return { ok: false, reason: '저장소의 origin이 GitHub 저장소가 아니에요' };
    let r;
    try { r = await gh(listArgs(repo), cwd); } catch (e) { return { ok: false, reason: `열린 PR 목록을 읽지 못했어요 — ${cleanReason(e?.message)}` }; }
    if (!r || r.code !== 0) return { ok: false, reason: `열린 PR 목록을 읽지 못했어요 — ${cleanReason(r?.stderr)}` };
    const raw = parseJson(r.stdout);
    if (!Array.isArray(raw)) return { ok: false, reason: '열린 PR 목록 응답을 읽지 못했어요' };
    const items = [];
    let dropped = 0;
    for (const v of raw.slice(0, LIST_CAP)) { const it = listItem(v); if (it) items.push(it); else dropped++; }
    /* gh는 최신부터 준다. 상한은 최신 50개에 걸고, 보이는 순서는 번호 오름차순(먼저 연 PR부터 차례로 병합) */
    items.sort((a, b) => a.number - b.number);
    return { ok: true, repo: `${repo.owner}/${repo.repo}`, items, more: raw.length > LIST_CAP, dropped };
  }

  return { readPr, prepareMerge, sendMerge, mergePr, listPrs };
}

// 열린 PR 목록 — gh pr list를 셸 없이 부른다. 저장소는 origin으로 고정한다(cwd·GH_REPO·기본 저장소 설정에 기대지 않는다).
// 실측(2026-11-18, 읽기 전용): 성공은 exit 0과 JSON 배열(없으면 `[]`), 항목은 {author:{id,is_bot,login,name}, baseRefName, headRefName, headRefOid, isDraft, number, title, updatedAt}.
//   봇 작성자는 {is_bot:true, login:"app/dependabot"}. 실패는 exit 1과 stderr 평문(`GraphQL: Could not resolve to a Repository …`)이라 parsePlain을 쓰지 않는다.
// REST(`gh api …/pulls`) 대신 이 명령을 쓴 까닭: 칸 이름을 --json으로 좁혀 한 번에 받고, 병합 감시(lib/waitMerge.mjs)와 같은 gh pr 꼴이다.
export const LIST_CAP = 50;
export const LIST_FIELDS = 'number,title,baseRefName,headRefName,headRefOid,isDraft,author,updatedAt';
// 하나 더(51개) 받아 「더 있음」을 안다
export const listArgs = repo => ['pr', 'list', '--repo', `${repo.owner}/${repo.repo}`, '--state', 'open', '--json', LIST_FIELDS, '--limit', String(LIST_CAP + 1)];
const cleanReason = s => maskCredentials(String(s ?? '')).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || '알 수 없는 오류';
const isLogin = v => typeof v === 'string' && /^(?:app\/)?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/.test(v);
const isIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v);
// 남이 정한 값이다. 번호·SHA가 꼴에 맞지 않으면 항목을 빼고(센다), 나머지 칸은 꼴이 맞지 않으면 비운다.
function listItem(v) {
  const p = rec(v);
  if (Array.isArray(v) || !isPrNumber(p.number) || p.number > 1e9 || !isSha(p.headRefOid)) return null;
  const login = rec(p.author).login;
  return { number: p.number, title: str(p.title), baseRef: str(p.baseRefName), headRef: str(p.headRefName), sha: p.headRefOid,
    draft: p.isDraft === true, author: isLogin(login) ? login : '', updatedAt: isIso(p.updatedAt) ? p.updatedAt : '' };
}

// 실행 배선 — 셸 없이 인자 배열로, 대화형 질문 없이.
function run(cmd, args, cwd, timeout) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true, shell: false, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') || (err ? err.message : '') }));
  });
}
export const ghRunner = (args, cwd) => run('gh', args, cwd, 60000);
export async function gitOriginUrl(cwd) {
  const r = await run('git', ['remote', 'get-url', 'origin'], cwd, 10000);
  return r.code === 0 ? r.stdout.trim() || null : null;
}
