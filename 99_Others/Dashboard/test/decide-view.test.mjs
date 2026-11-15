// 결정 응답의 화면 쪽(M05 H7): chime.js의 전역 AgentDeckDecide(알림 항목, 고른 답 정리, 요청 본문)와 app.js·index.html·styles.css 배선.
// 문장은 늘 서버가 만든다. 페이지는 id와 키만 보내고, 서버가 준 문장을 보이기만 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../public/chime.js';
import { judgeHand } from '../lib/progress.mjs';

const D = globalThis.AgentDeckDecide, C = globalThis.AgentDeckChime;
const read = async p => (await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const item = (id, over = {}) => ({ id, title: `${id} 제목`, kind: null, options: [{ key: 'A', label: '가' }, { key: 'B', label: '나' }], ...over });
const list = (...items) => ({ status: 'ok', items, sig: 'abc' });

test('the decide module is frozen, pure and separate from the chime and view modules', () => {
  assert.ok(Object.isFrozen(D));
  assert.notEqual(D, C);
  assert.notEqual(D, globalThis.AgentDeckView);
  for (const fn of ['decisionHand', 'reconcilePicks', 'answerBody', 'pickable', 'cardsKey']) assert.equal(typeof D[fn], 'function', fn);
});

test('decision hand items: one yellow item per waiting decision, keyed decision:<id>, so the H4 chime rings for a new id only', () => {
  const hand = D.decisionHand(list(item('g11-a'), item('g11-b', { title: '둘째' })));
  assert.deepEqual(hand.map(h => [h.key, h.level]), [['decision:g11-a', 'todo'], ['decision:g11-b', 'todo']]);
  assert.match(hand[1].say, /둘째/);
  assert.deepEqual(D.decisionHand({ ...list(item('p')), path: '01_Milestones/00_Decision_Board.local.json' })[0].ref, { path: '01_Milestones/00_Decision_Board.local.json' });
  assert.deepEqual(D.decisionHand(null), []);
  assert.deepEqual(D.decisionHand({ status: 'absent', items: [] }), []);
  assert.equal(D.decisionHand({ status: 'failed', kept: true, items: [item('kept')] }).length, 1, '반쯤 쓰인 보드면 직전 목록을 그대로 센다');
  // 기존 판단에 그대로 얹힌다: 첫 스냅샷 무음, 새 id만 울림, 탭 제목 배지 개수
  const storage = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; })();
  const memory = C.createChimeMemory(storage);
  const keysOf = l => C.handKeys([...judgeHand({ phases: { status: 'failed' }, ledger: { status: 'failed' }, hooks: { status: 'failed' }, failLimit: 3 }), ...D.decisionHand(l)]);
  assert.deepEqual(memory.see(keysOf(list(item('first')))), [], '첫 스냅샷에 이미 있던 결정은 울리지 않는다');
  assert.deepEqual(memory.see(keysOf(list(item('first'), item('second')))), ['decision:second']);
  assert.deepEqual(memory.see(keysOf(list(item('second')))), []);
  assert.equal(C.badgeTitle('AgentDeck 현황판', D.decisionHand(list(item('a'), item('b')))), '(2) AgentDeck 현황판');
});

test('pickable keys mirror the server: A·B when the decision has options, C always', () => {
  assert.deepEqual(D.pickable(item('x')), ['A', 'B', 'C']);
  assert.deepEqual(D.pickable(item('x', { options: [] })), ['C']);
});

test('reconcile: picks on decisions that left the list or keys no longer offered are dropped and named; comments follow their decision', () => {
  const picks = new Map([['stay', 'B'], ['gone', 'A'], ['shrunk', 'B']]), comments = new Map([['stay', '글'], ['gone', '글']]);
  const r = D.reconcilePicks([item('stay'), item('shrunk', { options: [{ key: 'A', label: '가' }] })], picks, comments);
  assert.deepEqual([...r.picks], [['stay', 'B']]);
  assert.deepEqual([...r.comments], [['stay', '글']]);
  // 목록에서 빠진 결정은 이름을 알 수 없어 조용히 빠지고, 남은 결정에서 사라진 키만 이름으로 알린다
  assert.deepEqual(r.dropped, ['shrunk 제목 B']);
  assert.equal(picks.size, 3, '받은 Map은 바꾸지 않는다');
});

