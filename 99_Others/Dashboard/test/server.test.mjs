import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createDashboard } from '../server.mjs';
import { events } from './helpers.mjs';

function fakeWatch() {
  const watcher = Object.assign(new EventEmitter(), { close() {} });
  let listener;
  return { watcher, fn: (root, options, cb) => { assert.equal(options.recursive, true); listener = cb; return watcher; }, fire: name => listener('change', name) };
}
async function appFor(t, options = {}) {
  const calls = [];
  const collectFn = async (repo, opts) => { calls.push(opts); return { schema: 'ad-dashboard/1', revision: opts.revision, collectedAt: '2026-11-11T10:00:00+09:00', sources: [] }; };
  const app = await createDashboard({ repoPath: 'C:/fake', port: 0 }, { collectFn, debounceMs: 10, maxWaitMs: 60, pingMs: 60000, ...options });
  t.after(() => app.close());
  return Object.assign(app, { calls });
}

// POST를 받는 곳은 결정 응답 두 경로(POST /api/answer/preview·send, M05 H7)와 병합 두 경로(POST /api/merge/read·run, M07 G9) 넷뿐이다.
// 그 밖의 POST는 그대로 405이고, 네 경로도 토큰 없는 요청은 403이다. 자세한 검사는 test/answer.test.mjs와 test/merge-server.test.mjs에 있다.
test('page, header, loopback bind, bootstrap snapshot and methods: only the two answer paths and the two merge paths take POST', async t => {
  const app = await appFor(t, { watchFn: fakeWatch().fn });
  assert.equal(app.server.address().address, '127.0.0.1');
  const response = await fetch(app.origin);
  assert.equal(response.headers.get('x-agentdeck-dashboard'), 'ad-dashboard/1');
  const html = await response.text();
  const boot = JSON.parse(html.match(/<script type="application\/json" id="bootstrap">(.*?)<\/script>/s)[1]);
  assert.deepEqual([boot.vm.schema, boot.vm.revision], ['ad-dashboard/1', 1]);
  assert.equal((await fetch(app.origin + '/', { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(app.origin + '/api/decisions/answers', { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(app.origin + '/api/merge', { method: 'POST', body: '{}' })).status, 405);
  for (const p of ['/api/answer/preview', '/api/answer/send', '/api/merge/read', '/api/merge/run']) {
    assert.equal((await fetch(app.origin + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403, `${p}는 토큰 없이 403`);
    assert.equal((await fetch(app.origin + p)).status, 405, `${p}의 GET은 405`);
  }
  assert.match(boot.token, /^[0-9a-f]{64}$/, '페이지 토큰은 bootstrap에만 실린다');
  assert.equal((await fetch(app.origin + '/nothing')).status, 404);
  assert.equal((await fetch(app.origin + '/app.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  // 알림 판단 모듈(public/chime.js)도 같은 정적 파일 목록에서 나간다. 소리는 합성이라 음원 파일 경로가 없고, CSP는 그대로다.
  const chime = await fetch(app.origin + '/chime.js');
  assert.deepEqual([chime.status, chime.headers.get('content-type')], [200, 'text/javascript; charset=utf-8']);
  assert.match(await chime.text(), /globalThis\.AgentDeckChime/);
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  assert.match(html, /<script src="\/chime\.js" defer><\/script>\s*<script src="\/app\.js" defer><\/script>/, 'chime.js가 app.js보다 먼저 실행된다(defer는 문서 순서)');
});

test('bootstrap JSON cannot close the script element', async t => {
  const collectFn = async (repo, opts) => ({ schema: 'ad-dashboard/1', revision: opts.revision, sources: [], text: '</script><script>alert(1)</script>' });
  const app = await createDashboard({ repoPath: 'C:/fake', port: 0 }, { collectFn, watchFn: fakeWatch().fn });
  t.after(() => app.close());
  const html = await (await fetch(app.origin)).text();
  assert.ok(!html.includes('</script><script>alert'));
});

test('foreign Host and foreign Origin are refused', async t => {
  const app = await appFor(t, { watchFn: fakeWatch().fn });
  const u = new URL(app.origin);
  const status = await new Promise((resolve, reject) => {
    http.get({ host: u.hostname, port: u.port, path: '/', headers: { Host: 'rebind.example:' + u.port } }, r => { r.resume(); resolve(r.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal((await fetch(app.origin + '/events', { headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('SSE: first snapshot, batched re-collect on change, ping, node_modules ignored', async t => {
  const w = fakeWatch();
  const app = await appFor(t, { watchFn: w.fn, pingMs: 40 });
  const stream = await events(app.origin); t.after(stream.close);
  assert.equal((await stream.next()).revision, 1);
  w.fire('01_Milestones/a.md'); w.fire('98_Management/01_GateState/hook-log.jsonl'); w.fire('.git/index');
  assert.equal((await stream.next()).revision, 2);
  assert.ok((await stream.next('ping')).at);
  w.fire('node_modules/x/index.js'); w.fire('.git/objects/ab/cdef');
  await delay(150);
  assert.equal(app.snapshot.revision, 2);
});

test('watch failure is reported to the collector and falls back to polling', async t => {
  const w = fakeWatch();
  const app = await appFor(t, { watchFn: w.fn, pollMs: 40 });
  w.watcher.emit('error', new Error('boom'));
  await delay(200);
  assert.ok(app.snapshot.revision >= 3);
  assert.match(app.calls.at(-1).watchError, /감시를 시작하거나 유지하지 못했어요/);
});
