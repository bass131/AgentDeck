// M07 G9 병합 모듈(lib/merge.mjs) — 주입한 gh 실행기로 PR 읽기, 「꼭 볼 것」 판정, 버튼 활성 판정, 확인 뒤 비동기 병합 API 호출을 고정한다.
// 사례 표는 앱 쪽 02_Project/01_TestCode/main/08_Git/prMerge.test.ts(G8, 검수 반영)를 옮겼다. 두 구현이 같은 응답 꼴을 지키는지는 이 표로 맞춰 본다.
// 실제 병합 API는 부르지 않는다. 응답 꼴은 `gh api` 실측(실패면 exit 1, stdout에 오류 본문 JSON, stderr `gh: <message> (HTTP n)`,
// `-i`면 첫 줄 `HTTP/2.0 404 Not Found`)과 contents API 실측(type file, encoding base64, 60자마다 줄바꿈)을 따른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrService, mergeEligibility, parseGithubRepo, mustSeeWhy, FILES_CAP, LIST_CAP, LIST_FIELDS, listArgs } from '../lib/merge.mjs';

const SHA = 'f4e0ff3812cde4caf1585a73ac77d3f9836bc2dd';
const OTHER = '0123456789abcdef0123456789abcdef01234567';
const BASE = 'aaaef0e4f0f2baaa8afb2bae47673539a6b5a39a';
const CWD = 'C:\\Dev\\AgentDeck';
const APP = 15368;

const ok = body => ({ code: 0, stdout: JSON.stringify(body), stderr: '' });
const http = (status, body) => ({
  code: status >= 200 && status < 300 ? 0 : 1,
  stdout: `HTTP/2.0 ${status} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}`,
  stderr: status >= 300 ? `gh: ${body.message ?? 'err'} (HTTP ${status})` : '',
});
const fail = (status, message) => ({ code: 1, stdout: JSON.stringify({ message, status: String(status) }), stderr: `gh: ${message} (HTTP ${status})` });
const b64 = text => Buffer.from(text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');
const content = obj => ok({ type: 'file', encoding: 'base64', name: 'package.json', content: b64(JSON.stringify(obj, null, 2)) });

function fakeGh(f) {
  return async args => {
    f.calls.push(args);
    const joined = args.join(' ');
    for (const [re, res] of f.routes) {
      if (re.test(joined)) {
        const r = Array.isArray(res) ? (res.length > 1 ? res.shift() : res[0]) : res;
        return typeof r === 'function' ? r(joined) : r;
      }
    }
    throw new Error('예상 밖 gh 호출: ' + joined);
  };
}

const prBody = (over = {}) => ({
  number: 12, title: 'G9 병합 버튼', html_url: 'https://github.com/bass131/AgentDeck/pull/12', state: 'open', draft: false, merged: false, mergeable: true,
  base: { ref: 'master', sha: BASE }, head: { ref: 'feat/x', sha: SHA }, changed_files: 1, ...over,
});
const file = (filename, over = {}) => ({ filename, status: 'modified', additions: 1, deletions: 1, changes: 2, patch: '@@ -1 +1 @@\n-a\n+b', blob_url: `https://github.com/bass131/AgentDeck/blob/${SHA}/${filename}`, ...over });
const protectedBy = appId => ok({ contexts: ['hard-gates'], checks: [{ context: 'hard-gates', app_id: appId }] });
const PR_GET = /^api repos\/bass131\/AgentDeck\/pulls\/12$/;
const FILES = /^api repos\/bass131\/AgentDeck\/pulls\/12\/files\?per_page=100&page=(\d+)$/;

function setup(opts = {}) {
  const runs = (opts.runs ?? [{ name: 'hard-gates', status: 'completed', conclusion: 'success' }]).map(r => ({ app: { id: APP }, ...r }));
  const files = opts.files ?? [file('README.md')];
  const f = { calls: [], routes: [
    ...(opts.extra ?? []),
    [PR_GET, ok(prBody({ changed_files: files.length, ...opts.pr }))],
    [/protection\/required_status_checks$/, opts.protection ?? protectedBy(APP)],
    [/check-runs/, ok({ total_count: runs.length, check_runs: runs })],
    [/\/status$/, ok({ state: 'pending', statuses: opts.statuses ?? [] })],
    [FILES, joined => { const page = Number(FILES.exec(joined)[1]); return ok(files.slice((page - 1) * 100, page * 100)); }],
  ] };
  let clock = 0;
  const sleeps = [];
  const svc = createPrService({
    gh: fakeGh(f),
    originUrl: async () => (opts.origin === undefined ? 'https://github.com/bass131/AgentDeck.git' : opts.origin),
    sleep: async ms => { sleeps.push(ms); clock += ms; },
    now: () => clock,
    pollIntervalMs: 2000,
    pollTimeoutMs: opts.pollTimeoutMs ?? 90000,
  });
  return { f, svc, sleeps };
}
const read = async (svc, n = 12) => { const r = await svc.readPr(CWD, { number: n }); if (!r.ok) throw new Error('읽기 실패: ' + r.error); return r.pr; };
const yes = async () => ({ answer: 'yes' });
const joinedCalls = f => f.calls.map(a => a.join(' '));

// ── origin ──
test('origin: https, ssh and credential-bearing GitHub URLs give owner/repo; others are null', () => {
  assert.deepEqual(parseGithubRepo('https://github.com/bass131/AgentDeck.git'), { owner: 'bass131', repo: 'AgentDeck' });
  assert.deepEqual(parseGithubRepo('https://github.com/bass131/AgentDeck'), { owner: 'bass131', repo: 'AgentDeck' });
  assert.deepEqual(parseGithubRepo('https://x:tok@github.com/bass131/AgentDeck.git'), { owner: 'bass131', repo: 'AgentDeck' });
  assert.deepEqual(parseGithubRepo('git@github.com:bass131/AgentDeck.git'), { owner: 'bass131', repo: 'AgentDeck' });
  assert.deepEqual(parseGithubRepo('ssh://git@github.com/bass131/AgentDeck.git'), { owner: 'bass131', repo: 'AgentDeck' });
  assert.equal(parseGithubRepo('https://gitlab.com/bass131/AgentDeck.git'), null);
  assert.equal(parseGithubRepo('https://github.com.evil.io/bass131/AgentDeck.git'), null);
});

// ── PR 읽기 ──
test('read: the card values come from GitHub; checks are read at the shown head SHA', async () => {
  const { svc, f } = setup();
  const pr = await read(svc);
  assert.equal(pr.number, 12); assert.equal(pr.title, 'G9 병합 버튼'); assert.equal(pr.baseRef, 'master'); assert.equal(pr.baseSha, BASE);
  assert.equal(pr.headRef, 'feat/x'); assert.equal(pr.headSha, SHA); assert.equal(pr.protected, true); assert.equal(pr.canMerge, true);
  assert.deepEqual(pr.checks, [{ name: 'hard-gates', result: 'success' }]);
  assert.deepEqual(pr.mustSee, []);
  assert.equal(pr.files, 1);
  assert.ok(joinedCalls(f).some(j => j.includes(`commits/${SHA}/check-runs`)));
});

test('read: a non-GitHub origin or a number that is not a positive integer never calls gh', async () => {
  const other = setup({ origin: 'https://gitlab.com/a/b.git' });
  assert.equal((await other.svc.readPr(CWD, { number: 12 })).ok, false);
  assert.equal(other.f.calls.length, 0);
  const { svc, f } = setup();
  for (const n of [0, -1, 1.5, NaN, '12', null]) assert.equal((await svc.readPr(CWD, { number: n })).ok, false, String(n));
  assert.equal(f.calls.length, 0);
});

test('read: 「Branch not protected」 404 means no required checks, with a note', async () => {
  const pr = await read(setup({ protection: fail(404, 'Branch not protected') }).svc);
  assert.equal(pr.protected, false); assert.deepEqual(pr.checks, []); assert.equal(pr.canMerge, true);
  assert.match(pr.notes.join(' '), /보호/);
});

test('read: any other protection failure (including a token-blind 404) is a closed failure', async () => {
  for (const p of [fail(404, 'Not Found'), fail(403, 'Resource not accessible'), { code: 1, stdout: '', stderr: 'network' }]) {
    const pr = await read(setup({ protection: p }).svc);
    assert.ok(pr.requiredError); assert.equal(pr.canMerge, false);
  }
});

test('read: check results — run success, pending, failure, missing, and commit statuses for an any-app check', async () => {
  const anyApp = protectedBy(null);
  const cases = [
    [{ runs: [{ name: 'hard-gates', status: 'in_progress', conclusion: null }] }, 'pending'],
    [{ runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'failure' }] }, 'failure'],
    [{ runs: [{ name: 'other', status: 'completed', conclusion: 'success' }] }, 'missing'],
    [{ protection: anyApp, runs: [], statuses: [{ context: 'hard-gates', state: 'success' }] }, 'success'],
    [{ protection: anyApp, runs: [], statuses: [{ context: 'hard-gates', state: 'pending' }] }, 'pending'],
    [{ protection: protectedBy(-1), runs: [], statuses: [{ context: 'hard-gates', state: 'success' }] }, 'success'],
    [{ runs: [{ name: 'hard-gates', status: 'queued', conclusion: null }, { name: 'hard-gates', status: 'completed', conclusion: 'failure' }] }, 'failure'],
  ];
  for (const [o, want] of cases) assert.equal((await read(setup(o).svc)).checks[0].result, want, JSON.stringify(o));
});

