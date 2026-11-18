// 결정 응답의 쓰기 경로(M05 H7): POST /api/answer/preview·send, 넣기 모듈(lib/deliver.mjs), 설정의 메인 handle, 수집 블록.
// 넣기는 주입한 가짜 함수로만 본다. 시험은 어떤 터미널에도 글을 넣지 않고, 파일을 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { createDashboard } from '../server.mjs';
import { collect, readTail } from '../lib/collector.mjs';
import { loadConfig } from '../lib/config.mjs';
import { ORCA, sendArgs, typeIntoTerminal } from '../lib/deliver.mjs';
import { BOARD, decisionSig, parseBoard } from '../lib/decisions.mjs';
import { events, fakeGit, fixture, NOW } from './helpers.mjs';

const HANDLE = 'term_00000000-1111-4222-8333-444444444444';
const opt = (key, label) => ({ key, label, effect: `${label}를 고르면 일어나는 일이다.` });
const listOf = (...decisions) => {
  const { items, warnings } = parseBoard(JSON.stringify({ decisions }));
  return { sourceId: 'decisions', status: 'ok', path: BOARD, items, warnings, skipped: 0, kept: false, sig: decisionSig(items) };
};
const first = { id: 'g11-version-compare', title: '엔진 버전 비교 두 함수를 합칠지', state: 'waiting', recommended: 'A', options: [opt('A', '그대로 둔다'), opt('B', '합친다')] };
const second = { id: 'sdk-fallback', kind: 'merge', title: 'SDK 폴백 값 변경을 그대로 둘지', state: 'waiting', options: [opt('A', '그대로 둔다'), opt('B', '되돌린다')] };

