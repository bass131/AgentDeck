// 알림 판단(public/chime.js): 새 키만 울림, 새로고침 뒤 무음, 저장소 없음, 첫 스냅샷 무음, 탭 제목 배지, 조용함 줄의 5분 경계.
// chime.js는 app.js와 같은 classic script라 전역(AgentDeckChime)에 붙는다. 시험은 파일을 불러 그 전역을 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../public/chime.js';
import { judgeHand } from '../lib/progress.mjs';

const C = globalThis.AgentDeckChime;
const { chimeStep, createChimeMemory, readRung, handKeys, badgeTitle, quietMinutes, soundMark, soundBadge, stripHand, RUNG_KEY, RUNG_MAX } = C;

function mapStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => void data.set(k, String(v)) };
}
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };

test('the module is pure: no DOM, no audio, no page storage of its own; it hangs one frozen object on the global', async () => {
  const src = await readFile(new URL('../public/chime.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '');
  for (const word of ['document', 'window', 'AudioContext', 'localStorage', 'Audio(', 'import ', 'export ']) assert.ok(!code.includes(word), word);
  assert.ok(Object.isFrozen(C));
  assert.equal(RUNG_KEY, 'ad-dash-chimed');
  assert.equal(RUNG_MAX, 200);
});

// 화면 코드(app.js)는 브라우저에서만 돈다. 여기서는 배선만 글자로 확인한다 — 실제 동작은 docs/알림.md의 관찰 표지로 본다.
test('app.js wiring: reads the module from the global, notifies on every render and clock tick, never gates on reduced motion', async () => {
  // 작업 사본의 줄 끝이 CRLF일 수 있다
  const app = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  assert.match(app, /const CH = globalThis\.AgentDeckChime \|\| null;/);
  assert.match(app, /CH\.createChimeMemory\(pageStorage\(\)\)/);
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(body('render'), /notify\(now\)/, '스냅샷이 오면(탭이 숨어 있어도) 판정한다');
  assert.match(body('beat'), /notify\(now\)/, '시계가 fresh 만료를 탭 제목에 반영한다');
  for (const fn of ['notify', 'chime', 'playChime']) assert.doesNotMatch(body(fn), /reduceMotion|moving\(\)|document\.hidden/, fn);
  assert.ok(!app.includes("'ad-dash-chimed'"), '저장 키는 chime.js만 안다');
});

test('app.js sound state: setSound is the only writer of the marker after a chime, and every path goes through it', async () => {
  const app = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(body('setSound'), /CH\.soundMark\(state\)/);
  assert.match(body('setSound'), /CH\.soundBadge\(state\)/);
  assert.equal((app.match(/d\.chimeBlocked = /g) || []).length, 1, '표지는 setSound 한 곳에서만 쓴다');
  for (const [fn, state] of [['chime', 'pending'], ['playChime', 'blocked'], ['playChime', 'on'], ['playChime', 'unsupported'], ['soundOn', 'on'], ['primeSound', 'on'], ['probeSound', 'blocked']])
    assert.match(body(fn), new RegExp(`setSound\\([^)]*'${state}'`), `${fn} → ${state}`);
  assert.match(app, /\nprobeSound\(\);\n/, '페이지를 열 때 한 번 재 본다');
});

test('app.js placement: the strip carries the hand line, the hand head carries the sound badge, the quiet line has its own shape', async () => {
  const app = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(body('renderStrip'), /CH\?\.stripHand\(/);
  assert.match(body('renderStrip'), /class="mini-hand is-\$\{/);
  assert.match(body('renderStrip'), /<span>\$\{esc\(h\.say\)\}<\/span>/, '띠의 손 줄은 원문 문장을 이스케이프해 그대로 쓴다');
  // 「지금 하는 일」 알약의 모양: 손 줄이 따로 있으면 회색 점(중립), 없으면 예전대로 손 수준의 모양(없음=초록 ✓)
  assert.match(body('renderStrip'), /\$\{h \? G\.quiet : G\[HAND_G\[lv\]\]\}/, '종결·모두 마침 옆에 진행 중 고리를 달지 않는다');
  assert.match(body('handBlock'), /soundState\(\)/);
  assert.match(body('handBlock'), /soundChip\(\)/);
  assert.match(body('notesNow'), /kind: 'quiet'/);
  // 줄 종류마다의 모양(조용함 회색 시계 · 주의 노랑 세모 · 깨짐 빨강 네모)은 test/m11-g5-dom.test.mjs가 jsdom에서 본다(M11 G5, Backlog 71)
  assert.match(app, /const CLOCK = svg\(/);
  assert.doesNotMatch(body('notesNow'), /조용해요[^\n]*G\.note/, '조용함 줄은 노랑 세모(할 일·주의)를 쓰지 않는다');
});

test('styles: the sound chip, the strip hand line and the quiet line use only the existing colour meanings', async () => {
  const css = (await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const rule = sel => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]*\\}`)) || [''])[0];
  assert.match(rule('.sound-chip'), /var\(--todo-text\)/, '소리 켜기는 노랑(사용자가 할 일)');
  assert.doesNotMatch(rule('.sound-chip'), /--broken/, '빨강 멈춤과 다르다');
  assert.match(rule('.mini-hand.is-todo'), /var\(--todo/);
  assert.match(rule('.mini-hand.is-stop'), /var\(--broken\)/);
  assert.match(rule('.q-notes .is-quiet'), /var\(--ink-3\)/);
  assert.doesNotMatch(rule('.q-notes .is-quiet'), /--todo|--broken/, '조용함 줄은 회색(쉼)');
});

test('docs/알림.md names the storage key, the observation markers app.js writes, and README links to it', async () => {
  const [doc, readme, app] = await Promise.all(['../docs/알림.md', '../README.md', '../public/app.js'].map(p => readFile(new URL(p, import.meta.url), 'utf8')));
  assert.ok(doc.includes(`\`${RUNG_KEY}\``));
  for (const [attr, prop] of [['data-chime-count', 'chimeCount'], ['data-chime-last', 'chimeLast'], ['data-chime-blocked', 'chimeBlocked']]) {
    assert.ok(doc.includes(attr), attr);
    assert.match(app, new RegExp(`d\\.${prop} = `), prop);
  }
  assert.ok(readme.includes('(docs/알림.md)'));
  for (const text of [doc, readme]) assert.ok(text.split('\n').length <= 250);
});

test('the first snapshot is silent: what is already shown counts as rung and is remembered', () => {
  const storage = mapStorage();
  const memory = createChimeMemory(storage);
  assert.deepEqual(memory.see(['merge:PR51', 'ask:t1']), []);
  assert.deepEqual(JSON.parse(storage.data.get(RUNG_KEY)), ['merge:PR51', 'ask:t1']);
  assert.deepEqual(memory.see(['merge:PR51', 'ask:t1']), []);
});

test('an empty first snapshot is remembered too, so the first real item rings', () => {
  const storage = mapStorage();
  const memory = createChimeMemory(storage);
  assert.deepEqual(memory.see([]), []);
  assert.equal(storage.data.get(RUNG_KEY), '[]');
  assert.deepEqual(memory.see(['merge:PR51']), ['merge:PR51']);
  // 새로 연 페이지도 기억이 있으니(빈 목록) 첫 스냅샷이 아니다
  assert.deepEqual(createChimeMemory(mapStorage({ [RUNG_KEY]: '[]' })).see(['x']), ['x']);
});

test('only new keys ring, two at once ring together, and nothing rings twice', () => {
  const memory = createChimeMemory(mapStorage());
  memory.see(['a']);
  assert.deepEqual(memory.see(['a', 'b']), ['b']);
  assert.deepEqual(memory.see(['a', 'b']), []);
  assert.deepEqual(memory.see(['a', 'b', 'c', 'd']), ['c', 'd']);
  // 사라졌다가 같은 키로 돌아오면 같은 사실이라 조용하다
  assert.deepEqual(memory.see([]), []);
  assert.deepEqual(memory.see(['a']), []);
});

test('a reload remembers what rang; an item that came while the page was closed rings on the next load', () => {
  const storage = mapStorage();
  const before = createChimeMemory(storage);
  before.see(['a']);
  assert.deepEqual(before.see(['a', 'b']), ['b']);
  assert.deepEqual(createChimeMemory(storage).see(['a', 'b']), [], '새로고침 뒤 무음');
  const later = createChimeMemory(storage);
  assert.deepEqual(later.see(['a', 'b', 'c']), ['c']);
  // 같은 현황판의 다른 탭이 이미 울린 키는 이 탭에서 조용하다
  const other = createChimeMemory(storage);
  other.see(['a', 'b', 'c']);
  assert.deepEqual(later.see(['a', 'b', 'c', 'd']), ['d']);
  assert.deepEqual(other.see(['a', 'b', 'c', 'd']), []);
});

test('without storage, or with storage that throws, the page remembers while open and a reload is silent', () => {
  for (const storage of [null, undefined, blocked]) {
    const memory = createChimeMemory(storage);
    assert.deepEqual(memory.see(['a']), []);
    assert.deepEqual(memory.see(['a', 'b']), ['b']);
    assert.deepEqual(memory.see(['b']), []);
    assert.deepEqual(createChimeMemory(storage).see(['a', 'b', 'c']), []);
  }
});

test('stored data that is not a list of keys counts as nothing remembered, and is replaced', () => {
  for (const raw of ['{', '{"a":1}', '[1,2]', 'null']) {
    const storage = mapStorage({ [RUNG_KEY]: raw });
    assert.equal(readRung(storage), null, raw);
    assert.deepEqual(createChimeMemory(storage).see(['a']), [], raw);
    assert.deepEqual(readRung(storage), ['a'], raw);
  }
});

test('the remembered keys keep the newest 200', () => {
  const many = Array.from({ length: RUNG_MAX }, (_, i) => `k${i}`);
  const step = chimeStep(many, ['k0', 'new']);
  assert.deepEqual(step.ring, ['new']);
  assert.deepEqual(step.rung, [...many.slice(1), 'new']);
  assert.deepEqual(chimeStep(null, ['x', 'x']), { ring: [], rung: ['x'] });
});

test('hand keys: shown items in order, without repeats or items that carry no key', () => {
  assert.deepEqual(handKeys([{ key: 'a' }, { key: 'b' }, { key: 'a' }, { id: 'old' }, null, { key: '' }]), ['a', 'b']);
  assert.deepEqual(handKeys(null), []);
});

test('the same fact from judgeHand never rings twice; the same step number in the next goal rings', () => {
  const goal = (doc, statusWord = '실행 중') => ({ status: 'ok', format: 'goal', current: 7, record: { section: true, failSinceUserInput: 0, userInput: 0, last: null },
    items: [{ num: 7, label: '7', flow: 'current', name: '커밋, push, PR 생성, 병합 승인 요청', ref: { path: doc, line: 30 } }],
    goal: { status: statusWord, statusWord, closed: false, waitingUser: false, ref: { path: doc, line: 3 } } });
  const keys = doc => handKeys(judgeHand({ phases: goal(doc) }));
  const memory = createChimeMemory(mapStorage({ [RUNG_KEY]: '[]' }));
  assert.deepEqual(memory.see(keys('H4.md')), ['merge-step:H4.md:7']);
  assert.deepEqual(memory.see(keys('H4.md')), []);
  assert.deepEqual(memory.see(keys('H5.md')), ['merge-step:H5.md:7']);
});

test('tab title badge: (N) for shown items, (!N) when one of them is a stop, the plain title when none', () => {
  const base = 'AgentDeck 현황판';
  assert.equal(badgeTitle(base, []), base);
  assert.equal(badgeTitle(base, null), base);
  assert.equal(badgeTitle(base, [{ level: 'todo' }]), '(1) AgentDeck 현황판');
  assert.equal(badgeTitle(base, [{ level: 'todo' }, { level: 'stop' }]), '(!2) AgentDeck 현황판');
});

// 알림음 상태 하나가 관찰 표지(data-chime-blocked)와 「내 손이 필요한 일」 머리 아래 작은 표시를 함께 정한다
test('sound state: one value drives the data-chime-blocked marker and the small badge; pending keeps what is shown', () => {
  assert.deepEqual(['on', 'blocked', 'pending', 'unsupported'].map(soundMark), ['0', '1', 'pending', 'unsupported'], '표지 값의 뜻은 H4와 같다');
  assert.equal(soundMark('모름'), null);
  assert.deepEqual(soundBadge('on'), { state: 'on', text: '알림음 켜짐', title: '새 항목이 들어오면 알림음이 한 번 나요' });
  assert.equal(soundBadge('blocked').state, 'blocked');
  assert.equal(soundBadge('blocked').text, '알림음 막힘');
  assert.equal(soundBadge('unsupported').text, '알림음 없음');
  // 판정 중(최대 0.3초)이거나 아직 모르면 표시를 바꾸지 않는다 — 깜빡임도, 확인 전 「켜짐」도 없다
  assert.equal(soundBadge('pending'), null);
  assert.equal(soundBadge(undefined), null);
});

test('strip hand line: the first shown item, a stop first when there is one, and how many more', () => {
  assert.equal(stripHand([]), null);
  assert.equal(stripHand(null), null);
  assert.deepEqual(stripHand([{ level: 'todo', say: 'PR 52의 병합을 승인해 주세요.' }]), { level: 'todo', say: 'PR 52의 병합을 승인해 주세요.', more: 0, to: '#brief' });
  assert.deepEqual(stripHand([{ level: 'todo', say: '가' }, { level: 'stop', say: '나' }, null]), { level: 'stop', say: '나', more: 1, to: '#brief' });
});

// H8: 「내 손」 목록은 결정 요청 밑(#brief)으로 옮겼고, 결정 항목은 「결정 요청」 카드(#decide)에만 보인다.
// 그래서 띠의 손 줄은 고른 항목이 결정이면 카드로, 아니면 「내 손」 목록으로 간다(#now는 이제 큰 카드뿐이다).
test('strip hand line: jumps to the decision cards for a decision item, to the hand list otherwise', async () => {
  const app = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.equal(stripHand([{ key: 'decision:x', level: 'todo', say: '결정' }, { key: 'merge:52', level: 'todo', say: '병합' }]).to, '#decide');
  assert.equal(stripHand([{ key: 'merge:52', level: 'todo', say: '병합' }, { key: 'decision:x', level: 'todo', say: '결정' }]).to, '#brief');
  assert.equal(stripHand([{ key: 'decision:x', level: 'todo', say: '결정' }, { key: 'stop:2', level: 'stop', say: '멈춤' }]).to, '#brief', '멈춤이 이기면 멈춤 항목이 있는 목록으로');
  assert.match(body('renderStrip'), /class="mini-hand is-\$\{h\.level\}" href="\$\{h\.to\}"/);
});

test('quiet line: minutes only after more than 5 minutes past the stop, measured by the page clock', () => {
  const at = '2026-11-11T10:00:00+09:00', t = Date.parse(at), q = { at, after: 5 };
  assert.equal(quietMinutes(q, t + 5 * 60000), null, '꼭 5분은 아직 아니다');
  assert.equal(quietMinutes(q, t + 5 * 60000 + 1), 5);
  assert.equal(quietMinutes(q, t + 12.5 * 60000), 12);
  assert.equal(quietMinutes(q, t - 60000), null);
  assert.equal(quietMinutes({ at }, t + 6 * 60000), 6, 'after가 없으면 5분');
  assert.deepEqual([quietMinutes(null, t), quietMinutes({ at: '시각 아님', after: 5 }, t + 1e9)], [null, null]);
});