test('read: several matches close the gate — failure > pending > success > missing; an app-pinned check ignores statuses and other apps', async () => {
  const cases = [
    [{ runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'failure' }, { name: 'hard-gates', status: 'completed', conclusion: 'success' }] }, 'failure'],
    [{ runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'success' }, { name: 'hard-gates', status: 'queued', conclusion: null }] }, 'pending'],
    [{ runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'failure' }], statuses: [{ context: 'hard-gates', state: 'success' }] }, 'failure'],
    [{ runs: [], statuses: [{ context: 'hard-gates', state: 'success' }] }, 'missing'],
    [{ runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'success', app: { id: 999 } }] }, 'missing'],
    [{ protection: protectedBy(null), runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'failure', app: { id: 999 } }], statuses: [{ context: 'hard-gates', state: 'success' }] }, 'failure'],
  ];
  for (const [o, want] of cases) {
    const pr = await read(setup(o).svc);
    assert.equal(pr.checks[0].result, want, JSON.stringify(o));
    assert.equal(pr.canMerge, false);
  }
});

test('read: the base name is encoded in the protection path', async () => {
  const { svc, f } = setup({ pr: { base: { ref: 'release/1.0', sha: BASE } } });
  await read(svc);
  assert.ok(joinedCalls(f).some(j => j.includes('branches/release%2F1.0/protection/required_status_checks')));
});

test('read: an odd protection body shape is a closed failure', async () => {
  for (const body of [{ contexts: 'hard-gates' }, { contexts: ['hard-gates'], checks: 'x' }, {}]) {
    const pr = await read(setup({ protection: ok(body) }).svc);
    assert.ok(pr.requiredError, JSON.stringify(body)); assert.equal(pr.canMerge, false);
  }
});

test('read: 「Required status checks not enabled」 404 is protected with no required checks — enabled, with a note', async () => {
  const pr = await read(setup({ protection: fail(404, 'Required status checks not enabled') }).svc);
  assert.equal(pr.protected, true); assert.deepEqual(pr.checks, []); assert.equal(pr.canMerge, true);
  assert.equal(pr.requiredError, undefined);
  assert.match(pr.notes.join(' '), /필수 검사/);
});

test('read: a PR that cannot be read is an error carrying the status number', async () => {
  const r = await setup({ extra: [[PR_GET, fail(404, 'Not Found')]] }).svc.readPr(CWD, { number: 12 });
  assert.equal(r.ok, false); assert.match(r.error, /404/);
});

