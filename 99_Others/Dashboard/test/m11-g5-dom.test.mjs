// M11 G5: app.js를 jsdom에서 실제로 돌려 화면 배선을 본다(Backlog 71). 서버 요청은 가짜 fetch, 실시간 연결은 가짜 EventSource다.
// 정규식으로 소스 글자를 읽던 시험 가운데 같은 동작을 여기서 덮는 것은 지웠다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { collect } from '../lib/collector.mjs';
import { BOARD } from '../lib/decisions.mjs';
import { scriptJSON } from '../server.mjs';
import { fakeGit, NOW } from './helpers.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const src = p => readFile(new URL(p, import.meta.url), 'utf8');
const [TEMPLATE, CHIME, APP, CSS] = await Promise.all(['../public/index.html', '../public/chime.js', '../public/app.js', '../public/styles.css'].map(src));
const TOKEN = 'a'.repeat(64);
const goalRepo = new URL('./fixtures/goal-repo/', import.meta.url);
const baseVm = async () => ({ ...(await collect(goalRepo.pathname.replace(/^\/([A-Za-z]:)/, '$1'), { now: NOW, git: fakeGit() })), answer: { canType: true } });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) assert.fail(`기다렸지만 오지 않았어요: ${what}`); await wait(10); }
}

async function page(t, vm, routes = {}) {
  const html = TEMPLATE.replace('__BOOTSTRAP_JSON__', () => scriptJSON({ vm, token: TOKEN })).replace(/<script src="[^"]+" defer><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:4319/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, calls = [], streams = [];
  let closed = false;
  w.matchMedia = media => ({ matches: false, media, addEventListener() {}, removeEventListener() {} });
  w.EventSource = class { constructor(url) { this.url = url; this.on = {}; streams.push(this); } addEventListener(type, fn) { this.on[type] = fn; } close() {} };
  w.CSS ??= {};
  w.CSS.escape ??= s => String(s).replace(/[^\w-]/g, c => '\\' + c);
  w.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, body, token: opts.headers?.['X-Dashboard-Token'] });
    const r = routes[url] ? await routes[url](body) : { ok: false, reason: '시험 경로 없음' };
    if (closed) return new Promise(() => {});
    return { status: 200, json: async () => r };
  };
  w.eval(CHIME);
  w.eval(APP);
  t.after(() => { closed = true; w.close(); });
  await wait(20);
  const $ = s => w.document.querySelector(s);
  return { w, doc: w.document, $, $$: s => [...w.document.querySelectorAll(s)], calls, text: s => $(s)?.textContent ?? '',
    push(next) { streams.at(-1).on.snapshot({ data: JSON.stringify(next) }); }, click(s) { const el = typeof s === 'string' ? $(s) : s; assert.ok(el, `누를 것이 없어요: ${s}`); el.click(); } };
}

// ── 71: 결정 카드 배선 (decide-view.test.mjs의 app.js 정규식 절을 옮김) ──
const opt = (key, label, effect = `${label} 효과`) => ({ key, label, effect });
const decision = (over = {}) => ({ id: 'g5-a', title: '첫 결정', options: [opt('A', '가'), opt('B', '나')], recommended: 'A', pr: null, detail: [], ...over });
const board = (items, sig = 's1') => ({ sourceId: 'decisions', status: 'ok', path: BOARD, items, sig, warnings: [], skipped: 0, kept: false });
const answerRoutes = (log = []) => ({
  '/api/answer/preview': body => { log.push(['preview', body]); return { ok: true, line: `현황판 결정 응답: 1) 첫 결정 → ${body.picks['g5-a']} <서버>`, canType: true }; },
  '/api/answer/send': body => { log.push(['send', body]); return { ok: true, via: 'input', line: body.expect, note: '고쳐 <b>고름</b> 표지를 붙였어요.' }; },
  '/api/merge/list': () => ({ ok: true, items: [], more: false, dropped: 0 }),
});

