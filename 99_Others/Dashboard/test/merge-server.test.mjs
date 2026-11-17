// M07 G9 서버의 병합 두 경로: POST /api/merge/read(PR 읽기)와 POST /api/merge/run(확인 창 → 병합).
// 결정 응답과 같은 토큰·출처·Host·본문 검사를 거친다. 토큰은 페이지에서 읽을 수 있으므로 사람 증명이 아니다 — 사람 증명은 확인 창이다.
// 병합 서비스·확인 함수·보내기 함수는 createDashboard의 함수 인자로만 주입한다. 시험은 gh·PowerShell을 부르지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createDashboard, MERGE_PATHS } from '../server.mjs';

const SHA = 'f4e0ff3812cde4caf1585a73ac77d3f9836bc2dd';
function fakeWatch() { return () => Object.assign(new EventEmitter(), { close() {} }); }
function fakeService(over = {}) {
  const log = { reads: [], merges: [] };
  const svc = {
    readPr: async (cwd, req) => { log.reads.push([cwd, req]); return { ok: true, pr: { number: req.number, headSha: SHA, canMerge: true, mustSee: [] } }; },
    mergePr: async (cwd, n, sha, opts) => { log.merges.push([cwd, n, sha, opts]); return { status: 'merged', message: '병합했어요', mergeSha: SHA }; },
    sendMerge: async () => ({ status: 'refused', message: '기본 보내기' }),
    ...over,
  };
  return { svc, log };
}
async function appFor(t, deps = {}) {
  const collectFn = async (repo, opts) => ({ schema: 'ad-dashboard/1', revision: opts.revision, collectedAt: '2026-11-18T10:00:00+09:00', sources: [] });
  const app = await createDashboard({ repoPath: 'C:/fake', port: 0 }, { collectFn, watchFn: fakeWatch(), pingMs: 60000, ...deps });
  t.after(() => app.close());
  const html = await (await fetch(app.origin)).text();
  const boot = JSON.parse(html.match(/<script type="application\/json" id="bootstrap">(.*?)<\/script>/s)[1]);
  return Object.assign(app, { token: boot.token });
}
function request(app, { method = 'POST', path = '/api/merge/read', headers = {}, body = '' } = {}) {
  const u = new URL(app.origin);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, method, path, headers, agent: false }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', c => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch {} resolve({ status: res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject);
    req.end(body);
  });
}
const good = app => ({ 'Content-Type': 'application/json', Origin: app.origin, 'X-Dashboard-Token': app.token });
const post = (app, p, body, headers = good(app)) => request(app, { path: '/api/merge/' + p, headers, body: JSON.stringify(body) });

test('the merge paths are exactly read and run', () => {
  assert.deepEqual(Object.keys(MERGE_PATHS).sort(), ['/api/merge/read', '/api/merge/run']);
  assert.ok(Object.isFrozen(MERGE_PATHS));
});

test('403: no token, a wrong token, a foreign or missing Origin, a foreign Host — nothing is read or merged', async t => {
  const { svc, log } = fakeService();
  let asked = 0;
  const app = await appFor(t, { prService: svc, confirm: async () => { asked++; return { answer: 'yes' }; } });
  const h = good(app);
  for (const headers of [{ ...h, 'X-Dashboard-Token': undefined }, { ...h, 'X-Dashboard-Token': 'f'.repeat(64) }, { ...h, 'X-Dashboard-Token': 'x' },
    { ...h, Origin: 'https://evil.example' }, { ...h, Origin: undefined }, { ...h, Origin: 'null' }, { ...h, Host: 'rebind.example:' + new URL(app.origin).port }]) {
    for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
    for (const [p, body] of [['read', { pr: 75 }], ['run', { pr: 75, sha: SHA }]]) {
      const r = await post(app, p, body, headers);
      assert.equal(r.status, 403, `${p} ${JSON.stringify(headers)}`); assert.equal(r.json.ok, false);
    }
  }
  assert.deepEqual([log.reads.length, log.merges.length, asked], [0, 0, 0]);
});

test('405 with Allow: POST for any other method on the merge paths', async t => {
  const { svc, log } = fakeService();
  const app = await appFor(t, { prService: svc });
  for (const p of ['/api/merge/read', '/api/merge/run']) for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const r = await request(app, { method, path: p, headers: good(app), body: method === 'GET' ? '' : '{}' });
    assert.equal(r.status, 405, `${method} ${p}`); assert.equal(r.headers.allow, 'POST');
  }
  for (const p of ['/api/merge', '/api/merge/run/x', '/api/merge/send']) {
    const r = await request(app, { path: p, headers: good(app), body: '{}' });
    assert.equal(r.status, 405, p);
    assert.match(r.json.reason, /결정 응답 두 경로와 병합 두 경로 밖에서는 GET만/, '405 문구도 네 경로를 이름으로 좁힌다');
  }
  assert.deepEqual([log.reads.length, log.merges.length], [0, 0]);
});

test('400 and 413: not JSON, broken JSON, too big, a PR number that is not a positive integer, a SHA that is not 40 hex', async t => {
  const { svc, log } = fakeService();
  const app = await appFor(t, { prService: svc });
  const h = good(app);
  assert.equal((await request(app, { headers: { ...h, 'Content-Type': 'text/plain' }, body: '{"pr":75}' })).status, 400);
  assert.equal((await request(app, { headers: h, body: '{"pr":' })).status, 400);
  assert.equal((await request(app, { headers: h, body: JSON.stringify({ pr: 75, pad: 'x'.repeat(64 * 1024) }) })).status, 413);
  for (const pr of [0, -1, 1.5, '75', null, 1e12, undefined]) assert.equal((await post(app, 'read', { pr })).status, 400, String(pr));
  for (const body of [{ pr: 75 }, { pr: 75, sha: 'abc' }, { pr: 75, sha: SHA + '0' }, { pr: '75', sha: SHA }, { pr: 75, sha: SHA.replace('f', 'g') }]) assert.equal((await post(app, 'run', body)).status, 400, JSON.stringify(body));
  assert.deepEqual([log.reads.length, log.merges.length], [0, 0]);
});

