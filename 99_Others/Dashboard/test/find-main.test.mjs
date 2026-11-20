// M07 G13 메인 터미널 자동 지정 — 결정 응답을 넣기 직전에 Orca 목록에서 이 저장소의 Claude 터미널을 찾는다.
// 찾기는 주입한 가짜 execFile·findMain으로만 본다. 시험은 orca를 부르지 않고 어떤 터미널에도 글을 넣지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { createDashboard } from '../server.mjs';
import { findArgs, pickMain, findMainTerminal } from '../lib/deliver.mjs';
import { decisionSig, parseBoard, BOARD } from '../lib/decisions.mjs';

const REPO = 'C:\\Dev\\AgentDeck';
const H = n => `term_${String(n).padStart(8, '0')}-1111-4222-8333-444444444444`;
const T = (n, over = {}) => ({ handle: H(n), worktreePath: 'C:/Dev/AgentDeck', agentIdentity: 'claude', connected: true, writable: true, orphaned: false, ...over });

test('find: one read-only orca terminal list call for this repo folder, args array', () => {
  assert.deepEqual(findArgs(REPO), ['terminal', 'list', '--worktree', 'path:C:/Dev/AgentDeck', '--json']);
  assert.deepEqual(findArgs('C:/Dev/AgentDeck/'), ['terminal', 'list', '--worktree', 'path:C:/Dev/AgentDeck', '--json']);
});

test('pick: exactly one live Claude terminal in this repo folder is the main one', () => {
  assert.deepEqual(pickMain({ terminals: [T(1)] }, REPO, null), { handle: H(1) });
  // 폴더 비교는 슬래시·대소문자·끝 슬래시를 가리지 않는다
  assert.deepEqual(pickMain({ terminals: [T(1, { worktreePath: 'c:\\dev\\agentdeck\\' })] }, REPO, null), { handle: H(1) });
  // 후보가 아닌 것 — 다른 폴더, Claude가 아님, 끊김, 쓸 수 없음, 고아, 틀린 handle
  const others = [T(2, { worktreePath: 'C:/Dev/Other' }), T(3, { agentIdentity: 'codex' }), T(4, { agentIdentity: null }), T(5, { agentIdentity: 'Claude' }),
    T(6, { connected: false }), T(7, { writable: false }), T(8, { orphaned: true }), T(9, { handle: 'term_NOT; rm -rf' }), T(10, { worktreePath: 'C:/Dev/AgentDeck-old' })];
  assert.deepEqual(pickMain({ terminals: [T(1), ...others] }, REPO, null), { handle: H(1) });
  const none = pickMain({ terminals: others }, REPO, null);
  assert.equal(none.handle, null);
  assert.match(none.reason, /찾지 못했어요/);
});

test('pick: several candidates use the configured handle only when it is among them; otherwise nothing is typed', () => {
  assert.deepEqual(pickMain({ terminals: [T(1), T(2)] }, REPO, H(2)), { handle: H(2) });
  const two = pickMain({ terminals: [T(1), T(2)] }, REPO, null);
  assert.equal(two.handle, null);
  assert.match(two.reason, /2개/);
  assert.equal(pickMain({ terminals: [T(1), T(2)] }, REPO, H(3)).handle, null, '설정이 후보 밖이면 넣지 않는다');
  // 설정 handle이 있는데 후보 밖이면 자동으로 고르지 않는다 — 사용자가 다른 곳(child worktree·Codex)을 메인으로 지정했을 수 있다 (PR 83 검수 중요 3).
  // 설정은 보통 null이라(README) 자동이 기본이고, 낡은 설정은 복사 안내로 끝난다
  const stale = pickMain({ terminals: [T(1)] }, REPO, H(9));
  assert.equal(stale.handle, null);
  assert.match(stale.reason, /mainTerminalHandle/);
  // 목록이 잘렸으면 하나라고 믿지 않는다
  const cut = pickMain({ terminals: [T(1)], truncated: true }, REPO, null);
  assert.equal(cut.handle, null);
  for (const r of [two, cut, pickMain({ terminals: [] }, REPO, H(1))]) assert.doesNotMatch(r.reason, /term_/, 'handle은 이유 글에 싣지 않는다');
});