test('[M11-G5 71] decision cards: a pick asks the server with the page token, shows the server sentence, and send waits for it and sends it as expect', async t => {
  const vm = await baseVm(); vm.decisions = board([decision()]);
  const log = [], p = await page(t, vm, answerRoutes(log));
  assert.equal(p.$$('#decide .dec').length, 1);
  assert.ok(!p.$('#decide').classList.contains('is-empty'));
  p.click('[data-pick="g5-a"][data-key="B"]');
  assert.ok(p.$('[data-dec-send]').disabled, '미리보기를 기다리는 동안 넣기는 꺼져 있다');
  await until(() => p.text('#decide-send .send-line'), '서버 문장');
  assert.equal(p.text('#decide-send .send-line'), '현황판 결정 응답: 1) 첫 결정 → B <서버>', '문장은 서버가 준 글 그대로(이스케이프)다');
  const pre = p.calls.find(c => c.url === '/api/answer/preview');
  assert.deepEqual([pre.token, pre.body], [TOKEN, { sig: 's1', picks: { 'g5-a': 'B' }, comments: {} }], '페이지는 id와 키만 보낸다');
  p.click('[data-dec-send]');
  await until(() => p.$('#decide-send .send-result.is-done'), '넣은 결과 줄');
  assert.equal(log.find(x => x[0] === 'send')[1].expect, '현황판 결정 응답: 1) 첫 결정 → B <서버>', '보인 문장을 expect로 보낸다');
  assert.match(p.$('#decide-send .send-result').innerHTML, /고쳐 &lt;b&gt;고름&lt;\/b&gt;/, '서버 note는 이스케이프해 보인다');
});

test('[M11-G5 71] decision cards: typing a comment survives a snapshot with the same list; a changed option label drops the pick and says so', async t => {
  const vm = await baseVm(); vm.decisions = board([decision()]);
  const p = await page(t, vm, answerRoutes());
  p.click('[data-pick="g5-a"][data-key="C"]');
  const input = await until(() => p.$('[data-comment="g5-a"]'), '코멘트 칸');
  assert.equal(p.doc.activeElement, input, 'C를 고르면 코멘트 칸으로 간다');
  input.value = '먼저 diff'; input.dispatchEvent(new p.w.Event('input', { bubbles: true }));
  p.push({ ...vm, revision: vm.revision + 1 });
  assert.equal(p.$('[data-comment="g5-a"]'), input, '같은 목록이면 카드를 다시 칠하지 않는다');
  assert.equal(input.value, '먼저 diff');
  p.click('[data-pick="g5-a"][data-key="A"]');
  p.push({ ...vm, revision: vm.revision + 2, decisions: board([decision({ options: [opt('A', '바뀐 가'), opt('B', '나')] })], 's2') });
  assert.match(p.text('#toast'), /선택지 글이 바뀌어 고른 것을 지웠어요.*첫 결정 A/);
  assert.equal(p.$('[data-pick="g5-a"][data-key="A"]').getAttribute('aria-pressed'), 'false');
});

test('[M11-G5 71] 「지금」 holds only the doing card; hand and where sit in #brief; decisions leave the hand list for one link to #decide; no decision shows one quiet line', async t => {
  const vm = await baseVm(); vm.decisions = board([decision()]);
  const p = await page(t, vm, answerRoutes());
  assert.equal(p.$$('#now .q').length, 1);
  assert.ok(p.$('#now .q-doing'));
  assert.ok(p.$('#brief .q-hand') && p.$('#brief .q-where'));
  assert.ok(!p.text('#brief .hand-list').includes('첫 결정'), '결정은 손 목록에 다시 쓰지 않는다');
  assert.match(p.$('#brief .q-hand a[href="#decide"]').textContent, /결정 요청 1건/);
  assert.match(p.doc.title, /^\(1\) /, '탭 제목 배지는 결정까지 센다');
  const none = await page(t, { ...vm, decisions: board([]) }, answerRoutes());
  assert.ok(none.$('#decide').classList.contains('is-empty'));
  assert.match(none.text('#decide-sum'), /기다리는 결정이 없어요/);
  assert.equal(none.$('[data-dec-send]'), null);
});

test('[M11-G5 71] the insert button follows canType; without it only copy is offered', async t => {
  const vm = await baseVm(); vm.decisions = board([decision()]); vm.answer = { canType: false };
  const p = await page(t, vm, answerRoutes());
  p.click('[data-pick="g5-a"][data-key="A"]');
  await until(() => p.text('#decide-send .send-line'), '서버 문장');
  assert.equal(p.$('[data-dec-send]'), null);
  assert.ok(p.$('[data-dec-copy]') && !p.$('[data-dec-copy]').disabled);
  assert.match(p.text('#decide-send .send-note'), /복사만/);
});