// ── 버튼 활성 판정 ──
const view = (over = {}) => ({ owner: 'o', repo: 'r', number: 1, title: 't', state: 'open', draft: false, merged: false, mergeable: true,
  baseRef: 'master', headRef: 'x', headSha: SHA, protected: true, checks: [{ name: 'hard-gates', result: 'success' }], mustSee: [], ...over });

test('eligibility: open, not a draft, not merged, no conflict and every required check green enables the button', () => {
  assert.deepEqual(mergeEligibility(view()), { canMerge: true, reasons: [], notes: [] });
  assert.equal(mergeEligibility(view({ mergeable: null })).canMerge, true);
  assert.equal(mergeEligibility(view({ mustSee: [{ path: 'CLAUDE.md' }] })).canMerge, true, '「꼭 볼 것」은 서버가 막지 않는다 — 펼침 게이트는 화면 쪽이다');
});

test('eligibility: each closed condition disables the button with a reason', () => {
  for (const [name, over] of [['닫힘', { state: 'closed' }], ['초안', { draft: true }], ['병합됨', { merged: true, state: 'closed' }], ['충돌', { mergeable: false }],
    ['검사 대기', { checks: [{ name: 'hard-gates', result: 'pending' }] }], ['검사 실패', { checks: [{ name: 'hard-gates', result: 'failure' }] }],
    ['검사 없음', { checks: [{ name: 'hard-gates', result: 'missing' }] }], ['필수 검사 읽기 실패', { requiredError: '403' }],
    ['검사 결과 읽기 실패', { checksError: 'x' }], ['파일 목록 읽기 실패', { filesError: '3000개' }]]) {
    const e = mergeEligibility(view(over));
    assert.equal(e.canMerge, false, name); assert.ok(e.reasons.length > 0, name);
  }
});

test('eligibility: an unprotected base is enabled with a note', () => {
  const e = mergeEligibility(view({ protected: false, checks: [] }));
  assert.equal(e.canMerge, true); assert.ok(e.notes.length > 0);
});

// ── 「꼭 볼 것」 ──
test('must-see paths: harness, constitutions, gate state and workflows — case-insensitive, constitutions at any depth', () => {
  for (const p of ['.claude/hooks/x.cjs', '.claude/settings.json', 'CLAUDE.md', 'AGENTS.md', '98_Management/01_GateState/gate-config.json', '.github/workflows/ci.yml',
    '.Claude/settings.json', 'claude.md', '02_Project/CLAUDE.md', '98_management/01_gatestate/x', '.GitHub/Workflows/a.yml']) assert.ok(mustSeeWhy(p), p);
  for (const p of ['README.md', '99_Others/Dashboard/lib/merge.mjs', '98_Management/00_ADR/ADR-001.md', '.claudeignore', '.github/dependabot.yml', 'docs/CLAUDE.md.bak', 'package.json'])
    assert.equal(mustSeeWhy(p), null, p);
});

test('must-see: only must-see files go to the page with their patch; a missing patch gets the GitHub file-diff link', async () => {
  const files = [file('README.md'), file('.claude/hooks/a.cjs'), file('CLAUDE.md', { patch: undefined }), file('AGENTS.md', { patch: null })];
  const pr = await read(setup({ files }).svc);
  assert.equal(pr.files, 4);
  assert.deepEqual(pr.mustSee.map(m => m.path), ['.claude/hooks/a.cjs', 'CLAUDE.md', 'AGENTS.md']);
  assert.equal(pr.mustSee[0].patch, '@@ -1 +1 @@\n-a\n+b');
  for (const m of pr.mustSee.slice(1)) {
    assert.equal(m.patch, null);
    assert.equal(m.diffUrl, `https://github.com/bass131/AgentDeck/pull/12/files#diff-${createHash('sha256').update(m.path).digest('hex')}`);
  }
  assert.ok(pr.mustSee.every(m => typeof m.why === 'string' && m.why));
  assert.equal(pr.canMerge, true);
});

test('must-see: a rename is judged on the old path too', async () => {
  const pr = await read(setup({ files: [file('docs/hook.cjs', { status: 'renamed', previous_filename: '.claude/hooks/hook.cjs', patch: undefined }), file('a/b.md', { status: 'renamed', previous_filename: 'a/c.md' })] }).svc);
  assert.deepEqual(pr.mustSee.map(m => [m.path, m.previousPath]), [['docs/hook.cjs', '.claude/hooks/hook.cjs']]);
  assert.match(pr.mustSee[0].why, /옛 경로/);
});

const pkg = (filename = 'package.json', over = {}) => file(filename, { patch: '@@ -2 +2 @@\n-  "version": "0.1.0"\n+  "version": "0.2.0"', ...over });
function pkgSetup(baseObj, headObj, opts = {}) {
  return setup({ files: [pkg(opts.filename, opts.file)], extra: [
    [new RegExp(`contents/.*\\?ref=${BASE}$`), opts.baseRes ?? content(baseObj)],
    [new RegExp(`contents/.*\\?ref=${SHA}$`), opts.headRes ?? content(headObj)],
  ] });
}

test('must-see package.json: the scripts objects at the base and head SHAs are compared, not the patch text', async () => {
  const scripts = { lint: 'eslint .', test: 'vitest run' };
  const same = pkgSetup({ version: '0.1.0', scripts }, { version: '0.2.0', scripts: { test: 'vitest run', lint: 'eslint .' } });
  const pr = await read(same.svc);
  assert.deepEqual(pr.mustSee, [], '키 순서만 바뀐 scripts는 같은 것');
  const calls = joinedCalls(same.f);
  assert.ok(calls.includes(`api repos/bass131/AgentDeck/contents/package.json?ref=${BASE}`), 'base는 PR의 base.sha로 읽는다');
  assert.ok(calls.includes(`api repos/bass131/AgentDeck/contents/package.json?ref=${SHA}`), 'head는 보인 머리 SHA로 읽는다');
  const changed = await read(pkgSetup({ scripts }, { scripts: { ...scripts, postinstall: 'node x.js' } }).svc);
  assert.deepEqual(changed.mustSee.map(m => m.path), ['package.json']);
  assert.match(changed.mustSee[0].why, /scripts/);
  const nested = await read(pkgSetup({ scripts }, { scripts: {} }, { filename: '02_Project/package.json' }).svc);
  assert.deepEqual(nested.mustSee.map(m => m.path), ['02_Project/package.json'], '어느 깊이의 package.json이든 본다');
});