test('findMainTerminal: no shell, a timeout, windowsHide; a missing folder is 「none」, other failures are unreachable', async () => {
  const seen = [];
  const fake = (err, out) => (cmd, args, opts, cb) => { seen.push({ cmd, args, opts }); setImmediate(() => cb(err, out, '')); };
  const ok = JSON.stringify({ ok: true, result: { terminals: [T(1)], truncated: false, totalCount: 1 } });
  assert.deepEqual(await findMainTerminal(REPO, null, { execFileFn: fake(null, ok) }), { handle: H(1) });
  assert.equal(seen[0].cmd, 'orca');
  assert.deepEqual(seen[0].args, findArgs(REPO));
  assert.ok(!seen[0].opts.shell, '셸 없이');
  assert.equal(seen[0].opts.windowsHide, true);
  assert.ok(seen[0].opts.timeout > 0 && seen[0].opts.timeout <= 10000, '시간 제한');
  // Orca 실측(2026-11-18): 없는 폴더는 exit 1과 {"ok":false,"error":{"code":"selector_not_found"}}
  const notFound = await findMainTerminal(REPO, null, { execFileFn: fake(Object.assign(new Error('Command failed'), { code: 1 }), '{"ok":false,"error":{"code":"selector_not_found","message":"selector_not_found"}}') });
  assert.equal(notFound.handle, null); assert.ok(!notFound.unreachable); assert.match(notFound.reason, /찾지 못했어요/);
  // 닿지 못함은 실행 실패·시간 초과·읽을 수 없는 출력뿐이다 — 그때만 서버가 설정 handle을 그대로 쓴다
  for (const [err, out] of [[Object.assign(new Error('spawn orca ENOENT'), { code: 'ENOENT' }), ''], [Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM' }), ''],
    [null, 'not json'], [Object.assign(new Error('Command failed'), { code: 1 }), '']]) {
    const r = await findMainTerminal(REPO, null, { execFileFn: fake(err, out) });
    assert.equal(r.handle, null); assert.equal(r.unreachable, true, String(out || err.message));
  }
  // Orca가 읽히는 답으로 거절하거나 모양이 틀리면 찾지 못함이다 — 설정 handle로 넣지 않는다 (PR 83 검수 중요 2)
  for (const [err, out] of [[Object.assign(new Error('Command failed'), { code: 1 }), '{"ok":false,"error":{"code":"selector_ambiguous"}}'],
    [null, '{"ok":false,"error":{"code":"runtime_unavailable"}}'], [null, '{"ok":true,"result":{}}'], [null, '{"ok":true}'], [null, 'null']]) {
    const r = await findMainTerminal(REPO, H(9), { execFileFn: fake(err, out) });
    assert.equal(r.handle, null); assert.ok(!r.unreachable, out); assert.match(r.reason, /찾지 못했어요/);
  }
  // execFile이 동기로 던져도 거부로 끝난다
  const sync = await findMainTerminal(REPO, null, { execFileFn: () => { throw new Error('boom'); } });
  assert.equal(sync.unreachable, true);
});

// ── 서버 넣기 길 ──
const opt = (key, label) => ({ key, label, effect: `${label}를 고르면 일어나는 일이다.` });
const listOf = (...decisions) => { const { items, warnings } = parseBoard(JSON.stringify({ decisions })); return { sourceId: 'decisions', status: 'ok', path: BOARD, items, warnings, skipped: 0, kept: false, sig: decisionSig(items) }; };
const one = { id: 'g13-q', title: '물음', state: 'waiting', options: [opt('A', '가'), opt('B', '나')] };
async function appFor(t, { handle = null, findMain } = {}) {
  const state = { typed: [], finds: [], list: listOf(one) };
  const collectFn = async (repo, o) => ({ schema: 'ad-dashboard/1', revision: o.revision, collectedAt: '2026-11-18T14:00:00+09:00', sources: [], decisions: state.list });
  const type = async (h, text) => { state.typed.push([h, text]); return { ok: true }; };
  const fm = findMain && (async (repo, cfg) => { state.finds.push([repo, cfg]); return findMain(repo, cfg); });
  const app = await createDashboard({ repoPath: REPO, port: 0, mainTerminalHandle: handle }, { collectFn, watchFn: () => Object.assign(new EventEmitter(), { close() {} }), pingMs: 60000, type, findMain: fm ?? null });
  t.after(() => app.close());
  const html = await (await fetch(app.origin)).text();
  const boot = JSON.parse(html.match(/<script type="application\/json" id="bootstrap">(.*?)<\/script>/s)[1]);
  return Object.assign(app, { state, boot, token: boot.token });
}
function post(app, p, body) {
  const u = new URL(app.origin);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, method: 'POST', path: '/api/answer/' + p, agent: false,
      headers: { 'Content-Type': 'application/json', Origin: app.origin, 'X-Dashboard-Token': app.token } }, res => {
      let d = ''; res.setEncoding('utf8'); res.on('data', c => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d) }));
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
}
const sendBody = async (app, key = 'A') => { const b = { sig: listOf(one).sig, picks: { 'g13-q': key } }; return { ...b, expect: (await post(app, 'preview', b)).json.line }; };

test('server: the send types once into the terminal found right before typing, not the stale configured one', async t => {
  const app = await appFor(t, { handle: H(9), findMain: async () => ({ handle: H(1) }) });
  assert.equal(app.boot.vm.answer.canType, true);
  const r = await post(app, 'send', await sendBody(app));
  assert.deepEqual([r.status, r.json.ok], [200, true]);
  assert.deepEqual(app.state.typed.map(x => x[0]), [H(1)]);
  assert.deepEqual(app.state.finds, [[REPO, H(9)]], '넣을 때 한 번 찾고, 설정 handle을 함께 넘긴다');
  assert.ok(!JSON.stringify(app.boot.vm).includes('term_'), 'handle은 페이지에 싣지 않는다');
});