// ── 병합 카드 공통 ──
const SHA = 'f4e0ff3a5f2c4c1f9e2b7d6a8c0e1b2d3f4a5b6c';
const mergeItem = (pr = 9) => ({ id: 'merge', key: 'merge:g.md', level: 'todo', say: `PR ${pr}의 병합을 기다려요 — 위 병합 카드의 「병합」 버튼으로 해 주세요(바탕화면 확인 창에서 한 번 더 눌러요).`, source: 'goal 문서 머리말 「상태: 병합 대기」', ref: null, pr });
const prView = (n = 9, over = {}) => ({ number: n, title: `PR ${n} 제목`, state: 'open', merged: false, url: `https://github.com/o/r/pull/${n}`, baseRef: 'milestone/m11', headRef: `chore/x-${n}`, headSha: SHA,
  files: 2, checks: [{ name: 'hard-gates', result: 'success' }], notes: [], reasons: [], canMerge: true, mustSee: [], ...over });
const row = n => ({ number: n, title: `PR ${n} 제목`, baseRef: 'milestone/m11', headRef: `chore/x-${n}`, sha: SHA, draft: false, author: 'o', updatedAt: '' });
const mergeRoutes = ({ views = { 9: prView(9) }, list = [9], run } = {}) => ({
  '/api/merge/list': () => ({ ok: true, items: list.map(row), more: false, dropped: 0 }),
  '/api/merge/read': body => views[body.pr] ? { ok: true, pr: views[body.pr] } : { ok: false, reason: `PR #${body.pr}을 읽지 못했어요.` },
  '/api/merge/run': run || (() => ({ ok: false, status: 'cancelled', message: '확인 창에서 병합하지 않았어요. 다시 하려면 다시 읽기를 눌러 주세요' })),
});
const withHand = async (...hand) => { const vm = await baseVm(); vm.summary = { ...vm.summary, hand }; return vm; };

// ── 72 ──
test('[M11-G5 72] the waiting-merge fact folds into the merge card showing the same PR; it still counts, and a card that failed to load keeps the full line', async t => {
  const p = await page(t, await withHand(mergeItem(9)), mergeRoutes());
  await until(() => p.$('#merge-card .mg'), '병합 카드');
  assert.equal(p.$$('#brief .hand-list li').length, 0, '같은 PR의 사실 줄은 카드 하나로 합친다');
  const link = p.$('#brief .q-hand a[href="#merge"]');
  assert.match(link.textContent, /PR 9.*병합 카드/, '목록 대신 카드를 가리키는 한 줄');
  assert.ok(!p.text('#brief').includes('병합을 기다려요 —'), '같은 문장을 두 번 쓰지 않는다');
  assert.match(p.doc.title, /^\(1\) /, '알림음·배지는 그대로 센다');
  const failed = await page(t, await withHand(mergeItem(7)), mergeRoutes({ list: [] }));
  await until(() => failed.$('#merge-card .send-refusal'), '읽기 실패');
  assert.match(failed.text('#brief .hand-list'), /PR 7의 병합을 기다려요 — 위 병합 카드/, '카드가 그 PR을 못 보이면 사실 줄이 남는다(병합 카드는 위에 있다)');
});

// ── 61 ──
test('[M11-G5 61] once the card reads the pending PR as merged, the hand stops asking to merge and says only the goal document is left', async t => {
  const p = await page(t, await withHand(mergeItem(9)), mergeRoutes({ views: { 9: prView(9, { state: 'closed', merged: true }) } }));
  await until(() => p.text('#merge-card').includes('병합됐어요'), '닫힌 카드');
  assert.equal(p.doc.title, 'AgentDeck 현황판', '배지에서 빠진다');
  assert.match(p.text('#brief .q-hand'), /PR 9은 병합됐어요\. goal 문서 갱신만 남았어요/);
  assert.ok(p.$('#brief .q-hand').classList.contains('is-ok'));
  const red = await page(t, await withHand(mergeItem(9)), mergeRoutes({ views: { 9: prView(9, { checks: [{ name: 'hard-gates', result: 'failure' }], canMerge: false }) } }));
  await until(() => red.$('#merge-card .mg'), '병합 카드');
  assert.ok(red.$('#brief .q-hand').classList.contains('is-stop'), 'CI 실패는 빨강');
  assert.match(red.text('#brief .q-hand'), /필수 검사.*hard-gates.*실패/);
  assert.match(red.doc.title, /^\(!1\) /);
});

