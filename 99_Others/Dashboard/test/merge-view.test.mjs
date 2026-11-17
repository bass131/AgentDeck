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
});