function fakeWatch() { return (root, options, cb) => Object.assign(new EventEmitter(), { close() {} }); }
async function appFor(t, opts = {}) {
  const { type, list = listOf(first, second) } = opts, handle = 'handle' in opts ? opts.handle : HANDLE;
  const state = { list, typed: [] };
  const collectFn = async (repo, opts) => ({ schema: 'ad-dashboard/1', revision: opts.revision, collectedAt: '2026-11-16T04:40:00+09:00', sources: [], decisions: state.list });
  const typeFn = type || (async (h, text) => { state.typed.push([h, text]); return { ok: true }; });
  const app = await createDashboard({ repoPath: 'C:/fake', port: 0, mainTerminalHandle: handle }, { collectFn, watchFn: fakeWatch(), pingMs: 60000, type: typeFn });
  t.after(() => app.close());
  const html = await (await fetch(app.origin)).text();
  const boot = JSON.parse(html.match(/<script type="application\/json" id="bootstrap">(.*?)<\/script>/s)[1]);
  return Object.assign(app, { state, boot, token: boot.token });
}
// fetch는 Origin을 마음대로 다루지 못하므로 http.request로 머리를 그대로 보낸다.
function request(app, { method = 'POST', path: p = '/api/answer/preview', headers = {}, body = '' } = {}) {
  const u = new URL(app.origin);
  return new Promise((resolve, reject) => {
    // agent: false — 본문을 읽지 않고 답한 연결을 다음 요청이 다시 쓰면 ECONNRESET이 날 수 있어 요청마다 새로 연다.
    const req = http.request({ host: u.hostname, port: u.port, method, path: p, headers, agent: false }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', c => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch {} resolve({ status: res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject);
    req.end(body);
  });
}
const goodHeaders = app => ({ 'Content-Type': 'application/json', Origin: app.origin, 'X-Dashboard-Token': app.token });
const answer = (app, p, body, headers = goodHeaders(app)) => request(app, { path: '/api/answer/' + p, headers, body: JSON.stringify(body) });
const pick = (app, picks, comments) => ({ sig: app.state.list.sig, picks, comments });
// send는 페이지가 화면에 보인 문장(expect)을 함께 보낸다. 서버 문장과 다르면 넣지 않는다.
const withExpect = async (app, body) => ({ ...body, expect: (await answer(app, 'preview', body)).json.line });

test('the page carries a random token per server start; snapshots and SSE never carry it; canType follows the handle', async t => {
  const a = await appFor(t), b = await appFor(t, { handle: null });
  assert.match(a.token, /^[0-9a-f]{64}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.boot.vm.answer.canType, true);
  assert.equal(b.boot.vm.answer.canType, false);
  assert.ok(!JSON.stringify(a.snapshot).includes(a.token));
  const stream = await events(a.origin); t.after(stream.close);
  const snap = await stream.next();
  assert.ok(!JSON.stringify(snap).includes(a.token));
  assert.equal(snap.answer.canType, true);
  assert.ok(!JSON.stringify(a.boot.vm).includes(HANDLE), 'handle은 페이지에 싣지 않는다');
});

test('403: no token, a wrong token of any length, a foreign or missing Origin, a foreign Host — and nothing is typed', async t => {
  const app = await appFor(t);
  const body = pick(app, { 'g11-version-compare': 'A' });
  const h = goodHeaders(app);
  const cases = [
    { ...h, 'X-Dashboard-Token': undefined },
    { ...h, 'X-Dashboard-Token': 'f'.repeat(64) },
    { ...h, 'X-Dashboard-Token': 'short' },
    { ...h, 'X-Dashboard-Token': app.token + '0' },
    { ...h, Origin: 'https://evil.example' },
    { ...h, Origin: 'http://localhost:' + new URL(app.origin).port },
    { ...h, Origin: undefined },
    { ...h, Origin: 'null' },
    { ...h, Host: 'rebind.example:' + new URL(app.origin).port },
  ];
  for (const headers of cases) {
    for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
    for (const p of ['preview', 'send']) {
      const r = await answer(app, p, body, headers);
      assert.equal(r.status, 403, `${p} ${JSON.stringify(headers)}`);
      assert.equal(r.json.ok, false);
    }
  }
  assert.deepEqual(app.state.typed, []);
});

test('400 and 413: not JSON, a broken JSON body, a body over 64 KB', async t => {
  const app = await appFor(t);
  const h = goodHeaders(app);
  assert.equal((await request(app, { headers: { ...h, 'Content-Type': 'text/plain' }, body: '{}' })).status, 400);
  assert.equal((await request(app, { headers: h, body: '{"sig":' })).status, 400);
  const big = JSON.stringify({ sig: app.state.list.sig, picks: {}, pad: 'x'.repeat(64 * 1024) });
  for (const p of ['preview', 'send']) assert.equal((await request(app, { path: '/api/answer/' + p, headers: h, body: big })).status, 413, p);
  assert.deepEqual(app.state.typed, []);
});

test('preview: the server makes the sentence from ids and keys, ignores any sentence the page sends, and never types', async t => {
  const app = await appFor(t);
  const r = await answer(app, 'preview', { ...pick(app, { 'sdk-fallback': 'C', 'g11-version-compare': 'B' }, { 'sdk-fallback': '먼저\r\ndiff를\u001b 보여 줘' }), line: '아무 글', text: '아무 글' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, line: '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → B 합친다 · 2) SDK 폴백 값 변경을 그대로 둘지 → C 코멘트 「먼저 diff를 보여 줘」', canType: true });
  assert.deepEqual(app.state.typed, []);
});

test('409 stale: the page drew another list, including after the board changed under it; 400 for keys or ids not offered now', async t => {
  const app = await appFor(t);
  const old = app.state.list.sig;
  assert.deepEqual([(await answer(app, 'preview', { sig: 'ffffffffffffffff', picks: { 'g11-version-compare': 'A' } })).status], [409]);
  app.state.list = listOf(first); await app.refresh();
  const r = await answer(app, 'send', { sig: old, picks: { 'g11-version-compare': 'A' } });
  assert.deepEqual([r.status, r.json.stale], [409, true]);
  assert.equal((await answer(app, 'send', pick(app, { 'g11-version-compare': 'Z' }))).status, 400, '없는 키');
  assert.equal((await answer(app, 'send', pick(app, { 'sdk-fallback': 'A' }))).status, 400, '목록에서 빠진 항목');
  assert.equal((await answer(app, 'send', pick(app, {}))).status, 400, '고른 것이 없음');
  assert.deepEqual(app.state.typed, []);
});

test('send: types the server sentence once into the configured handle; the same sentence again is 409', async t => {
  const app = await appFor(t);
  const body = await withExpect(app, pick(app, { 'g11-version-compare': 'A' }));
  const r = await answer(app, 'send', body);
  assert.deepEqual([r.status, r.json], [200, { ok: true, via: 'input', line: '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → A 그대로 둔다' }]);
  assert.deepEqual(app.state.typed, [[HANDLE, '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → A 그대로 둔다']]);
  const again = await answer(app, 'send', body);
  assert.equal(again.status, 409);
  assert.equal(app.state.typed.length, 1);
  // 다른 문장은 넣되, 앞 문장 뒤에 이어 붙지 않게 고쳐 고름 표지를 앞에 붙인다. 화면 문장(expect)과 같은 문장 판정은 표지 없는 문장으로 한다
  const lineB = '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → B 합친다';
  const bodyB = await withExpect(app, pick(app, { 'g11-version-compare': 'B' }));
  assert.equal(bodyB.expect, lineB);
  const b = await answer(app, 'send', bodyB);
  assert.deepEqual([b.status, b.json.ok, b.json.line, b.json.corrected], [200, true, lineB, true], '다른 문장은 넣는다');
  assert.match(b.json.note, /앞 문장/);
  assert.match(b.json.note, /마지막/);
  assert.deepEqual(app.state.typed[1], [HANDLE, '【고쳐 고름】 ' + lineB]);
  // 표지는 선택 창의 키(숫자·글자·빈칸)나 명령 메뉴를 여는 `/`로 시작하면 안 된다 — 첫 글자가 키가 아닌 글자다
  assert.match(app.state.typed[1][1], /^[^\s/0-9A-Za-z]/);
  assert.equal((await answer(app, 'send', bodyB)).status, 409, '고친 문장도 두 번은 넣지 않는다');
  assert.equal(app.state.typed.length, 2);
});

test('send: a definite failure (nothing landed) clears the same-sentence mark, so a retry types again without a correction marker', async t => {
  let tries = 0;
  const typed = [];
  const app = await appFor(t, { type: async (h, text) => { tries++; if (tries === 1) throw Object.assign(new Error('terminal gone'), { definite: true }); typed.push(text); return { ok: true }; } });
  const body = await withExpect(app, pick(app, { 'g11-version-compare': 'A' }));
  const r = await answer(app, 'send', body);
  assert.deepEqual([r.status, r.json.ok, r.json.copy, r.json.uncertain ?? false], [200, false, true, false]);
  assert.match(r.json.reason, /넣지 못했어요/);
  assert.match(r.json.reason, /다시 눌러도/);
  const again = await answer(app, 'send', body);
  assert.deepEqual([again.status, again.json.ok, again.json.corrected ?? false, tries], [200, true, false, 2], '확실한 실패 뒤에는 거짓 409 없이 다시 넣는다');
  assert.deepEqual(typed, ['현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → A 그대로 둔다'], '아무것도 들어가지 않았으니 표지 없이 넣는다');
});

test('send: an uncertain failure (timeout, unreadable answer, untagged error) keeps the mark and says to check the main input', async t => {
  for (const error of [Object.assign(new Error('시간 초과'), { uncertain: true }), new Error('orca 오류')]) {
    let tries = 0;
    const app = await appFor(t, { type: async () => { tries++; throw error; } });
    const body = await withExpect(app, pick(app, { 'g11-version-compare': 'A' }));
    const r = await answer(app, 'send', body);
    assert.deepEqual([r.status, r.json.ok, r.json.copy, r.json.uncertain, tries], [200, false, true, true, 1], error.message);
    assert.match(r.json.reason, /확인하지 못했어요/);
    assert.match(r.json.reason, /다시 시도하지 않았어요/);
    assert.match(r.json.reason, /메인 입력창/);
    const again = await answer(app, 'send', body);
    assert.deepEqual([again.status, tries], [409, 1], '글이 들어갔을 수 있으니 같은 문장은 다시 넣지 않는다');
    assert.match(again.json.reason, /확인하지 못했/);
    assert.doesNotMatch(again.json.reason, /Enter만 누르면/, '들어갔는지 모르는데 「이미 넣었어요」라고 하지 않는다');
  }
});

test('send: a changed decision list clears the same-sentence mark; the next send still carries the correction marker', async t => {
  const app = await appFor(t);
  const line = '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → A 그대로 둔다';
  assert.equal((await answer(app, 'send', await withExpect(app, pick(app, { 'g11-version-compare': 'A' })))).status, 200);
  app.state.list = listOf({ ...first, detail: ['## 무엇을 정하나', '- 고친 상세 글'] }, second); await app.refresh();
  const r = await answer(app, 'send', await withExpect(app, pick(app, { 'g11-version-compare': 'A' })));
  assert.deepEqual([r.status, r.json.ok, r.json.corrected], [200, true, true], '목록이 바뀌면 같은 문장 표시를 지운다');
  assert.deepEqual(app.state.typed.map(x => x[1]), [line, '【고쳐 고름】 ' + line], '입력창에 앞 문장이 남아 있을 수 있어 표지는 서버 수명 동안 유지한다');
});

test('a request URL the parser rejects is 400, and the server keeps answering', async t => {
  const app = await appFor(t);
  for (const p of ['//[', '//[::1', '//a:b@[']) {
    const r = await request(app, { method: 'GET', path: p });
    assert.equal(r.status, 400, p);
    assert.equal(r.json.ok, false);
  }
  assert.equal((await fetch(app.origin)).status, 200, '서버가 살아 있다');
});

test('send: a sentence other than the one the page showed (or none) is 409 — nothing unseen reaches the terminal', async t => {
  const app = await appFor(t);
  const body = pick(app, { 'g11-version-compare': 'A' });
  for (const expect of [undefined, '', '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → B 합친다']) {
    const r = await answer(app, 'send', expect === undefined ? body : { ...body, expect });
    assert.deepEqual([r.status, r.json.stale], [409, true], String(expect));
  }
  assert.deepEqual(app.state.typed, []);
});

test('send: a second send while the first is still typing is 409 and does not stack a line', async t => {
  let release;
  const calls = [];
  const app = await appFor(t, { type: (h, text) => { calls.push(text); return new Promise(r => { release = r; }); } });
  const bodyA = await withExpect(app, pick(app, { 'g11-version-compare': 'A' })), bodyB = await withExpect(app, pick(app, { 'g11-version-compare': 'B' }));
  const firstSend = answer(app, 'send', bodyA);
  while (!calls.length) await new Promise(r => setTimeout(r, 5));
  const overlap = await answer(app, 'send', bodyB);
  assert.equal(overlap.status, 409);
  release({ ok: true });
  assert.equal((await firstSend).status, 200);
  assert.equal(calls.length, 1);
});

test('send: no handle or a malformed one means copy only; a failed type is not retried and also falls back to copy', async t => {
  for (const handle of [null, undefined, '', 'term_NOT-A-UUID; rm -rf', 'TERM_00000000-1111-4222-8333-444444444444']) {
    const app = await appFor(t, { handle });
    const r = await answer(app, 'send', await withExpect(app, pick(app, { 'g11-version-compare': 'A' })));
    assert.deepEqual([r.status, r.json.ok, r.json.copy, r.json.line], [200, false, true, '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → A 그대로 둔다'], String(handle));
    assert.match(r.json.reason, /복사/);
    assert.deepEqual(app.state.typed, []);
  }
  // 넣기 실패는 한 번만 부르고 다시 시도하지 않는다. 확실한 실패와 불확실한 실패의 뒤처리는 아래 두 시험이 본다
  let tries = 0;
  const app = await appFor(t, { type: async () => { tries++; throw Object.assign(new Error('orca 오류'), { definite: true }); } });
  const r = await answer(app, 'send', await withExpect(app, pick(app, { 'g11-version-compare': 'A' })));
  assert.deepEqual([r.status, r.json.ok, r.json.copy, tries], [200, false, true, 1]);
  assert.match(r.json.reason, /복사/);
});

test('deliver: ok:false, a non-zero exit, a missing orca and a refused input are definite; a timeout or unreadable output is uncertain', async () => {
  const fail = (error, stdout = '') => (cmd, args, opts, cb) => setImmediate(() => cb(error, stdout, ''));
  const kind = async p => { try { await p; } catch (e) { return [e.definite === true, e.uncertain === true]; } return null; };
  const DEF = [true, false], UNSURE = [false, true];
  assert.deepEqual(await kind(typeIntoTerminal(HANDLE, '문장', { execFileFn: fail(null, '{"ok":false,"error":{"message":"terminal gone"}}') })), DEF);
  assert.deepEqual(await kind(typeIntoTerminal(HANDLE, '문장', { execFileFn: fail(Object.assign(new Error('Command failed'), { code: 1 })) })), DEF);
  assert.deepEqual(await kind(typeIntoTerminal(HANDLE, '문장', { execFileFn: fail(Object.assign(new Error('spawn orca ENOENT'), { code: 'ENOENT' })) })), DEF);
  assert.deepEqual(await kind(typeIntoTerminal('term_bad', '문장', { execFileFn: fail(null, '{"ok":true}') })), DEF);
  assert.deepEqual(await kind(typeIntoTerminal(HANDLE, '', { execFileFn: fail(null, '{"ok":true}') })), DEF);
  // execFile의 timeout은 자식을 죽이고 killed·signal을 단다. 글이 이미 PTY에 갔을 수 있다
  assert.deepEqual(await kind(typeIntoTerminal(HANDLE, '문장', { execFileFn: fail(Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM', code: null })) })), UNSURE);
  assert.deepEqual(await kind(typeIntoTerminal(HANDLE, '문장', { execFileFn: fail(null, 'not json') })), UNSURE);
});

// 병합 세 경로(POST /api/merge/list·read·run, M07 G9·G11)도 POST만 받는다. 그 검사는 test/merge-server.test.mjs에 있다.
test('only the two answer paths and the three merge paths take POST; every other method and path stays 405 or 404', async t => {
  const app = await appFor(t);
  const h = goodHeaders(app);
  for (const [method, p] of [['POST', '/'], ['POST', '/api/decisions/answers'], ['POST', '/api/answer'], ['POST', '/api/answer/send/x'], ['PUT', '/api/answer/send'],
    ['DELETE', '/api/answer/preview'], ['PATCH', '/events'], ['GET', '/api/answer/send'], ['GET', '/api/answer/preview'],
    ['POST', '/api/merge'], ['POST', '/api/merge/send'], ['PUT', '/api/merge/run'], ['GET', '/api/merge/read'], ['GET', '/api/merge/run'],
    ['GET', '/api/merge/list'], ['PUT', '/api/merge/list'], ['POST', '/api/merge/list/x']])
    assert.equal((await request(app, { method, path: p, headers: h, body: method === 'GET' ? '' : '{}' }).catch(e => { throw new Error(`${method} ${p}: ${e.code}`); })).status, 405, `${method} ${p}`);
  const g = await request(app, { method: 'GET', path: '/api/answer/send' });
  assert.equal(g.headers.allow, 'POST');
  assert.deepEqual(app.state.typed, []);
});

test('deliver: orca terminal send with an argument array, no shell, no --enter, one call; refusals and odd output are errors', async () => {
  assert.equal(ORCA, 'orca');
  assert.deepEqual(sendArgs(HANDLE, '글 "따옴표" & | ;'), ['terminal', 'send', '--terminal', HANDLE, '--text', '글 "따옴표" & | ;', '--json']);
  const seen = [];
  const fake = out => (cmd, args, opts, cb) => { seen.push({ cmd, args, opts }); setImmediate(() => (out instanceof Error ? cb(out, '', 'stderr 첫 줄\n둘째') : cb(null, out, ''))); };
  assert.deepEqual(await typeIntoTerminal(HANDLE, '문장', { execFileFn: fake('{"ok":true,"result":{"accepted":true}}') }), { accepted: true });
  const call = seen[0];
  assert.equal(call.cmd, 'orca');
  assert.ok(!call.args.includes('--enter'));
  assert.ok(!call.opts.shell, '셸 없이');
  assert.equal(call.opts.windowsHide, true);
  await assert.rejects(typeIntoTerminal(HANDLE, '문장', { execFileFn: fake('{"ok":false,"error":{"message":"terminal gone"}}') }), /terminal gone/);
  await assert.rejects(typeIntoTerminal(HANDLE, '문장', { execFileFn: fake('not json') }), /읽지 못했어요/);
  await assert.rejects(typeIntoTerminal(HANDLE, '문장', { execFileFn: fake(new Error('spawn')) }), /stderr 첫 줄/);
  const before = seen.length;
  await assert.rejects(typeIntoTerminal('term_bad', '문장', { execFileFn: fake('{"ok":true}') }), /handle/);
  await assert.rejects(typeIntoTerminal(HANDLE, '줄\n바꿈', { execFileFn: fake('{"ok":true}') }), /제어문자/);
  assert.equal(seen.length, before, '형식이 틀리면 부르지 않는다');
});

test('config: mainTerminalHandle passes through only in the exact form; otherwise null and the server still starts', async () => {
  const at = name => fileURLToPath(new URL('./fixtures/' + name, import.meta.url));
  assert.equal((await loadConfig(at('config-handle.json'))).mainTerminalHandle, HANDLE);
  assert.equal((await loadConfig(at('config-bad-handle.json'))).mainTerminalHandle, null);
  const example = JSON.parse(await fsp.readFile(new URL('../config.example.json', import.meta.url), 'utf8'));
  assert.ok('mainTerminalHandle' in example, 'config.example.json에 키가 있다');
});

const io = (overrides = {}) => ({ readFile: fsp.readFile, readdir: fsp.readdir, stat: fsp.stat, tail: readTail, ...overrides });
const boardIo = fn => io({ readFile: async (file, enc) => path.normalize(file).endsWith(path.normalize(BOARD)) ? fn() : fsp.readFile(file, enc) });

test('collector: the board block reads waiting entries with warnings, an absent board is 「없음」, not a failure', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit(), io: io() });
  assert.equal(vm.decisions.status, 'ok');
  assert.deepEqual(vm.decisions.items.map(d => d.id), ['fixture-first']);
  assert.equal(vm.decisions.skipped, 1);
  assert.equal(vm.decisions.sig, decisionSig(vm.decisions.items));
  assert.deepEqual([vm.sources.find(s => s.id === 'decisions').status, vm.sources.find(s => s.id === 'decisions').target], ['ok', BOARD]);
  const none = await collect(fixture, { now: NOW, git: fakeGit(), io: boardIo(() => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); }) });
  assert.deepEqual([none.decisions.status, none.decisions.items, none.sources.find(s => s.id === 'decisions').status], ['absent', [], 'absent']);
});

test('collector: a half-written board keeps the last good list and says so; other blocks are untouched', async () => {
  const good = await collect(fixture, { now: NOW, git: fakeGit(), io: io() });
  const half = await collect(fixture, { now: NOW, git: fakeGit(), io: boardIo(async () => '{"decisions": [{"id": "x"'), previous: good });
  assert.equal(half.decisions.status, 'failed');
  assert.equal(half.decisions.kept, true);
  assert.deepEqual(half.decisions.items.map(d => d.id), ['fixture-first']);
  assert.equal(half.decisions.sig, good.decisions.sig);
  assert.match(half.sources.find(s => s.id === 'decisions').error, /JSON/);
  assert.equal(half.phases.status, 'ok', '보드가 깨져도 다른 블록은 그대로다');
  const cold = await collect(fixture, { now: NOW, git: fakeGit(), io: boardIo(async () => '[') });
  assert.deepEqual([cold.decisions.status, cold.decisions.items, cold.decisions.kept], ['failed', [], false]);
  const denied = await collect(fixture, { now: NOW, git: fakeGit(), io: boardIo(() => { throw Object.assign(new Error('x'), { code: 'EACCES' }); }), previous: good });
  assert.deepEqual([denied.decisions.status, denied.decisions.kept], ['failed', true]);
});