// ── M07-27 ──
test('[M11-G5 M07-27] after the confirm window closes without merging, the card says it once', async t => {
  const p = await page(t, await withHand(mergeItem(9)), mergeRoutes());
  await until(() => p.$('[data-merge-run]') && !p.$('[data-merge-run]').disabled, '병합 단추');
  p.click('[data-merge-run]');
  await until(() => p.text('#merge-act').includes('확인 창에서 병합하지 않았어요'), '결과 줄');
  const act = p.text('#merge-act');
  assert.ok(!act.includes('이미 병합을 요청했어요'), '같은 뜻을 두 줄로 쓰지 않는다');
  assert.equal(act.split('다시 읽기를 눌러').length - 1, 1);
  assert.ok(p.$('[data-merge-run]').disabled, '보낸 SHA는 다시 읽기 전까지 다시 못 누른다');
  const run = p.calls.find(c => c.url === '/api/merge/run');
  assert.deepEqual([run.token, run.body], [TOKEN, { pr: 9, sha: SHA }], '병합 요청은 페이지 토큰과 PR 번호·보인 머리 SHA만 보낸다');
  assert.ok(p.calls.filter(c => c.url.startsWith('/api/merge/')).every(c => c.token === TOKEN));
  p.click('[data-merge-reload]');
  await until(() => !p.text('#merge-act').includes('확인 창에서 병합하지 않았어요') && p.$('[data-merge-run]') && !p.$('[data-merge-run]').disabled, '다시 읽은 뒤 단추');
});

// ── M07-32 ──
test('[M11-G5 M07-32] a new pending PR number re-reads the list by itself; the reload buttons keep keyboard focus while reading', async t => {
  const routes = mergeRoutes({ views: { 9: prView(9), 10: prView(10) }, list: [9, 10] }), listOnce = routes['/api/merge/list'], gate = { hold: false, go: null };
  routes['/api/merge/list'] = body => gate.hold ? new Promise(r => { gate.go = () => r(listOnce(body)); }) : listOnce(body);
  const vm = await withHand(mergeItem(9));
  const p = await page(t, vm, routes);
  await until(() => p.$('#merge-card .mg'), '병합 카드');
  const lists = () => p.calls.filter(c => c.url === '/api/merge/list').length;
  const before = lists();
  p.push({ ...vm, revision: vm.revision + 1, summary: { ...vm.summary, hand: [mergeItem(10)] } });
  await until(() => lists() > before, '목록 다시 읽기');
  await until(() => p.text('#merge-card').includes('PR 10 제목'), '새 PR 카드');
  const settled = lists();
  p.push({ ...vm, revision: vm.revision + 2, summary: { ...vm.summary, hand: [mergeItem(10)] } });
  await wait(30);
  assert.equal(lists(), settled, '번호가 그대로면 스냅샷마다 다시 읽지 않는다');
  gate.hold = true;
  p.$('[data-merge-list-reload]').focus();
  p.click('[data-merge-list-reload]');
  await wait(20);
  assert.ok(p.doc.activeElement?.matches('[data-merge-list-reload]'), '읽는 동안에도 초점이 단추에 남는다');
  assert.equal(p.doc.activeElement.getAttribute('aria-disabled'), 'true');
  const during = lists();
  p.click('[data-merge-list-reload]');
  assert.equal(lists(), during, '읽는 중에 다시 눌러도 겹쳐 읽지 않는다');
  gate.hold = false; gate.go();
  await until(() => p.doc.activeElement?.getAttribute('aria-disabled') !== 'true', '읽기 끝');
  assert.ok(p.doc.activeElement?.matches('[data-merge-list-reload]'));
  p.$('[data-merge-reload]').focus();
  p.click('[data-merge-reload]');
  assert.ok(p.doc.activeElement?.matches('[data-merge-reload]'), '「다시 읽기」도 초점을 잃지 않는다');
  await until(() => !p.text('#merge-card').includes('다시 읽는 중'), '다시 읽기 끝');
  assert.ok(p.doc.activeElement?.matches('[data-merge-reload]'));
});