test('must-see package.json: a read or parse failure on either side counts as must-see, with the reason', async () => {
  const s = { scripts: { a: 'b' } };
  for (const [name, opts] of [
    ['head 404', { headRes: fail(404, 'Not Found') }],
    ['base 403', { baseRes: fail(403, 'Forbidden') }],
    ['not JSON', { headRes: ok({ type: 'file', encoding: 'base64', content: b64('{ "scripts": ') }) }],
    ['too large (encoding none)', { headRes: ok({ type: 'file', encoding: 'none', content: '' }) }],
    ['a directory', { headRes: ok([{ name: 'x' }]) }],
  ]) {
    const pr = await read(pkgSetup(s, s, opts).svc);
    assert.deepEqual(pr.mustSee.map(m => m.path), ['package.json'], name);
    assert.match(pr.mustSee[0].why, /비교하지 못/, name);
  }
});

test('must-see package.json: an added file has no base side, a renamed one is read at its old path, segments are encoded', async () => {
  const added = setup({ files: [pkg('tools/package.json', { status: 'added' })], extra: [[new RegExp(`contents/tools/package\\.json\\?ref=${SHA}$`), content({ scripts: { x: 'y' } })]] });
  assert.deepEqual((await read(added.svc)).mustSee.map(m => m.path), ['tools/package.json']);
  assert.ok(!joinedCalls(added.f).some(j => j.includes(`ref=${BASE}`)), '새 파일은 base를 읽지 않는다');
  const plain = setup({ files: [pkg('tools/package.json', { status: 'added' })], extra: [[/contents\//, content({ name: 'x' })]] });
  assert.deepEqual((await read(plain.svc)).mustSee, [], 'scripts 없는 새 package.json은 꼭 볼 것이 아니다');
  const spaced = setup({ files: [pkg('new dir/package.json')], extra: [[/contents\//, content({ scripts: { a: 'b' } })]] });
  await read(spaced.svc);
  const calls = joinedCalls(spaced.f);
  assert.ok(calls.includes(`api repos/bass131/AgentDeck/contents/new%20dir/package.json?ref=${BASE}`));
  assert.ok(calls.includes(`api repos/bass131/AgentDeck/contents/new%20dir/package.json?ref=${SHA}`));
});

test('must-see package.json: a rename or copy onto or off a package.json name is must-see without comparing; the name is case-insensitive', async () => {
  for (const f of [pkg('tools/package.json', { status: 'renamed', previous_filename: 'old/package.json' }), pkg('tools/package.json', { status: 'copied', previous_filename: 'package.json' }),
    pkg('tools/x.json', { status: 'renamed', previous_filename: 'package.json' })]) {
    const s = setup({ files: [f], extra: [[/contents\//, content({ scripts: { a: 'b' } })]] });
    const pr = await read(s.svc);
    assert.deepEqual(pr.mustSee.map(m => m.path), [f.filename], `${f.status} ${f.previous_filename} → ${f.filename}`);
    assert.match(pr.mustSee[0].why, /package\.json/);
  }
  const upper = setup({ files: [pkg('tools/Package.JSON')], extra: [[new RegExp(`ref=${BASE}$`), content({ scripts: { a: 'b' } })], [new RegExp(`ref=${SHA}$`), content({ scripts: { a: 'c' } })]] });
  assert.deepEqual((await read(upper.svc)).mustSee.map(m => m.path), ['tools/Package.JSON']);
});

test('files: pages of 100 are followed until a short page; a must-see file on page 2 is found', async () => {
  const files = [...Array.from({ length: 100 }, (_, i) => file(`src/f${i}.ts`)), ...Array.from({ length: 29 }, (_, i) => file(`src/g${i}.ts`)), file('.github/workflows/ci.yml')];
  const { svc, f } = setup({ files });
  const pr = await read(svc);
  assert.equal(pr.files, 130);
  assert.deepEqual(pr.mustSee.map(m => m.path), ['.github/workflows/ci.yml']);
  assert.deepEqual(joinedCalls(f).filter(j => FILES.test(j)).map(j => Number(FILES.exec(j)[1])), [1, 2]);
});

test('files: hitting the GitHub cap of 3000, a count that differs from changed_files, or a failed page blocks the merge', async () => {
  assert.equal(FILES_CAP, 3000);
  const many = Array.from({ length: 3000 }, (_, i) => file(`src/f${i}.ts`));
  const capped = setup({ files: many });
  const pr = await read(capped.svc);
  assert.ok(pr.filesError); assert.equal(pr.canMerge, false);
  assert.ok(!joinedCalls(capped.f).some(j => j.endsWith('page=31')), '31쪽은 부르지 않는다');
  const short = await read(setup({ files: [file('a.md')], pr: { changed_files: 2 } }).svc);
  assert.ok(short.filesError); assert.equal(short.canMerge, false);
  const broken = await read(setup({ extra: [[FILES, fail(502, 'Bad Gateway')]] }).svc);
  assert.match(broken.filesError, /502/); assert.equal(broken.canMerge, false);
});

// ── 병합: 마지막으로 보인 SHA → 다시 읽기 → 사람 확인 → 다시 읽기 → PUT ──
const MERGE = /pulls\/12\/merge-async(?: |$)/;
const POLL = /pulls\/12\/merge-async\/uuid-1$/;
const pending = (sha = SHA) => http(202, { status: 'pending', details: { message: 'queued', uuid: 'uuid-1', merge_method: 'merge', merge_action: 'direct_merge', expected_head_sha: sha } });
async function readThen(o) { const s = setup(o); await read(s.svc); return s; }

test('merge: carries the shown SHA, merge, direct_merge and bypass_rules=false in a PUT, then waits 202 → pending → merged', async () => {
  const { svc, f, sleeps } = await readThen({ extra: [[MERGE, pending()], [POLL, [http(200, { status: 'pending', details: { message: 'wait' } }), http(200, { status: 'merged', details: { message: 'ok', sha: OTHER } })]]] });
  const r = await svc.mergePr(CWD, 12, SHA, { confirm: yes });
  assert.equal(r.status, 'merged'); assert.equal(r.mergeSha, OTHER);
  assert.deepEqual(f.calls.find(a => MERGE.test(a.join(' '))), ['api', '-i', '-X', 'PUT', 'repos/bass131/AgentDeck/pulls/12/merge-async',
    '-f', `sha=${SHA}`, '-f', 'merge_method=merge', '-f', 'merge_action=direct_merge', '-F', 'bypass_rules=false']);
  assert.equal(f.calls.filter(a => POLL.test(a.join(' '))).length, 2);
  assert.ok(sleeps.every(ms => ms === 2000));
});

test('merge: 202 then failed shows the server reason; a 202 for another SHA is a failure without polling', async () => {
  const a = await readThen({ extra: [[MERGE, pending()], [POLL, http(200, { status: 'failed', details: { message: 'Merge conflict: the pull request could not be merged.' } })]] });
  const r = await a.svc.mergePr(CWD, 12, SHA, { confirm: yes });
  assert.equal(r.status, 'failed'); assert.match(r.message, /Merge conflict/);
  const b = await readThen({ extra: [[MERGE, pending(OTHER)]] });
  assert.equal((await b.svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'failed');
  assert.ok(!b.f.calls.some(x => POLL.test(x.join(' '))));
});

test('merge: 200 already merged or enqueued; 400 is an unmergeable state; 403, 404, 422 each have their reason', async () => {
  const a = await readThen({ extra: [[MERGE, http(200, { status: 'merged', details: { message: 'already', sha: OTHER } })]] });
  assert.deepEqual(await a.svc.mergePr(CWD, 12, SHA, { confirm: yes }), { status: 'merged', message: 'already', mergeSha: OTHER });
  const b = await readThen({ extra: [[MERGE, http(200, { status: 'enqueued', details: { message: 'queued' } })]] });
  assert.equal((await b.svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'enqueued');
  const c = await readThen({ extra: [[MERGE, http(400, { message: 'Pull request is closed' })]] });
  const r = await c.svc.mergePr(CWD, 12, SHA, { confirm: yes });
  assert.equal(r.status, 'refused'); assert.match(r.message, /병합할 수 없는 상태/);
  for (const [code, re] of [[403, /권한/], [404, /찾지 못/], [422, /검증/]]) {
    const s = await readThen({ extra: [[MERGE, http(code, { message: 'x' })]] });
    const x = await s.svc.mergePr(CWD, 12, SHA, { confirm: yes });
    assert.equal(x.status, 'refused'); assert.match(x.message, re);
  }
});

test('merge: 409 — a pending request for the same SHA and options is awaited; another SHA or other options are refused', async () => {
  const same = await readThen({ extra: [[MERGE, http(409, { status: 'pending', details: { uuid: 'uuid-1', merge_method: 'merge', expected_head_sha: SHA } })], [POLL, http(200, { status: 'merged', details: { sha: OTHER } })]] });
  assert.equal((await same.svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'merged');
  const diff = await readThen({ extra: [[MERGE, http(409, { status: 'pending', details: { uuid: 'uuid-2', expected_head_sha: OTHER } })]] });
  const r = await diff.svc.mergePr(CWD, 12, SHA, { confirm: yes });
  assert.equal(r.status, 'refused'); assert.match(r.message, /이미/);
  assert.ok(!joinedCalls(diff.f).some(j => j.includes('uuid-2')));
  for (const [over, re] of [[{ bypass_rules: true }, /bypass_rules/], [{ merge_method: 'squash' }, /merge_method/], [{ merge_action: 'enqueue' }, /merge_action/]]) {
    const s = await readThen({ extra: [[MERGE, http(409, { status: 'pending', details: { uuid: 'uuid-1', expected_head_sha: SHA, ...over } })]] });
    const x = await s.svc.mergePr(CWD, 12, SHA, { confirm: yes });
    assert.equal(x.status, 'refused', JSON.stringify(over)); assert.match(x.message, re);
    assert.ok(!s.f.calls.some(a => POLL.test(a.join(' '))));
  }
});

test('merge: a PUT that ends without an HTTP status is 「결과 모름」; the poll cap is a timeout; a poll 404 is a failure', async () => {
  const a = await readThen({ extra: [[MERGE, { code: -1, stdout: '', stderr: 'timed out' }]] });
  assert.deepEqual(await a.svc.mergePr(CWD, 12, SHA, { confirm: yes }), { status: 'unknown', message: '결과 모름 — 다시 읽기로 확인하세요' });
  const b = await readThen({ pollTimeoutMs: 10000, extra: [[MERGE, pending()], [POLL, http(200, { status: 'pending', details: {} })]] });
  const t = await b.svc.mergePr(CWD, 12, SHA, { confirm: yes });
  assert.equal(t.status, 'timeout'); assert.match(t.message, /다시 읽기/);
  const c = await readThen({ extra: [[MERGE, pending()], [POLL, http(404, { message: 'Not Found' })]] });
  assert.equal((await c.svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'failed');
});

test('merge: the PR is re-read before the dialog and again right before the PUT; any change in head, base, open or merged refuses', async () => {
  for (const [over, label] of [[{ head: { ref: 'feat/x', sha: OTHER } }, 'head'], [{ base: { ref: 'main', sha: BASE } }, 'base'], [{ state: 'closed' }, 'closed'], [{ merged: true }, 'merged']]) {
    // 확인 창 전에 바뀜: 창을 띄우지 않는다
    const s = setup({ extra: [[PR_GET, [ok(prBody()), ok(prBody(over))]]] });
    await read(s.svc);
    let asked = 0;
    const r = await s.svc.mergePr(CWD, 12, SHA, { confirm: async () => { asked++; return { answer: 'yes' }; } });
    assert.equal(r.status, 'refused', label); assert.match(r.message, /PR이 바뀌었어요/);
    assert.equal(asked, 0, `${label}: 바뀐 PR로는 확인 창을 띄우지 않는다`);
    assert.ok(!s.f.calls.some(a => MERGE.test(a.join(' '))), label);
    // 확인 창이 떠 있는 동안 바뀜: PUT을 보내지 않는다
    const t = setup({ extra: [[PR_GET, [ok(prBody()), ok(prBody()), ok(prBody(over))]]] });
    await read(t.svc);
    const r2 = await t.svc.mergePr(CWD, 12, SHA, { confirm: yes });
    assert.equal(r2.status, 'refused', label); assert.match(r2.message, /PR이 바뀌었어요/);
    assert.ok(!t.f.calls.some(a => MERGE.test(a.join(' '))), label);
  }
  const { svc, f } = await readThen({ extra: [[MERGE, http(400, { message: 'closed' })]] });
  await svc.mergePr(CWD, 12, SHA, { confirm: yes });
  const joined = joinedCalls(f), putAt = joined.findIndex(j => MERGE.test(j));
  assert.ok(putAt > 0);
  assert.equal(joined[putAt - 1], 'api repos/bass131/AgentDeck/pulls/12', 'PUT 바로 앞은 PR 다시 읽기');
});

test('merge: an unseen SHA, another SHA, a malformed SHA or another PR is refused without gh and without a dialog', async () => {
  let asked = 0;
  const confirm = async () => { asked++; return { answer: 'yes' }; };
  const fresh = setup();
  assert.equal((await fresh.svc.mergePr(CWD, 12, SHA, { confirm })).status, 'refused');
  assert.equal(fresh.f.calls.length, 0);
  const { svc, f } = await readThen();
  const before = f.calls.length;
  for (const [n, sha] of [[12, OTHER], [12, 'abc'], [13, SHA], [12.5, SHA]]) assert.equal((await svc.mergePr(CWD, n, sha, { confirm })).status, 'refused', `${n} ${sha}`);
  assert.equal(f.calls.length, before);
  assert.equal(asked, 0);
});

test('merge: a last read that did not meet the conditions is refused too', async () => {
  const { svc, f } = await readThen({ runs: [{ name: 'hard-gates', status: 'in_progress', conclusion: null }] });
  const before = f.calls.length;
  assert.equal((await svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'refused');
  assert.equal(f.calls.length, before);
});

test('merge: a SHA once used cannot be used again — only a newer read re-arms it', async () => {
  const { svc, f } = await readThen({ extra: [[MERGE, http(400, { message: 'closed' })]] });
  await svc.mergePr(CWD, 12, SHA, { confirm: yes });
  const before = f.calls.length;
  assert.equal((await svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'refused');
  assert.equal(f.calls.length, before);
  await read(svc);
  assert.equal((await svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'refused', '다시 읽으면 다시 열린다(여기선 400)');
  assert.equal(f.calls.filter(a => MERGE.test(a.join(' '))).length, 2);
});

test('merge: a read that started before the merge used the SHA and lands after it does not re-arm the SHA', async () => {
  const calls = [];
  let prGets = 0, release = () => {};
  const svc = createPrService({
    gh: async args => {
      calls.push(args);
      const j = args.join(' ');
      if (PR_GET.test(j)) { prGets++; if (prGets === 2) return new Promise(res => { release = res; }); return ok(prBody()); }
      if (/protection/.test(j)) return protectedBy(APP);
      if (/check-runs/.test(j)) return ok({ check_runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'success', app: { id: APP } }] });
      if (/\/status$/.test(j)) return ok({ statuses: [] });
      if (FILES.test(j)) return ok([file('README.md')]);
      if (MERGE.test(j)) return http(400, { message: 'closed' });
      throw new Error('예상 밖: ' + j);
    },
    originUrl: async () => 'https://github.com/bass131/AgentDeck.git',
    sleep: async () => {},
  });
  await read(svc);
  const late = svc.readPr(CWD, { number: 12 });
  assert.equal((await svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'refused');
  release(ok(prBody()));
  assert.equal((await late).ok, true);
  const before = calls.length;
  const again = await svc.mergePr(CWD, 12, SHA, { confirm: yes });
  assert.equal(again.status, 'refused'); assert.match(again.message, /다시 읽/);
  assert.equal(calls.length, before);
});

// ── 사람 확인: 정확히 { answer: 'yes' }일 때만 보낸다 ──
test('confirm: anything but exactly { answer: "yes" } — no, YES, true, a bare string, nothing, a throw — sends nothing and spends the SHA', async () => {
  for (const [label, confirm] of [['no', async () => ({ answer: 'no' })], ['YES', async () => ({ answer: 'YES' })], ['true', async () => ({ answer: true })],
    ['bare yes', async () => 'yes'], ['undefined', async () => undefined], ['null', async () => null], ['throw', async () => { throw new Error('창 실패'); }],
    ['sync throw', () => { throw new Error('x'); }], ['not a function', 'yes']]) {
    const { svc, f } = await readThen({ extra: [[MERGE, pending()]] });
    let sent = 0;
    const r = await svc.mergePr(CWD, 12, SHA, { confirm, send: async () => { sent++; return { status: 'merged', message: 'x' }; } });
    assert.equal(r.status, 'cancelled', label); assert.match(r.message, /병합하지 않았어요/, label);
    assert.equal(sent, 0, label);
    assert.ok(!f.calls.some(a => MERGE.test(a.join(' '))), label);
    const before = f.calls.length;
    assert.equal((await svc.mergePr(CWD, 12, SHA, { confirm: yes })).status, 'refused', `${label}: 취소한 SHA는 다시 읽어야 열린다`);
    assert.equal(f.calls.length, before);
  }
});

test('confirm: the dialog gets what the server read and stored — number, title, base ← head, full SHA, must-see names — never the request', async () => {
  const s = setup({ files: [file('CLAUDE.md'), file('README.md'), file('98_Management/01_GateState/gate-config.json')],
    extra: [[PR_GET, [ok(prBody({ changed_files: 3 })), ok(prBody({ title: '나중에 바뀐 제목' })), ok(prBody())]]] });
  await read(s.svc);
  let seen = null;
  await s.svc.mergePr(CWD, 12, SHA, { confirm: async info => { seen = info; return { answer: 'no' }; } });
  assert.deepEqual(seen, { repo: 'bass131/AgentDeck', number: 12, title: 'G9 병합 버튼', baseRef: 'master', headRef: 'feat/x', sha: SHA,
    mustSee: ['CLAUDE.md', '98_Management/01_GateState/gate-config.json'] });
});

test('confirm: the send step is injectable and gets a single-use ticket only after yes; the default send refuses a foreign or reused ticket', async () => {
  const { svc, f } = await readThen();
  const tickets = [];
  const r = await svc.mergePr(CWD, 12, SHA, { confirm: yes, send: async ticket => { tickets.push(ticket); return { status: 'refused', message: '기록만 했어요' }; } });
  assert.deepEqual(r, { status: 'refused', message: '기록만 했어요' });
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].number, 12); assert.equal(tickets[0].sha, SHA);
  assert.ok(!f.calls.some(a => MERGE.test(a.join(' '))), '주입한 send가 PUT을 대신한다');
  assert.equal((await svc.sendMerge(tickets[0])).status, 'refused', '쓰지 않은 표라도 mergePr 밖에서 다시 쓰지 못한다');
  assert.equal((await svc.sendMerge({ number: 12, sha: SHA, cwd: CWD })).status, 'refused', '만든 적 없는 표');
  assert.ok(!f.calls.some(a => MERGE.test(a.join(' '))));
});

test('confirm: a ticket from prepareMerge alone is not armed — only mergePr arms it, and only after exactly yes', async () => {
  const { svc, f } = await readThen({ extra: [[MERGE, pending()]] });
  const prep = await svc.prepareMerge(CWD, 12, SHA);
  assert.equal(prep.ok, true);
  const r = await svc.sendMerge(prep.ticket);
  assert.equal(r.status, 'refused');
  assert.ok(!f.calls.some(a => MERGE.test(a.join(' '))), '확인 없이 준비만 한 표로는 PUT이 나가지 않는다');
  // 확인이 yes가 아니면 mergePr도 표를 무장하지 않는다 — send가 받은 표를 나중에 sendMerge로 써도 거절
  const again = await readThen({ extra: [[MERGE, pending()]] });
  let kept = null;
  const r2 = await again.svc.mergePr(CWD, 12, SHA, { confirm: async () => ({ answer: 'no' }), send: async t => { kept = t; return { status: 'merged' }; } });
  assert.equal(r2.status, 'cancelled'); assert.equal(kept, null, '취소면 send를 부르지도 않는다');
});

// ── 열린 PR 목록 (M07 G11) ── 실측(2026-11-18, 읽기 전용): `gh pr list --repo bass131/AgentDeck --state open --json <LIST_FIELDS> --limit 51`
// 성공은 exit 0과 JSON 배열(열린 PR이 없으면 `[]`), 실패는 exit 1과 stderr 평문(`GraphQL: Could not resolve to a Repository …`). 봇 작성자는 `app/dependabot`.
const LIST = /^pr list /;
const listed = (n, over = {}) => ({ author: { id: 'MDQ6VXNlcjMzMDg0NTkw', is_bot: false, login: 'bass131', name: 'Moodie' }, baseRefName: 'master', headRefName: `feat/x-${n}`,
  headRefOid: SHA, isDraft: false, number: n, title: `PR ${n}`, updatedAt: '2026-11-18T00:08:22Z', ...over });
const listSvc = (res, opts = {}) => setup({ ...opts, extra: [[LIST, res], ...(opts.extra ?? [])] });

test('list: one read-only gh pr list call, args array, repo pinned to origin, open only, capped fields and limit 51', async () => {
  assert.equal(LIST_CAP, 50);
  assert.equal(LIST_FIELDS, 'number,title,baseRefName,headRefName,headRefOid,isDraft,author,updatedAt');
  assert.deepEqual(listArgs({ owner: 'bass131', repo: 'AgentDeck' }), ['pr', 'list', '--repo', 'bass131/AgentDeck', '--state', 'open', '--json', LIST_FIELDS, '--limit', '51']);
  const { svc, f } = listSvc(ok([listed(78, { title: 'M07 G10 종결 기록', headRefName: 'chore/m07-g10-close', headRefOid: '84fc92833352416eb698db217cf377bc0204a5d6' })]));
  const r = await svc.listPrs(CWD);
  assert.deepEqual(r, { ok: true, repo: 'bass131/AgentDeck', more: false, dropped: 0, items: [
    { number: 78, title: 'M07 G10 종결 기록', baseRef: 'master', headRef: 'chore/m07-g10-close', sha: '84fc92833352416eb698db217cf377bc0204a5d6', draft: false, author: 'bass131', updatedAt: '2026-11-18T00:08:22Z' }] });
  assert.deepEqual(f.calls, [listArgs({ owner: 'bass131', repo: 'AgentDeck' })], '한 번, 인자 배열 그대로');
  assert.ok(!joinedCalls(f).some(c => /merge|-X|PUT|POST/i.test(c)), '병합·쓰기 호출이 없다');
});

test('list: the service surface grows by exactly one read — listPrs', () => {
  assert.deepEqual(Object.keys(setup().svc).sort(), ['listPrs', 'mergePr', 'prepareMerge', 'readPr', 'sendMerge']);
});

test('list: the repo comes from origin only; a non-GitHub origin is a reason and no gh call', async () => {
  const ssh = listSvc(ok([]), { origin: 'git@github.com:someone/Other.git' });
  assert.equal((await ssh.svc.listPrs(CWD)).repo, 'someone/Other');
  assert.equal(ssh.f.calls[0][3], 'someone/Other');
  const bad = listSvc(ok([]), { origin: 'https://gitlab.com/x/y.git' });
  const r = await bad.svc.listPrs(CWD);
  assert.equal(r.ok, false); assert.match(r.reason, /origin/);
  assert.equal(bad.f.calls.length, 0);
});

test('list: 50 at most; a 51st means more; an empty list is ok and empty', async () => {
  const many = n => Array.from({ length: n }, (_, i) => listed(100 + i));
  const r51 = await listSvc(ok(many(51))).svc.listPrs(CWD);
  assert.deepEqual([r51.ok, r51.items.length, r51.more], [true, 50, true]);
  assert.equal(r51.items.at(-1).number, 149, '앞의 50개를 순서대로');
  const r50 = await listSvc(ok(many(50))).svc.listPrs(CWD);
  assert.deepEqual([r50.items.length, r50.more], [50, false]);
  assert.deepEqual(await listSvc(ok([])).svc.listPrs(CWD), { ok: true, repo: 'bass131/AgentDeck', items: [], more: false, dropped: 0 });
});

// 사용자 요청(2026-11-18 「미병합 PR을 순서대로 볼 수 있게」): gh는 최신부터 주지만 목록은 번호 오름차순(먼저 연 PR부터)이다
test('list: rows come in PR number order, oldest first; the cap still keeps the newest 50', async () => {
  const two = await listSvc(ok([listed(79), listed(78)])).svc.listPrs(CWD);
  assert.deepEqual(two.items.map(i => i.number), [78, 79]);
  const desc = Array.from({ length: 51 }, (_, i) => listed(150 - i));
  const r = await listSvc(ok(desc)).svc.listPrs(CWD);
  assert.deepEqual([r.items[0].number, r.items.at(-1).number, r.items.length, r.more], [101, 150, 50, true]);
});

test('list: every field is untrusted — bad number or SHA drops the row (counted), other bad fields are blanked', async () => {
  const r = await listSvc(ok([
    listed(1), listed(0), listed(2.5), listed('3'), listed(4, { headRefOid: 'abc' }), listed(5, { headRefOid: null }), null, 'x',
    listed(6, { title: 42, baseRefName: ['m'], headRefName: { a: 1 }, isDraft: 'true', author: { login: 'evil name<b>' }, updatedAt: 'yesterday' }),
    listed(7, { isDraft: true, author: { is_bot: true, login: 'app/dependabot' }, headRefOid: SHA.toUpperCase() }),
    listed(8, { author: null }),
  ])).svc.listPrs(CWD);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map(i => i.number), [1, 6, 7, 8]);
  assert.equal(r.dropped, 7);
  assert.deepEqual(r.items[1], { number: 6, title: '', baseRef: '', headRef: '', sha: SHA, draft: false, author: '', updatedAt: '' });
  assert.deepEqual([r.items[2].draft, r.items[2].author, r.items[2].sha], [true, 'app/dependabot', SHA.toUpperCase()]);
  assert.equal(r.items[3].author, '');
});

test('list: a failed read gives a reason with credentials masked and control characters removed; odd output is a reason too', async () => {
  const leak = await listSvc({ code: 1, stdout: '', stderr: 'error connecting to https://x:ghp_secret@github.com/\u001b[31mred\u001b[0m\nline2' }).svc.listPrs(CWD);
  assert.equal(leak.ok, false);
  assert.doesNotMatch(leak.reason, /ghp_secret|\u001b|\n/);
  assert.match(leak.reason, /\*\*\*@github\.com/);
  const gql = await listSvc({ code: 1, stdout: '', stderr: "GraphQL: Could not resolve to a Repository with the name 'bass131/NoSuch'. (repository)" }).svc.listPrs(CWD);
  assert.match(gql.reason, /Could not resolve/);
  assert.ok((await listSvc({ code: 1, stdout: '', stderr: 'y'.repeat(5000) }).svc.listPrs(CWD)).reason.length <= 300, '긴 오류는 자른다');
  for (const stdout of ['not json', '{"number":1}', 'null']) {
    const r = await listSvc({ code: 0, stdout, stderr: '' }).svc.listPrs(CWD);
    assert.equal(r.ok, false, stdout); assert.equal(typeof r.reason, 'string');
  }
  const thrown = setup({ extra: [[LIST, () => { throw new Error('spawn gh ENOENT'); }]] });
  assert.equal((await thrown.svc.listPrs(CWD)).ok, false, '실행기가 던져도 이유로 돌려준다');
});

test('list: it never arms a merge — the list SHA is display only; a shown SHA from readPr survives a list read', async () => {
  const alone = listSvc(ok([listed(12)]));
  await alone.svc.listPrs(CWD);
  const refused = await alone.svc.prepareMerge(CWD, 12, SHA);
  assert.equal(refused.ok, false, '목록만 읽은 SHA로는 병합 준비가 열리지 않는다');
  assert.match(refused.result.message, /마지막으로 읽은 값과 달라요/);
  const s = listSvc(ok([listed(12, { headRefOid: OTHER })]));
  await read(s.svc);
  await s.svc.listPrs(CWD);
  const prep = await s.svc.prepareMerge(CWD, 12, SHA);
  assert.equal(prep.ok, true, '목록 읽기가 readPr이 보인 SHA를 지우거나 바꾸지 않는다');
  assert.equal(prep.view.sha, SHA);
});