test('[M11-G5 M07-35] server: the success answer names the terminal it typed into (title only, never the handle)', async t => {
  const app = await appFor(t, { findMain: async () => ({ handle: H(1), title: '메인 <세션>' }) });
  const r = await post(app, 'send', await sendBody(app));
  assert.deepEqual([r.json.ok, r.json.terminal], [true, '메인 <세션>']);
  assert.ok(!JSON.stringify(r.json).includes('term_'));
  const bare = await appFor(t, { findMain: async () => ({ handle: H(1) }) });
  assert.equal((await post(bare, 'send', await sendBody(bare))).json.terminal, undefined, '제목이 없으면 싣지 않는다');
});

test('server: canType is true with no configured handle when finding is wired; preview never finds', async t => {
  const app = await appFor(t, { findMain: async () => ({ handle: H(1) }) });
  assert.equal(app.boot.vm.answer.canType, true);
  const b = { sig: listOf(one).sig, picks: { 'g13-q': 'A' } };
  assert.equal((await post(app, 'preview', b)).json.canType, true);
  assert.deepEqual(app.state.finds, [], '미리보기와 수집은 찾지 않는다');
  const off = await appFor(t, {});
  assert.equal(off.boot.vm.answer.canType, false, '설정도 찾기도 없으면 복사만');
});

test('server: none, several or an unreadable list types nothing and falls back to copy; the same sentence can be sent again after', async t => {
  let answerWith = { handle: null, reason: '메인 Claude 터미널이 2개라 어느 것이 메인인지 몰라 넣지 않았어요.' };
  const app = await appFor(t, { findMain: async () => answerWith });
  const body = await sendBody(app);
  const r = await post(app, 'send', body);
  assert.deepEqual([r.status, r.json.ok, r.json.copy], [200, false, true]);
  assert.match(r.json.reason, /2개/); assert.match(r.json.reason, /복사/);
  assert.deepEqual(app.state.typed, []);
  // 넣지 않았으니 같은 문장 표시도 고쳐 고름 표지도 남지 않는다 — 고친 뒤 같은 문장을 바로 넣는다
  answerWith = { handle: H(1) };
  const again = await post(app, 'send', body);
  assert.deepEqual([again.status, again.json.ok], [200, true]);
  assert.deepEqual(app.state.typed, [[H(1), body.expect]]);
});

test('server: Orca unreachable falls back to the configured handle only; with none it is copy', async t => {
  const withCfg = await appFor(t, { handle: H(9), findMain: async () => ({ handle: null, unreachable: true, reason: 'Orca에 닿지 못했어요.' }) });
  assert.equal((await post(withCfg, 'send', await sendBody(withCfg))).json.ok, true);
  assert.deepEqual(withCfg.state.typed.map(x => x[0]), [H(9)]);
  const bare = await appFor(t, { findMain: async () => ({ handle: null, unreachable: true, reason: 'Orca에 닿지 못했어요.' }) });
  const r = await post(bare, 'send', await sendBody(bare));
  assert.deepEqual([r.json.ok, r.json.copy], [false, true]);
  assert.deepEqual(bare.state.typed, []);
  // 찾기가 던져도 넣지 않고 복사로 끝난다
  const thrown = await appFor(t, { findMain: async () => { throw new Error('boom'); } });
  const x = await post(thrown, 'send', await sendBody(thrown));
  assert.deepEqual([x.status, x.json.copy], [200, true]);
});

test('server: the decision list changing while finding is 409 stale and types nothing (PR 83 검수 중요 1)', async t => {
  let release;
  const app = await appFor(t, { findMain: () => new Promise(r => { release = r; }) });
  const body = await sendBody(app, 'A');
  const sent = post(app, 'send', body);
  while (!release) await new Promise(r => setTimeout(r, 5));
  app.state.list = listOf({ ...one, title: '물음 (바뀜)' }); await app.refresh();
  release({ handle: H(1) });
  const r = await sent;
  assert.deepEqual([r.status, r.json.ok, r.json.stale], [409, false, true]);
  assert.match(r.json.reason, /바뀌어/);
  assert.deepEqual(app.state.typed, []);
  // 막힌 뒤에도 겹침 막기는 풀려 있다
  release = null;
  const fresh = { sig: app.state.list.sig, picks: { 'g13-q': 'A' } };
  const next = post(app, 'send', { ...fresh, expect: (await post(app, 'preview', fresh)).json.line });
  while (!release) await new Promise(r => setTimeout(r, 5));
  release({ handle: H(1) });
  assert.equal((await next).json.ok, true);
});

test('server: a second send while the first is still finding is 409 and types nothing extra', async t => {
  let release;
  const app = await appFor(t, { findMain: () => new Promise(r => { release = r; }) });
  const first = post(app, 'send', await sendBody(app, 'A'));
  while (!release) await new Promise(r => setTimeout(r, 5));
  const overlap = await post(app, 'send', await sendBody(app, 'B'));
  assert.equal(overlap.status, 409);
  release({ handle: H(1) });
  assert.equal((await first).json.ok, true);
  assert.equal(app.state.typed.length, 1);
});