// ── 62·63 배선 ──
test('[M11-G5 62] the stale-progress fact shows as a small line under the hand', async t => {
  const vm = await baseVm(); vm.phases.goal.stale = { after: 3, commit: 'd0c1234' };
  const p = await page(t, vm, mergeRoutes({ list: [] }));
  assert.match(p.text('#brief .q-notes'), /진척 표시가 낡았을 수 있어요.*커밋이 3개/);
  const fresh = await page(t, await baseVm(), mergeRoutes({ list: [] }));
  assert.ok(!fresh.text('#brief').includes('낡았을 수'));
});

test('[M11-G5 63] Orca worker news: a few escaped lines when the snapshot carries them, nothing when it does not', async t => {
  const vm = await baseVm();
  vm.inbox = { status: 'ok', items: [{ id: 'a', type: 'escalation', subject: '멈춤 <b>', at: '2026-11-21T01:00:00Z', unread: true }, { id: 'b', type: 'worker_done', subject: '끝', at: '2026-11-20T01:00:00Z', unread: false }] };
  const p = await page(t, vm, mergeRoutes({ list: [] }));
  const box = p.$('#brief .inbox');
  assert.ok(box, '소식 절');
  assert.equal(box.querySelectorAll('li').length, 2);
  assert.match(box.innerHTML, /멈춤 &lt;b&gt;/);
  assert.match(box.textContent, /에스컬레이션/);
  assert.match(box.textContent, /워커 완료/);
  assert.equal(p.doc.title, 'AgentDeck 현황판', '소식은 알림음·배지 대상이 아니다');
  assert.ok(box.querySelector('li.is-unread') && box.querySelectorAll('li.is-unread').length === 1, '안 읽은 소식은 표시가 다르다');
  const q = await page(t, { ...vm, inbox: { status: 'ok', items: [{ id: 'c', type: 'question', subject: '물음', at: null, unread: false }] } }, mergeRoutes({ list: [] }));
  assert.match(q.text('#brief .inbox'), /질문.*물음/);
  assert.equal(q.$$('#brief .inbox time').length, 0, '시각이 없으면 비워 둔다');
  assert.equal(box.querySelectorAll('time').length, 2);
  const empty = await page(t, { ...vm, inbox: { status: 'ok', items: [] } }, mergeRoutes({ list: [] }));
  assert.equal(empty.$('#brief .inbox'), null, '소식이 없으면 절을 그리지 않는다');
  const failed = await page(t, { ...vm, inbox: { status: 'failed', items: [] } }, mergeRoutes({ list: [] }));
  assert.match(failed.text('#brief .inbox'), /읽지 못했어요/);
  const off = await page(t, { ...vm, inbox: null }, mergeRoutes({ list: [] }));
  assert.equal(off.$('#brief .inbox'), null);
});