test('reconcile: a pick whose option label or effect changed under the same key is dropped and named; C picks and unchanged options stay', () => {
  const o = (label, effect) => [{ key: 'A', label, effect }, { key: 'B', label: '나', effect: '' }];
  const was = [item('lab', { options: o('가', '하나') }), item('eff', { options: o('가', '하나') }), item('same', { options: o('가', '하나') }), item('cmt', { options: o('가', '하나') })];
  const now = [item('lab', { options: o('바뀐 가', '하나') }), item('eff', { options: o('가', '바뀐 효과') }), item('same', { options: o('가', '하나') }), item('cmt', { options: o('바뀐 가', '바뀐 효과') })];
  const picks = new Map([['lab', 'A'], ['eff', 'A'], ['same', 'A'], ['cmt', 'C']]), comments = new Map([['cmt', '글']]);
  const r = D.reconcilePicks(now, picks, comments, was);
  assert.deepEqual([...r.picks], [['same', 'A'], ['cmt', 'C']], '글이 바뀐 선택지의 고름은 버린다. C는 선택지 글과 무관하다');
  assert.deepEqual(r.changed, ['lab 제목 A', 'eff 제목 A']);
  assert.deepEqual(r.dropped, []);
  assert.deepEqual([...r.comments], [['cmt', '글']]);
  // 앞 목록에 없던 결정(새로 들어옴)이나 앞 목록에 없던 키는 비교할 글이 없어 키만 본다
  assert.deepEqual([...D.reconcilePicks(now, new Map([['same', 'B']]), new Map(), [item('same', { options: [{ key: 'A', label: '가' }] })]).picks], [['same', 'B']]);
  assert.deepEqual([...D.reconcilePicks(now, new Map([['lab', 'A']]), new Map(), []).picks], [['lab', 'A']]);
  // 앞 목록을 모르면(첫 스냅샷) 키만 본다
  assert.deepEqual([...D.reconcilePicks(now, picks, comments).picks].length, 4);
  assert.deepEqual(D.reconcilePicks(now, picks, comments).changed, []);
});

test('cards key: a detail-only or warning-text-only change repaints the cards; the same list and picks keep the key', () => {
  const base = { ...list(item('a', { detail: ['## 무엇을 정하나', '- 본문'] })), kept: false, warnings: [{ where: 'a', what: '경고 하나' }] };
  const picks = new Map([['a', 'A']]);
  const k = D.cardsKey(base, picks);
  assert.equal(typeof k, 'string');
  assert.equal(D.cardsKey(structuredClone(base), new Map(picks)), k, '같은 목록과 고름이면 다시 칠하지 않는다');
  assert.notEqual(D.cardsKey({ ...base, items: [item('a', { detail: ['## 무엇을 정하나', '- 고친 본문'] })] }, picks), k, '상세 글만 바뀌어도 다시 칠한다');
  assert.notEqual(D.cardsKey({ ...base, warnings: [{ where: 'a', what: '경고 글이 바뀜' }] }, picks), k, '경고 글만 바뀌어도 다시 칠한다');
  assert.notEqual(D.cardsKey(base, new Map([['a', 'B']])), k);
  assert.notEqual(D.cardsKey({ ...base, sig: 'other' }, picks), k);
  assert.notEqual(D.cardsKey({ ...base, status: 'failed', kept: true }, picks), k);
  assert.equal(typeof D.cardsKey({}, new Map()), 'string', '빈 목록도 키를 준다');
});

