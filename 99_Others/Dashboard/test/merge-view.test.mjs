// M07 G9 병합 카드의 화면 쪽: chime.js의 전역 AgentDeckMerge(순수 판단)와 app.js·index.html·styles.css 배선.
// 「꼭 볼 것」 펼침 게이트는 화면 쪽이다 — 주소를 직접 부르면 건너뛰므로, 확인 창이 같은 파일 이름을 한 번 더 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../public/chime.js';
import { judgeHand } from '../lib/progress.mjs';

const M = globalThis.AgentDeckMerge;
const SHA = 'f4e0ff3812cde4caf1585a73ac77d3f9836bc2dd';
const read = async p => (await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const bodyOf = src => name => { const at = src.indexOf(`function ${name}(`); assert.ok(at >= 0, name); return src.slice(at, src.indexOf('\n}\n', at)); };
const view = (over = {}) => ({ number: 75, headSha: SHA, canMerge: true, mustSee: [{ path: 'CLAUDE.md', patch: '@@' }, { path: '.claude/x', patch: null, diffUrl: 'https://github.com/o/r/pull/75/files#diff-1' }], ...over });

test('the merge module is frozen, pure and separate from the other modules', () => {
  assert.ok(Object.isFrozen(M));
  for (const other of [globalThis.AgentDeckChime, globalThis.AgentDeckView, globalThis.AgentDeckDecide]) assert.notEqual(M, other);
  for (const fn of ['pendingPr', 'fileKey', 'mergeGate', 'patchRows', 'parsePrInput', 'checkState', 'resultLine', 'shortSha']) assert.equal(typeof M[fn], 'function', fn);
});

test('gate: the button stays off until every must-see file of this PR and head SHA was opened, and only when the server says it can merge', () => {
  const v = view(), k = p => M.fileKey(75, SHA, p);
  assert.deepEqual(M.mergeGate(v, new Set()), { ready: false, total: 2, left: 2, why: '꼭 볼 것 2개 가운데 2개를 아직 펼치지 않았어요' });
  assert.equal(M.mergeGate(v, new Set([k('CLAUDE.md')])).left, 1);
  assert.deepEqual(M.mergeGate(v, new Set([k('CLAUDE.md'), k('.claude/x')])), { ready: true, total: 2, left: 0, why: null });
  // 다른 SHA·다른 PR에서 펼친 것은 세지 않는다
  assert.equal(M.mergeGate(v, new Set([M.fileKey(75, 'b'.repeat(40), 'CLAUDE.md'), M.fileKey(76, SHA, '.claude/x')])).left, 2);
  assert.equal(M.mergeGate(view({ mustSee: [] }), new Set()).ready, true, '꼭 볼 것이 없으면 바로 켜진다');
  const all = new Set([k('CLAUDE.md'), k('.claude/x')]);
  assert.equal(M.mergeGate(view({ canMerge: false }), all).ready, false, '서버 판정이 먼저다');
  assert.equal(M.mergeGate(v, all, { running: true }).ready, false, '병합 중에는 끈다');
  assert.equal(M.mergeGate(v, all, { spent: true }).ready, false, '한 번 보낸 SHA는 다시 읽기 전까지 끈다');
  assert.match(M.mergeGate(v, all, { spent: true }).why, /다시 읽기/);
  assert.equal(M.mergeGate(null, all).ready, false);
  assert.equal(M.mergeGate(view({ mustSee: null }), all).ready, false, '모양이 이상하면 끈다');
});

test('pending PR: the merge hand item carries the PR number from the goal header; the page reads that field, not the sentence', () => {
  const hand = judgeHand({ phases: { status: 'ok', format: 'goal', items: [], current: null, record: null,
    goal: { statusWord: '병합 대기', status: '병합 대기 (PR 75)', closed: false, ref: { path: 'g.md' } } } });
  assert.equal(hand[0].id, 'merge'); assert.equal(hand[0].pr, 75);
  assert.equal(M.pendingPr(hand), 75);
  assert.equal(M.pendingPr([{ id: 'merge', say: 'PR 75의 병합을 기다려요', pr: null }]), null, '문장에서 번호를 뽑지 않는다');
  assert.equal(M.pendingPr([{ id: 'ask', pr: 3 }]), null);
  assert.equal(M.pendingPr(null), null);
});

test('PR input, short SHA, check states and result lines', () => {
  for (const [s, n] of [['75', 75], [' #75 ', 75], ['PR 75', null], ['0', null], ['-3', null], ['1.5', null], ['', null], ['99999999999', null]]) assert.equal(M.parsePrInput(s), n, s);
  assert.equal(M.shortSha(SHA), 'f4e0ff3'); assert.equal(M.shortSha(null), '');
  assert.deepEqual(['success', 'pending', 'failure', 'missing', 'weird'].map(r => M.checkState(r).kind), ['done', 'current', 'stopped', 'waiting', 'waiting']);
  assert.equal(M.resultLine({ ok: true, status: 'merged', message: '병합했어요', mergeSha: SHA }).level, 'ok');
  for (const status of ['cancelled', 'refused', 'failed', 'unknown', 'timeout', 'enqueued']) assert.equal(M.resultLine({ ok: status === 'enqueued', status, message: 'm' }).level, 'todo', status);
  assert.match(M.resultLine({ ok: false, status: 'cancelled', message: '확인 창에서 병합하지 않았어요' }).text, /확인 창/);
});

test('patch rows: added, removed, hunk and context lines keep their text (escaping is the page\'s job)', () => {
  assert.deepEqual(M.patchRows('@@ -1,2 +1,2 @@\n a\n-<b>\n+c\n\\ No newline at end of file'),
    [{ kind: 'hunk', text: '@@ -1,2 +1,2 @@' }, { kind: 'ctx', text: ' a' }, { kind: 'del', text: '-<b>' }, { kind: 'add', text: '+c' }, { kind: 'ctx', text: '\\ No newline at end of file' }]);
  assert.deepEqual(M.patchRows(null), []);
});

test('app.js: the merge card posts with the page token, keeps its own area, and never stores opened files in the page storage', async () => {
  const app = await read('../public/app.js'), body = bodyOf(app);
  assert.match(app, /const MRG = globalThis\.AgentDeckMerge \|\| null;/);
  assert.match(body('postMerge'), /'\/api\/merge\/' \+ kind/);
  assert.match(body('postMerge'), /'X-Dashboard-Token': BOOT\.token/);
  assert.match(body('render'), /renderMerge/, '스냅샷마다 판단한다(같으면 칠하지 않는다)');
  assert.doesNotMatch(body('renderNow'), /renderMerge/, '「지금」의 초 단위 다시 칠하기가 카드를 건드리지 않는다');
  assert.match(body('renderMerge'), /mg\.cardKey/, '카드 내용이 그대로면 다시 칠하지 않는다(펼친 diff가 접히지 않는다)');
  assert.match(body('mergeFiles'), /data-merge-file=/);
  assert.doesNotMatch(body('mergeFiles'), /fold\(|data-id=/, '꼭 볼 것은 접기 상태 저장(localStorage)을 타지 않는다');
  assert.match(body('mergeFiles'), /data-merge-link/, 'patch가 없으면 GitHub 파일 diff 링크');
  assert.match(body('mergeFiles'), /rel="noopener noreferrer"/);
  assert.match(body('mergeFiles'), /esc\(row\.text\)/, 'diff 글은 이스케이프한다');
  assert.match(body('mergeAction'), /MRG\.mergeGate\(/);
  assert.match(body('mergeAction'), /data-merge-run\$\{gate\.ready \? '' : ' disabled'\}/, '게이트가 열리지 않으면 버튼이 꺼진다');
  assert.match(body('mergeAction'), /바탕화면의 확인 창에서 병합을 눌러 주세요/);
  assert.match(body('runMerge'), /MRG\.mergeGate\(/, '누를 때 한 번 더 본다');
  assert.match(body('markOpened'), /mg\.opened\.add\(MRG\.fileKey\(/);
  assert.doesNotMatch(app, /store\.set\([^)]*mg\./, '펼친 기록은 메모리에만 둔다');
  assert.match(app, /closest\('\[data-merge-link\]'\)/);
  assert.match(app, /dataset\?\.mergeFile/, '접힘 diff를 펼치면 본 것으로 친다');
  assert.match(body('handBlock'), /href="#merge"/, '병합 대기 항목이 카드를 가리킨다');
  // 단추 배선: 불러오기·번호 칸 Enter·다시 읽기·병합. 병합 대기 PR은 번호가 바뀔 때 한 번만 저절로 불러온다
  for (const sel of ['data-merge-load', 'data-merge-reload', 'data-merge-run']) assert.match(app, new RegExp(`closest\\('\\[${sel}\\]'\\)`), sel);
  assert.match(app, /e\.key === 'Enter' && e\.target\?\.matches\?\.\('\[data-merge-num\]'\)/);
  assert.match(body('renderMerge'), /MRG\.pendingPr\(/);
  assert.match(body('renderMerge'), /want !== mg\.autoFor/, '스냅샷마다가 아니라 번호가 바뀔 때만');
  assert.match(body('loadMerge'), /seq !== mg\.seq/, '늦게 온 앞 읽기는 버린다');
  assert.match(body('runMerge'), /mg\.spent = true/, '보낸 SHA는 다시 읽기 전까지 다시 못 누른다');
  assert.match(body('mergeBox'), /createElement\('section'\)/, '서버를 다시 켜기 전 옛 index.html에서도 영역을 만든다');
  assert.match(body('mergeToggled'), /m\.patch != null/, 'patch 없는 파일은 접힘을 펼쳐도 본 것이 아니다 — 링크를 눌러야 한다');
  assert.match(body('loadMerge'), /mg\.view = null; mg\.error =/, '읽기에 실패하면 옛 머리 SHA 카드를 남기지 않는다');
  assert.match(body('mergeAction'), /if \(!mg\.pr\) return '';/, '읽기에 실패해도 번호가 있으면 「다시 읽기」가 남는다');
  assert.match(body('mergeCard'), /https:\\\/\\\/github\\\.com\\\//, 'PR 주소는 GitHub 주소일 때만 링크로 단다');
  assert.match(app, /쓰기는 결정 응답\(메인 입력창에 글 넣기\)과 병합 카드\(확인 창을 거친 PR 병합\)뿐입니다/);
});

// ── 열린 PR 목록 (M07 G11) ── 목록은 요약만 보이고, 필수 검사·「꼭 볼 것」·병합 단추는 고른 PR 하나의 카드에서만 판정한다.
// 시험은 이스케이프 함수를 베끼지 않고 app.js의 실제 esc를 꺼내 쓴다(PR 79 검수 중요 2). 따옴표가 빠지면 아래 단정이 깨진다
const APP_SRC = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const pageEsc = new Function(`return ${APP_SRC.match(/^const esc = (s => .+);$/m)[1]}`)();

test("the page escaper (app.js esc) covers & < > \" ' — list titles land inside a title attribute", () => {
  assert.equal(pageEsc(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('review fixes (PR 79): a pending PR missing from the list re-reads it; a card SHA that differs from its row re-reads it; picking while the window is up says why', () => {
  const b = bodyOf(APP_SRC);
  assert.match(b('renderMerge'), /want && mg\.list\?\.ok && !mg\.list\.items\.some\(i => i\.number === want\)/, '병합 대기 PR이 목록에 없으면 목록을 다시 읽는다');
  assert.match(b('renderMerge'), /void loadPrList\(\)/);
  assert.match(b('renderMerge'), /mg\.listMissFor !== want/, '같은 번호로는 한 번만 다시 읽는다(스냅샷마다 gh를 부르지 않게)');
  assert.match(b('loadMerge'), /row && row\.sha !== r\.pr\.headSha/, '카드 SHA와 목록 행 SHA가 다르면 목록을 다시 읽는다');
  assert.match(b('pickFromList'), /if \(mg\.running\) \{ toast\('확인 창을 먼저 닫아 주세요\.'\); return; \}/);
  assert.match(b('renderPrList'), /먼저 연 PR부터/, '목록 머리에 순서(번호 오름차순)를 알린다');
});

test('list rows put the short SHA before the branch names so a long head branch cannot clip it', () => {
  const html = M.prListHtml([item(9, { headRef: 'dependabot/npm_and_yarn/' + 'x'.repeat(80) })], { esc: pageEsc });
  const meta = html.slice(html.indexOf('mg-row-meta'));
  assert.ok(meta.indexOf(M.shortSha(SHA)) < meta.indexOf('dependabot/'), 'SHA가 브랜치 이름보다 앞');
  assert.match(meta, /<code class="inline mg-row-sha">/);
  assert.match(meta, /<span class="mg-row-br">/);
});

test('styles.css: in a row the SHA keeps its width and only the branch names shrink', async () => {
  const css = await read('../public/styles.css');
  assert.match(css, /\.mg-row-meta\{display:flex;[^}]*min-width:0/);
  assert.match(css, /\.mg-row-sha\{flex:none\}/);
  assert.match(css, /\.mg-row-br\{[^}]*min-width:0;[^}]*overflow:hidden;[^}]*text-overflow:ellipsis/);
});
const item =(n, over = {}) => ({ number: n, title: `PR ${n}`, baseRef: 'master', headRef: `feat/x-${n}`, sha: SHA, draft: false, author: 'bass131', updatedAt: '2026-11-18T00:08:22Z', ...over });

test('list helpers are on the frozen merge module', () => {
  for (const fn of ['prListHtml', 'pickedPr']) assert.equal(typeof M[fn], 'function', fn);
  assert.equal(M.LIST_SCROLL_AFTER, 3);
});

test('list HTML: rows escape every server string with the page escaper; draft badge; short SHA; base ← head', () => {
  const html = M.prListHtml([item(7, { title: '<img src=x onerror=alert(1)>', headRef: 'a"b<c', baseRef: "m'n", author: '<b>', draft: true })], { esc: pageEsc });
  assert.doesNotMatch(html, /<img|<b>|a"b|m'n/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /a&quot;b&lt;c/);
  assert.match(html, /#7/);
  assert.match(html, /f4e0ff3/); assert.doesNotMatch(html, new RegExp(SHA + '<'), '목록의 SHA는 짧게(전체는 title)');
  assert.match(html, /m&#39;n<\/code> ← <code class="inline">a&quot;b&lt;c/);
  assert.match(html, />초안</);
  assert.doesNotMatch(M.prListHtml([item(8)], { esc: pageEsc }), /초안/);
  assert.match(html, /<button type="button"[^>]*data-merge-pick="7"/, '항목은 키보드로 누를 수 있는 단추다');
  assert.throws(() => M.prListHtml([item(1)], {}), TypeError, '이스케이프 함수 없이 그리지 않는다');
});

test('list HTML: more than three rows scroll inside the list; three or fewer do not; empty is one calm line', () => {
  assert.doesNotMatch(M.prListHtml([1, 2, 3].map(n => item(n)), { esc: pageEsc }), /is-scroll/);
  assert.match(M.prListHtml([1, 2, 3, 4].map(n => item(n)), { esc: pageEsc }), /class="mg-list is-scroll"/);
  assert.match(M.prListHtml([], { esc: pageEsc }), /열린 PR이 없어요/);
  assert.doesNotMatch(M.prListHtml([], { esc: pageEsc }), /<ul/);
  // 번호가 정수가 아닌 항목은 그리지 않는다(서버가 이미 거르지만 화면도 한 번 더)
  assert.match(M.prListHtml([null, { number: '5' }, { number: 1.5 }], { esc: pageEsc }), /열린 PR이 없어요/);
  assert.doesNotMatch(M.prListHtml([null, item(3), item(4), { number: 'x' }, item(5)], { esc: pageEsc }), /is-scroll/, '그릴 수 있는 항목 수로 센다');
});

test('list HTML: only the picked row is marked (aria-current and a class)', () => {
  const html = M.prListHtml([1, 2, 3].map(n => item(n)), { esc: pageEsc, picked: 2 });
  assert.equal((html.match(/aria-current="true"/g) || []).length, 1);
  assert.match(html, /class="mg-row is-picked" data-merge-pick="2" aria-current="true"/);
  assert.doesNotMatch(M.prListHtml([1, 2].map(n => item(n)), { esc: pageEsc, picked: 9 }), /aria-current/);
});

test('picked row: the PR in the card wins; with an empty card the goal\'s pending PR is the first pick when it is in the list', () => {
  const items = [item(75), item(76)];
  assert.equal(M.pickedPr(items, 76, 75), 76, '카드에 연 PR');
  assert.equal(M.pickedPr(items, 12, 75), null, '카드의 PR이 목록에 없으면(닫힌 PR 등) 아무 항목도 고르지 않는다');
  assert.equal(M.pickedPr(items, null, 75), 75, '병합 대기 PR이 처음 고른 항목');
  assert.equal(M.pickedPr(items, null, 12), null);
  assert.equal(M.pickedPr(items, null, null), null);
  assert.equal(M.pickedPr(null, 75, 75), null);
});

test('app.js: the list sits at the top of the merge area, picks load the card the same way as the number input, and is re-read after a merge', async () => {
  const app = await read('../public/app.js'), body = bodyOf(app);
  const sk = app.slice(app.indexOf('const MERGE_SKELETON'), app.indexOf('function mergeBox('));
  assert.ok(sk.indexOf('id="merge-list"') > 0 && sk.indexOf('id="merge-list"') < sk.indexOf('id="merge-card"'), '목록이 카드 위');
  assert.match(sk, /data-merge-num/, '번호 칸은 남는다');
  assert.match(sk, /목록에 없는 PR/, '번호 칸은 목록에 없는 PR(닫힌 PR 등)을 위한 것이다');
  assert.match(body('mergeBox'), /#merge-list/, '목록 자리가 없는 옛 뼈대면 다시 깐다');
  assert.match(body('loadPrList'), /postMerge\('list', \{\}\)/);
  assert.match(body('loadPrList'), /seq !== mg\.listSeq/, '늦게 온 앞 목록은 버린다');
  assert.match(body('renderPrList'), /MRG\.prListHtml\(/);
  assert.match(body('renderPrList'), /esc\b/, '페이지의 이스케이프 함수를 넘긴다');
  assert.match(body('renderPrList'), /MRG\.pickedPr\(/);
  assert.match(body('renderPrList'), /scrollTop/, '다시 칠해도 목록 스크롤 자리를 지킨다');
  assert.match(body('renderPrList'), /focus\(/, '다시 칠해도 누른 항목에 초점이 남는다');
  assert.match(body('renderMerge'), /renderPrList\(/);
  assert.match(body('renderPrList'), /MRG\.pendingPr\(SUM\(\)\.hand\)/, '카드가 비었으면 병합 대기 PR이 처음 고른 항목');
  assert.match(body('renderPrList'), /data-merge-list-reload/);
  assert.match(body('renderPrList'), /번호로는 그대로 불러올 수 있어요/, '목록을 못 읽어도 번호 칸과 카드는 그대로 쓴다');
  assert.doesNotMatch(body('loadPrList'), /setTimeout|setInterval/, '실패해도 저절로 다시 읽지 않는다');
  assert.match(body('renderMerge'), /mg\.listAsked/, '처음 그릴 때 한 번 읽는다');
  assert.match(body('runMerge'), /loadPrList\(\)/, '병합 결과 뒤 목록을 다시 읽는다');
  assert.match(app, /closest\('\[data-merge-pick\]'\)/);
  assert.match(app, /closest\('\[data-merge-list-reload\]'\)\) \{ if \(!mg\.listLoading\) void loadPrList\(\)/, '읽는 중에는 겹쳐 읽지 않는다');
  assert.match(body('pickFromList'), /if \(mg\.running\) \{ toast\([^)]*\); return; \}\n  void loadMerge\(n, true\)/, '확인 창이 떠 있는 동안 카드를 바꾸지 않고(이유를 알린다), 번호 칸과 같은 길로 부른다');
  assert.doesNotMatch(body('pickFromList'), /headSha|\.sha\b/, '목록의 SHA는 보이기만 한다 — 병합에 쓰는 SHA는 읽기에서 온다');
});

test('index.html: the merge area sits between the decision requests and the hand list', async () => {
  const html = await read('../public/index.html');
  const d = html.indexOf('id="decide"'), m = html.indexOf('id="merge"'), b = html.indexOf('id="brief"');
  assert.ok(d > 0 && m > d && b > m);
});

test('styles.css: the merge card uses the existing tokens only — no new colours, sizes or weights', async () => {
  const css = await read('../public/styles.css');
  const start = css.indexOf('/* ---------- 병합 카드');
  assert.ok(start > 0, '병합 카드 절이 있다');
  const end = css.indexOf('/* ----------', start + 10);
  const block = css.slice(start, end > 0 ? end : undefined);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/, '색은 토큰으로만');
  assert.doesNotMatch(block, /font-size:\s*[\d.]+px|font-weight:\s*\d+/);
  assert.match(block, /var\(--todo/, '사용자가 할 일은 노랑');
  assert.match(block, /@container dash \(width < 720px\)/);
  assert.match(block, /\.mg-act \[disabled\]\{[^}]*cursor:not-allowed/, '꺼진 병합 단추는 꺼져 보인다');
  assert.ok(!block.includes('/api/'), '주석에 경로를 쓰지 않는다(별표·빗금이 주석을 일찍 닫을 수 있다)');
  // 열린 PR 목록(G11): 항목 3개 높이를 넘으면 목록 안에서만 세로 스크롤한다. 고른 항목은 노랑 테두리로 남는다
  assert.match(block, /\.mg-list\.is-scroll\{[^}]*max-height:calc\(var\(--mg-row\) \* 3[^}]*overflow-y:auto/);
  assert.match(block, /\.mg-list\.is-scroll\{[^}]*overscroll-behavior:contain/, '목록 끝에서 페이지가 따라 스크롤되지 않는다');
  assert.match(block, /\.mg-row\{[^}]*height:var\(--mg-row\)/, '항목 높이가 고정이라 세 개 높이가 정확하다');
  assert.match(block, /\.mg-list\{[^}]*grid-template-columns:minmax\(0,1fr\)/, '긴 제목·브랜치는 줄임표로 접히고 항목 폭을 넓히지 않는다');
  assert.match(block, /\.mg-row\[aria-current="true"\]\{[^}]*var\(--todo\)/);
});

// ── 닫힌 PR 정리 (M07 G15) ── 병합되거나 닫힌 PR의 큰 카드가 병합 영역을 차지하지 않는다.
const openList = (...nums) => ({ ok: true, more: false, items: nums.map(n => item(n)) });
test('card fate: an auto card whose PR is no longer the pending one is dropped; a manual card is kept', () => {
  assert.equal(M.cardFate({ cardPr: 86, manual: false, pending: null, list: openList() }), 'drop', 'goal이 더는 그 PR을 기다리지 않는다');
  assert.equal(M.cardFate({ cardPr: 86, manual: false, pending: 87, list: openList(87) }), 'drop');
  assert.equal(M.cardFate({ cardPr: 86, manual: false, pending: 86, list: openList(86) }), 'keep');
  assert.equal(M.cardFate({ cardPr: 86, manual: true, pending: null, list: openList(86) }), 'keep', '사람이 번호로 연 카드는 말없이 내리지 않는다');
  assert.equal(M.cardFate({ cardPr: null, manual: false, pending: null }), 'keep', '카드가 없으면 할 일이 없다');
  assert.equal(M.cardFate({ cardPr: 86, manual: false, pending: null, running: true }), 'keep', '확인 창이 떠 있는 동안은 카드를 바꾸지 않는다');
});
test('card fate: an open card missing from a freshly read, complete list is re-read once (it may have been merged elsewhere)', () => {
  assert.equal(M.cardFate({ cardPr: 86, manual: true, pending: null, list: openList(), open: true }), 'reread');
  assert.equal(M.cardFate({ cardPr: 86, manual: false, pending: 86, list: openList(85), open: true }), 'reread');
  assert.equal(M.cardFate({ cardPr: 86, manual: true, pending: null, list: { ...openList(), more: true }, open: true }), 'keep', '50개를 넘겨 잘린 목록은 증거가 아니다');
  assert.equal(M.cardFate({ cardPr: 86, manual: true, pending: null, list: { ok: false }, open: true }), 'keep', '목록을 못 읽었으면 증거가 아니다');
  assert.equal(M.cardFate({ cardPr: 86, manual: true, pending: null, list: openList(), open: false }), 'keep', '이미 닫힌 카드로 읽었으면 다시 읽지 않는다');
});
test('closed line: merged and closed-without-merge read differently; an open PR has no line', () => {
  assert.equal(M.closedLine(view({ number: 86, state: 'closed', merged: true })), '#86 PR은 병합됐어요. 할 일이 없어 카드를 줄였어요.');
  assert.equal(M.closedLine(view({ number: 86, state: 'closed', merged: false })), '#86 PR은 병합 없이 닫혔어요. 할 일이 없어 카드를 줄였어요.');
  assert.equal(M.closedLine(view({ state: 'open' })), null);
  assert.equal(M.closedLine(null), null);
});
test('app.js: renderMerge drops or re-reads by cardFate; a closed card is one line with a close button and no merge button', () => {
  const b = bodyOf(APP_SRC);
  assert.match(b('renderMerge'), /MRG\.cardFate\(/);
  assert.match(b('renderMerge'), /fate === 'drop'\) dropCard\(\)/);
  assert.match(b('renderMerge'), /mg\.rereadFor !== /, '같은 목록 읽기로는 한 번만 다시 읽는다');
  assert.match(b('mergeCard'), /MRG\.closedLine\(v\)/);
  assert.match(b('mergeCard'), /data-merge-close/);
  assert.match(b('mergeAction'), /v && v\.state !== 'open'\) return ''/, '닫힌 PR에는 병합 단추를 그리지 않는다');
  assert.match(b('dropCard'), /mg\.seq\+\+/, '늦게 온 읽기가 내린 카드를 되살리지 않는다');
  assert.match(APP_SRC, /closest\('\[data-merge-close\]'\)\) \{ if \(!mg\.running\) \{ dropCard\(\); renderMerge\(\); \} return; \}/);
  for (const fn of ['cardFate', 'closedLine']) assert.equal(typeof M[fn], 'function', fn);
});
test('app.js: dropping a card clears the PR number and the manual mark, so the next pending PR loads on its own', () => {
  const d = bodyOf(APP_SRC)('dropCard');
  assert.match(d, /pr: null, view: null/);
  assert.match(d, /manual: false/);
  assert.match(d, /result: null/, '내린 카드의 병합 결과 줄도 함께 지운다');
});
test('app.js: the merge summary says merged or closed for a closed card instead of the merge conditions', () => {
  assert.match(bodyOf(APP_SRC)('renderMerge'), /mg\.view\.state !== 'open' \? \(mg\.view\.merged \? '병합됐어요' : '병합 없이 닫혔어요'\)/);
});