// ── 64 ──
test('[M11-G5 64] unread sources are a red broken fact, not a yellow to-do; the unused strip classes are gone; no Web Audio shows 「알림음 없음」', async t => {
  const vm = await baseVm(); vm.sources = [...vm.sources, { id: 'x', label: '시험 원문', target: 'x', status: 'failed', collectedAt: vm.collectedAt, error: '못 읽음' }];
  const p = await page(t, vm, mergeRoutes({ list: [] }));
  const li = [...p.$$('#brief .q-notes li')].find(l => l.textContent.includes('원문 1개를 읽지 못했어요'));
  assert.ok(li.classList.contains('is-broken'));
  assert.ok(li.querySelector('svg.g-block') && !li.querySelector('svg.g-note'), '깨짐은 빨강 네모다');
  assert.ok(li.querySelector('a[href="#sources"][data-open="sources"]'), '어떤 원문인지 보는 길은 그대로다');
  assert.ok(!p.$('#brief .q-hand').classList.contains('is-stop'), '깨짐 사실은 「내 손」 머리 색(할 일 수준)을 바꾸지 않는다');
  const fail = [...p.$$('#brief .q-notes li')].find(l => l.textContent.includes('검증 기록에 실패가'));
  assert.ok(fail.classList.contains('is-note') && fail.querySelector('svg.g-note'), '주의 줄은 노랑 세모 그대로다');
  const quiet = await page(t, { ...vm, summary: { ...vm.summary, activity: { ...(vm.summary.activity || {}), kind: 'stop', at: new Date(Date.now() - 20 * 60e3).toISOString(), say: '쉼', sayPast: '쉼', quiet: { at: new Date(Date.now() - 20 * 60e3).toISOString(), after: 5 } } } }, mergeRoutes({ list: [] }));
  const ql = quiet.$('#brief .q-notes li.is-quiet');
  assert.ok(ql && ql.querySelector('svg.g-clock') && !ql.querySelector('svg.g-note'), '조용함 줄은 회색 시계다');
  assert.ok(!/\.mini-stop|\.mini-todo/.test(CSS), '쓰지 않는 띠 클래스가 styles.css에 없다');
  assert.ok(!/mini-stop|mini-todo/.test(APP), '화면도 그 클래스를 쓰지 않는다');
  assert.ok(/\.q-notes li\.is-broken/.test(CSS), '깨짐 줄의 색 규칙이 있다');
  assert.equal(p.text('#brief .sound-state'), '알림음 없음', 'jsdom에는 Web Audio가 없다');
  assert.ok(p.$('#brief .sound-state').classList.contains('is-unsupported'));
});

// ── 68 ──
test('[M11-G5 68] 「N단계 중 k개 완료」 is said once; a hook time ahead of the page clock never says 「미래 시각」', async t => {
  const vm = await baseVm();
  const act = ms => ({ kind: 'edit', actor: 'main', at: new Date(Date.now() + ms).toISOString(), count: 1, of: 1, detail: null, say: '메인 세션이 파일을 고치고 있어요', sayPast: '메인 세션이 파일을 고쳤어요' });
  vm.summary = { ...vm.summary, activity: act(2 * 60e3) };
  const p = await page(t, vm, mergeRoutes({ list: [] }));
  const steps = `${vm.phases.items.length}단계 중 ${vm.phases.items.filter(x => x.flow === 'done').length}개 완료`;
  assert.equal(p.doc.body.textContent.split(steps).length - 1, 1, '단계 영역 머리 한 곳에만');
  assert.equal(p.$('#now .ring').getAttribute('aria-label'), steps, '링은 화면 읽기용 이름으로 남는다');
  assert.ok(!p.doc.body.textContent.includes('미래 시각'));
  assert.match(p.text('#now .q-doing'), /메인 세션이 파일을 고치고 있어요/, '화면 시계가 몇 분 늦어도 지금 활동으로 읽는다');
  const far = await page(t, { ...vm, summary: { ...vm.summary, activity: act(3600e3) } }, mergeRoutes({ list: [] }));
  assert.ok(!far.doc.body.textContent.includes('미래 시각'));
  assert.match(far.text('#now .q-doing'), /마지막 활동 시각이 이 화면의 시계보다 앞서요/, '크게 앞서면 시계가 어긋났다고 말한다');
});

// ── 44 화면 ──
test('[M11-G5 44] the milestone panel shows a spec status line and a goal-documents count instead of 「계획 문서 없음」', async t => {
  const vm = await baseVm();
  vm.milestones = { ...vm.milestones, status: 'ok', items: [
    { name: 'M11', path: '01_Milestones/M11/00_마일스톤-스펙.md', current: true, state: 'ok', title: 'M11 — 정리', statusText: '합의(2026-11-20 15:06)', error: null, line: 3 },
    { name: 'M09', path: '01_Milestones/M09', current: false, state: 'goals', title: null, statusText: null, error: null, goals: { total: 5, closed: 1 } }] };
  const p = await page(t, vm, mergeRoutes({ list: [] }));
  const rows = p.$$('#milestones .ms-row').map(r => r.textContent);
  assert.match(rows[0], /합의\(2026-11-20 15:06\)/);
  assert.match(rows[1], /goal 문서 5개 중 1개 종결/);
  assert.ok(!p.text('#milestones').includes('계획 문서 없음'));
});