test('app.js: the card repaint key, the changed-option notice and the correction note are wired', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(body('renderDecide'), /DEC\.cardsKey\(D, dec\.picks\)/, '다시 칠하기 키는 순수 함수가 정한다');
  assert.match(body('applySnapshot'), /const prevDecisions = st\.vm\.decisions\?\.items[^;]*;[\s\S]*st\.vm = next;[\s\S]*decReconcile\(prevDecisions\)/, '앞 목록은 st.vm을 바꾸기 전에 잡는다');
  assert.match(body('decReconcile'), /DEC\.reconcilePicks\(items, dec\.picks, dec\.comments, prev\)/);
  assert.match(body('decReconcile'), /r\.changed\.length \? `선택지 글이 바뀌어 고른 것을 지웠어요/, '글이 바뀐 고름은 이름을 알리고 지운다');
  assert.match(body('decReconcile'), /toast\(notes\.join\(/, '토스트는 앞 것을 덮으므로 두 알림을 한 번에 보인다');
  assert.match(body('sendLine'), /note: r\.note/, '고쳐 고름 표지를 붙여 넣었으면 결과 줄에 알린다');
  assert.match(body('sendBox'), /res\.phase === 'inserted' \? [^\n]*res\.note \? [^\n]*esc\(res\.note\)/, '넣은 결과 줄이 서버 note를 이스케이프해 보인다');
});

test('answer body: the drawn signature, picks and comments by id — the server composes; the shown sentence rides only as expect on send', () => {
  const body = D.answerBody('sig1', new Map([['a', 'C']]), new Map([['a', '코멘트']]));
  assert.deepEqual(body, { sig: 'sig1', picks: { a: 'C' }, comments: { a: '코멘트' } });
  assert.ok(!('line' in body) && !('text' in body) && !('expect' in body));
  // send는 「보낼 문장」 칸에 보인 문장을 expect로 붙인다. 서버는 그것을 넣지 않고 자기 문장과 같은지만 본다
  const sent = D.answerBody('sig1', new Map([['a', 'A']]), new Map(), '현황판 결정 응답: 1) 가 → A 나');
  assert.equal(sent.expect, '현황판 결정 응답: 1) 가 → A 나');
});

test('send waits for the preview: the button is off while a preview is pending and the page sends the shown sentence as expect', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(body('sendLine'), /!dec\.preview \|\| dec\.preview\.pending/, '미리보기가 없거나 기다리는 중이면 넣지 않는다');
  assert.match(body('sendLine'), /postAnswer\('send', shown\)/, '보인 문장을 expect로 보낸다');
  assert.ok(body('sendLine').indexOf('dec.preview.pending') < body('sendLine').indexOf("postAnswer('send'"), '기다림 검사가 보내기보다 앞이다');
  // 입력 이벤트가 클릭보다 먼저 와서 schedulePreview가 pending으로 그리므로, 버튼은 미리보기를 기다리는 동안 꺼져 있다
  assert.match(body('schedulePreview'), /dec\.preview = dec\.picks\.size \? \{ pending: true \} : null;\n  renderDecide\(\);/);
  assert.match(body('sendBox'), /const ready = !!\(p && !p\.pending/);
});

test('index.html: the decision section sits right under 「지금」 and outside it, so the per-second repaint of 「지금」 never touches a comment being typed', async () => {
  const html = await read('../public/index.html');
  assert.match(html, /<section class="now" id="now"[^>]*><\/section>\s*<section class="decide" id="decide"[^>]*>/);
  assert.match(html, /<div id="decide-list"><\/div>/);
  assert.match(html, /<div class="send" id="decide-send"[^>]*><\/div>/);
});

test('app.js: posts ids and keys with the page token, shows the server sentence, never presses Enter, and keeps comment typing out of repaints', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(app, /const DEC = globalThis\.AgentDeckDecide \|\| null;/);
  assert.match(body('postAnswer'), /'X-Dashboard-Token': BOOT\.token/);
  assert.match(body('postAnswer'), /DEC\.answerBody\(/);
  assert.match(body('postAnswer'), /'\/api\/answer\/' \+/);
  assert.doesNotMatch(app, /--enter|\\r'|'\\n'\s*\+\s*line/, 'Enter를 붙이는 길이 없다');
  assert.match(body('sendLine'), /r\.copy/, '넣지 못하면 복사로 간다');
  assert.match(body('handNow'), /DEC\.decisionHand\(/, '결정이 「내 손이 필요한 일」·알림음·배지에 들어간다');
  assert.doesNotMatch(body('renderNow'), /renderDecide/, '「지금」을 다시 칠할 때 결정 카드는 다시 그리지 않는다');
  assert.match(body('renderDecide'), /listKey/, '목록이 그대로면 카드를 다시 칠하지 않는다');
  assert.match(body('renderDecide'), /restoreFocus|selectionStart/, '다시 칠하면 입력 중인 칸과 커서를 되돌린다');
  assert.match(app, /addEventListener\('input'/);
  assert.match(body('applySnapshot'), /decReconcile\(prevDecisions\)/, '목록이 바뀌면 고른 답을 새 목록에 맞춘다');
  assert.match(body('render'), /renderDecide/, '스냅샷마다 결정 영역을 판단한다(같으면 칠하지 않는다)');
  assert.doesNotMatch(app, /\.innerHTML = [^;]*dec\.comments/, '코멘트는 innerHTML로 꽂지 않는다(이스케이프한 value 속성만)');
  // 문장은 서버의 응답에서만 온다(r.line). 페이지에 문장을 짓는 코드가 없다
  assert.doesNotMatch(app, /현황판 결정 응답:/);
});

test('app.js: the decision board joins the change keys and its own area; canType decides whether the insert button shows', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(body('sigMap'), /m\.set\('decisions'/);
  assert.match(app, /decisions\)\$\/\.test\(k\) \? 'decide'|k === 'decisions' \? 'decide'/);
  assert.match(body('sendBox'), /answer\?\.canType/);
  assert.match(body('sendBox'), /메인 입력창에 넣기/);
  assert.match(body('sendBox'), /복사/);
});

test('styles.css: decision cards reuse the existing tokens — yellow for the user, no new colours, both themes', async () => {
  const css = await read('../public/styles.css');
  const start = css.indexOf('/* ---------- 결정 응답');
  assert.ok(start > 0, '결정 응답 절이 있다');
  const block = css.slice(start, css.indexOf('/* ----------', start + 10) > 0 ? css.indexOf('/* ----------', start + 10) : undefined);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, '색은 토큰으로만 쓴다');
  assert.match(block, /var\(--todo/);
  assert.match(block, /\.dec-opt\[aria-pressed="true"\]/);
  assert.match(block, /@container dash \(width < 720px\)/);
  assert.doesNotMatch(block, /--inset/, '라이트 테마에 다시 정의되지 않은 토큰은 쓰지 않는다');
});