test('read: the service reads the PR in the configured repo and the page gets its view', async t => {
  const { svc, log } = fakeService();
  const app = await appFor(t, { prService: svc });
  const r = await post(app, 'read', { pr: 75 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, pr: { number: 75, headSha: SHA, canMerge: true, mustSee: [] } });
  assert.deepEqual(log.reads, [['C:/fake', { number: 75 }]]);
  const failing = await appFor(t, { prService: fakeService({ readPr: async () => ({ ok: false, error: 'PR #9을 읽지 못했어요 (HTTP 404)' }) }).svc });
  const f = await post(failing, 'read', { pr: 9 });
  assert.deepEqual([f.status, f.json.ok], [200, false]); assert.match(f.json.reason, /404/);
});

test('run: the server hands the injected confirm and send to the service and returns its result; ok only for merged or enqueued', async t => {
  const { svc, log } = fakeService();
  const confirm = async () => ({ answer: 'yes' }), mergeFn = async () => ({ status: 'refused', message: '기록만' });
  const app = await appFor(t, { prService: svc, confirm, mergeFn });
  const r = await post(app, 'run', { pr: 75, sha: SHA });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, status: 'merged', message: '병합했어요', mergeSha: SHA });
  assert.equal(log.merges.length, 1);
  const [cwd, n, sha, opts] = log.merges[0];
  assert.deepEqual([cwd, n, sha], ['C:/fake', 75, SHA]);
  assert.equal(opts.confirm, confirm, '주입한 확인 함수'); assert.equal(opts.send, mergeFn, '주입한 보내기 함수');
  for (const status of ['cancelled', 'refused', 'failed', 'unknown', 'timeout']) {
    const a = await appFor(t, { prService: fakeService({ mergePr: async () => ({ status, message: status }) }).svc });
    assert.deepEqual((await post(a, 'run', { pr: 75, sha: SHA })).json, { ok: false, status, message: status });
  }
  const e = await post(await appFor(t, { prService: fakeService({ mergePr: async () => { throw new Error('boom'); } }).svc }), 'run', { pr: 75, sha: SHA });
  assert.deepEqual([e.status, e.json.ok, e.json.status], [200, false, 'unknown']);
});

test('run: without an injected send the service default sendMerge is used, and the default confirm is a real dialog function', async t => {
  const { svc, log } = fakeService();
  const app = await appFor(t, { prService: svc, confirm: async () => ({ answer: 'no' }) });
  await post(app, 'run', { pr: 75, sha: SHA });
  const sent = await log.merges[0][3].send({});
  assert.deepEqual(sent, { status: 'refused', message: '기본 보내기' });
  const src = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  assert.match(src, /confirm = createConfirm\(\{ timeoutMs: confirmTimeoutMs \}\)/, '시간 초과는 함수 인자로만 바뀐다');
  assert.doesNotMatch(src, /process\.env\.[A-Z_]*(MERGE|CONFIRM)/, '환경변수로 병합·확인을 바꾸는 스위치가 없다');
  assert.doesNotMatch(src, /config\.(merge|confirm)/i, '설정 파일로 바꾸는 스위치도 없다');
});

// 불변식 문장은 느슨하게 풀지 않고 「병합 두 경로 추가」로 좁혀 다시 적는다 — 바깥 쓰기는 넣기와 병합 둘을 이름으로 든다.
test('the invariant sentences name both outside writes: orca typing and the confirmed merge', async () => {
  const at = p => readFile(new URL(p, import.meta.url), 'utf8');
  const [deliver, server, readme] = await Promise.all([at('../lib/deliver.mjs'), at('../server.mjs'), at('../README.md')]);
  assert.doesNotMatch(deliver, /유일한 바깥 쓰기/);
  assert.match(deliver, /바깥 쓰기는 둘뿐이다/);
  assert.match(deliver, /lib\/merge\.mjs/);
  assert.match(server, /POST를 받는 곳은 넷뿐이다/);
  assert.match(readme, /바깥 쓰기는 결정 응답\(메인 입력창에 글 넣기\)과, 사람 확인 창을 거친 PR 병합\(M07 G9\) 둘뿐이다/);
  assert.match(readme, /## 쓰기는 결정 응답 두 경로와 병합 두 경로뿐/);
  assert.ok(readme.split('\n').length <= 250, 'README 250줄 상한');
});

test('run: a second run while the first waits for the dialog is 409 and opens nothing more; the slot frees after', async t => {
  let release;
  const { svc, log } = fakeService({ mergePr: async (...a) => { log.merges.push(a); await new Promise(r => { release = r; }); return { status: 'cancelled', message: '취소' }; } });
  const app = await appFor(t, { prService: svc });
  const first = post(app, 'run', { pr: 75, sha: SHA });
  while (!log.merges.length) await new Promise(r => setTimeout(r, 5));
  const second = await post(app, 'run', { pr: 76, sha: SHA });
  assert.equal(second.status, 409); assert.match(second.json.reason, /확인 창/);
  assert.equal(log.merges.length, 1);
  release();
  assert.equal((await first).json.status, 'cancelled');
  const third = post(app, 'run', { pr: 75, sha: SHA });
  while (log.merges.length < 2) await new Promise(r => setTimeout(r, 5));
  release();
  assert.equal((await third).status, 200);
});
