// M11 G5 읽기 묶음: 마일스톤 목록(44), 병합 대기 줄과 GitHub 상태(61), 진척 표시 낡음(62), Orca 소식(63),
// 답을 받아 적은 USER-INPUT 줄(M10-24), 메인 터미널 찾기에서 worker 빼기(M07-35).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import '../public/chime.js';
import { collect, readTail } from '../lib/collector.mjs';
import { judgeGoal, userInputAnswered } from '../lib/markdown.mjs';
import { judgeHand } from '../lib/progress.mjs';
import { findMainTerminal, pickMain, psArgs } from '../lib/deliver.mjs';
import { INBOX_TYPES, inboxArgs, parseInbox, readInbox, validInboxHandle } from '../lib/inbox.mjs';
import { loadConfig } from '../lib/config.mjs';
import { createDashboard } from '../server.mjs';
import { fakeGit, NOW } from './helpers.mjs';

const goalRepo = fileURLToPath(new URL('./fixtures/goal-repo/', import.meta.url));
const DIR = '01_Milestones/M09_Goals';
const norm = p => path.normalize(p).toLowerCase();
const dirent = name => ({ name, isDirectory: () => true, isSymbolicLink: () => false });
// 고정 입력 폴더 위에 가짜 파일을 얹는다. 시험은 파일을 쓰지 않는다
function overlay(root, files, planFile = '10_Goal-G1-진행-중.md') {
  const abs = rel => norm(path.join(root, ...rel.split('/')));
  const byAbs = new Map(Object.entries(files).map(([rel, text]) => [abs(rel), text]));
  const dirs = new Map();
  for (const rel of Object.keys(files)) { const parts = rel.split('/'); for (let i = 1; i < parts.length; i++) { const d = abs(parts.slice(0, i).join('/')); (dirs.get(d) || dirs.set(d, new Set()).get(d)).add(parts[i]); } }
  return { stat: fsp.stat, tail: readTail,
    readFile: async (f, enc) => norm(f).endsWith(norm('gate-config.json')) ? JSON.stringify({ planPath: `${DIR}/${planFile}`, workPinPath: `${DIR}/01_Work_Pin.md` })
      : byAbs.has(norm(f)) ? byAbs.get(norm(f)) : fsp.readFile(f, enc),
    readdir: async (d, opts) => {
      let real = [];
      try { real = await fsp.readdir(d, opts); } catch (e) { if (!dirs.has(norm(d))) throw e; }
      const extra = [...(dirs.get(norm(d)) || [])].filter(n => !real.some(r => (r.name ?? r) === n));
      return [...real, ...extra.map(n => opts?.withFileTypes ? dirent(n) : n)];
    } };
}

// ── 44 ──
test('[M11-G5 44] the milestone list reads the spec, the single goal file or the goal documents when there is no _MilestonePreview.md', async () => {
  const io = overlay(goalRepo, {
    '01_Milestones/M11_Spec/00_마일스톤-스펙.md': '# M11 — Backlog 정리 · 마일스톤 스펙\n\n- 작성: 2026-11-20 · 상태: 합의(2026-11-20 15:06)\n\n## 목표\n',
    '01_Milestones/M04_One/00_Goal.md': '# M04 — Goal Loop · 목표지향 루프 개편\n\n- 마일스톤: M04 (요청) · 작성: 2026-11-13 · 상태: 종결 — PR 36 병합\n',
    '01_Milestones/M05_Goals/10_Goal-G1-하나.md': '# M05 G1 — 하나\n\n- 마일스톤: M05 · 상태: 종결 (PR 1)\n',
    '01_Milestones/M05_Goals/20_Goal-G2-둘.md': '# M05 G2 — 둘\n\n- 마일스톤: M05 · 상태: 실행 중\n',
    '01_Milestones/M05_Goals/11_G1-보고서.md': '# M05 G1 — 보고서\n\n- 작성: 2026-11-13\n',
  });
  const vm = await collect(goalRepo, { now: NOW, git: fakeGit(), io });
  const by = Object.fromEntries(vm.milestones.items.map(m => [m.name, m]));
  assert.deepEqual([by.M11_Spec.state, by.M11_Spec.title, by.M11_Spec.statusText, by.M11_Spec.path],
    ['ok', 'M11 — Backlog 정리 · 마일스톤 스펙', '합의(2026-11-20 15:06)', '01_Milestones/M11_Spec/00_마일스톤-스펙.md']);
  assert.deepEqual([by.M04_One.state, by.M04_One.statusText, by.M04_One.path], ['ok', '종결 — PR 36 병합', '01_Milestones/M04_One/00_Goal.md']);
  assert.deepEqual([by.M05_Goals.state, by.M05_Goals.goals], ['goals', { total: 2, closed: 1 }], '상태가 있는 goal 문서만 센다');
  // 실제 고정 입력: goal 문서 다섯 장 중 종결 한 장
  assert.deepEqual([by.M09_Goals.state, by.M09_Goals.goals, by.M09_Goals.current], ['goals', { total: 5, closed: 1 }, true]);
});

// ── M10-24 ──
// 실제 goal 문서의 USER-INPUT 줄(2026-08~11)을 표로 쓴다. 답을 적은 줄이라는 표지가 있을 때만 「받은 답」이고, 기다림 표지가 있으면 기다림이다.
const ANSWERED = [
  '사용자가 「마감」이라고 답했다(코디네이터 세션 b989a371 · HEAD afcbdaf). 재검수의 남은 반례는 Backlog 35번으로 넘긴다.',
  'goal 합의 문답 한 번(안건 넷)에 사용자가 전부 추천안으로 답했다: 「초안대로 진행」, 「이 경계 맞음」.',
  'FAIL 2회째에서 방향을 물었고, 사용자가 「push는 허용으로 가되 작업별로 브랜치를 나눠서 컨트롤」으로 답했다(결정 대장 [USER] 줄).',
  '완료조건 ②의 처리를 사용자에게 물었다(조건 문구 고치기 / 하네스부터 결정적으로). 사용자가 「하네스부터 결정적으로」를 골랐다.',
  '사용자가 셋 다 추천안을 골랐다: 「goal 셋으로 분할」, 패널 toolgroup은 「패널에도 보여 준다」.',
  '사용자 답: P5는 「포커스된 패널만 순환」, 패널 `/clear`는 「이번에 패널 지우기 추가」.',
  '선택지형 문답 네 안건을 냈고, 사용자는 `state-race` 안건에만 「깨지는 부분도 같이 고치기」로 답했다.',
  '사용자 결정 「테스트 고치기」: 상속된 환경 변수에 흔들리는 시험을 G7 범위에 더한다(결정 대장 `[USER]`).',
  'Windows 알림 실관찰: 메인이 일부러 만든 「진행 불가」(13:03:40) 때 사용자가 Windows 알림이 뜬 것을 눈으로 봤다고 답했다(「봤어」).',
  'Step 6 AD-02 수리 방안 사용자 확정: 두 안을 각 trade-off와 함께 제시했다.',
  '[USER] 마일스톤 완주 기동 승인: Phase 1 본워커부터 Phase 5까지의 워커 기동을 일괄 승인한다.',
];
const WAITING = [
  '헌법 7조에 따라 전진을 멈추고 사용자 판단을 기다린다(코디네이터 세션 b989a371 · HEAD afcbdaf). 물을 것: 마감할지, 한 번 더 수리할지.',
  '순환 처리 방식을 사용자에게 묻는다. 안건은 둘이다.',
  'G9 분할 여부, 패널 toolgroup 표시(R3)를 사용자에게 묻는다. 답이 올 때까지 구현하지 않는다.',
  '범위 변경 판단 대기. 가드에 현황판 시험 경로를 더하는 판정 장치 Step을 이 goal에 넣을지 사용자에게 묻는다.',
  '반영 뒤 빌드본으로 앱 리허설을 다시 하려 했다. 진행 방법은 사용자 판단을 기다린다.',
  '독립 검수 차단 1: 헌법 11조대로 범위 변경이라 멈추고 사용자 판단을 묻는다(스펙에 더하기 또는 시험 변경 되돌리기).',
  '사용자가 앞 안건에 답했다. 다음 안건의 답을 기다린다.',
  '수용 판정 확인 요청 2건: ① 33의 절 제거, ② settings 병합 직후 훅 핫로드.',
  '',
];
test('[M11-G5 M10-24] a USER-INPUT line that records the answer is not a wait; anything else still is', () => {
  for (const t of ANSWERED) assert.equal(userInputAnswered(t), true, t);
  for (const t of WAITING) assert.equal(userInputAnswered(t), false, t);
  const steps = [{ mark: '>', flow: 'current', label: '1', name: 'a' }];
  const rec = text => ({ section: true, pass: 1, fail: 0, userInput: 1, failSinceUserInput: 0, last: { marker: 'USER-INPUT', text, file: 'g.md', line: 9 } });
  assert.equal(judgeGoal(steps, rec(ANSWERED[0])).waitingUser, false);
  assert.equal(judgeGoal(steps, rec(WAITING[0])).waitingUser, true);
  const hand = text => { const g = judgeGoal(steps, rec(text));
    return judgeHand({ phases: { status: 'ok', format: 'goal', items: g.items, current: g.current, record: rec(text), goal: { ...g, ref: { path: 'g.md' } } }, ledger: null, hooks: null }); };
  assert.deepEqual(hand(ANSWERED[0]).map(h => h.id), [], '답을 받아 적은 줄은 「내 손」 항목이 아니다');
  assert.deepEqual(hand(WAITING[0]).map(h => h.id), ['question']);
});

// ── 62 ──
const load = (file, git) => collect(goalRepo, { now: NOW, git, io: overlay(goalRepo, {}, file) });
test('[M11-G5 62] a goal doc whose last commit is behind the branch while its [>] stays says the progress mark may be stale', async () => {
  const stale = await load('10_Goal-G1-진행-중.md', fakeGit({ docLog: 'd0c1234', after: 3 }));
  assert.deepEqual(stale.phases.goal.stale, { after: 3, commit: 'd0c1234' });
  const git = fakeGit({ docLog: 'd0c1234', after: 3 });
  await load('10_Goal-G1-진행-중.md', git);
  assert.ok(git.calls.some(a => a.join(' ') === `log -1 --format=%h -- ${DIR}/10_Goal-G1-진행-중.md`), '읽기 전용 log로 문서의 마지막 커밋을 묻는다');
  assert.ok(git.calls.some(a => a.join(' ') === 'rev-list --count d0c1234..HEAD'));
  assert.equal((await load('10_Goal-G1-진행-중.md', fakeGit({ docLog: 'd0c1234', after: 0 }))).phases.goal.stale, null, '그 뒤 커밋이 없으면 낡지 않았다');
  assert.equal((await load('20_Goal-G2-막-작성.md', fakeGit({ docLog: 'd0c1234', after: 3 }))).phases.goal.stale, null, '[>]가 없으면 말하지 않는다');
  assert.equal((await load('50_Goal-G5-종결.md', fakeGit({ docLog: 'd0c1234', after: 3 }))).phases.goal.stale, null, '종결이면 말하지 않는다');
  const dirty = fakeGit({ docLog: 'd0c1234', after: 3, status: ` M ${DIR}/10_Goal-G1-진행-중.md\0` });
  assert.equal((await load('10_Goal-G1-진행-중.md', dirty)).phases.goal.stale, null, '문서를 고치는 중(커밋 전)이면 말하지 않는다');
  const noLog = await load('10_Goal-G1-진행-중.md', fakeGit({ docLog: null, after: 3 }));
  assert.equal(noLog.phases.status, 'ok', 'git을 못 읽어도 단계는 읽는다');
  assert.equal(noLog.phases.goal.stale, null);
});

// ── 63 ──
const RUN = 'run:run_7b56ca5575c1', TERM = 'term_6f61a247-3d56-4361-9847-e78691fce9a1';
const full = (over = {}) => ({ id: 'msg_1', type: 'worker_done', from_handle: 'term_45b7ade8-e91f-4672-9372-c14a58a298fe', to_handle: RUN, subject: '현황 진단 완성', body: '긴 본문'.repeat(50), read: 1, created_at: '2026-11-16T23:14:27Z', ...over });
test('[M11-G5 63] Orca inbox: a configured term_ or run: handle, a read-only inbox call, three message kinds, newest few lines', async () => {
  assert.equal(validInboxHandle(TERM), TERM);
  assert.equal(validInboxHandle(RUN), RUN);
  for (const bad of [null, '', 'term_x', 'run:run_; rm', 'RUN:run_7b56', 42]) assert.equal(validInboxHandle(bad), null, String(bad));
  assert.deepEqual(inboxArgs(RUN), ['orchestration', 'inbox', '--terminal', RUN, '--limit', '20', '--full', '--json']);
  assert.ok(!inboxArgs(RUN).includes('check'), '읽음 표시를 바꾸는 check는 부르지 않는다');
  assert.deepEqual([...INBOX_TYPES], ['worker_done', 'escalation', 'question']);
  const out = JSON.stringify({ ok: true, result: { messages: [full({ id: 'a', created_at: '2026-11-16T23:14:27Z' }), full({ id: 'b', type: 'status' }),
    full({ id: 'c', type: 'escalation', subject: '멈춤\u0007<b>', created_at: '2026-11-17T01:00:00Z', read: 0 }), full({ id: 'd', type: 'question', created_at: '2026-11-15T00:00:00Z' })] } });
  const r = parseInbox(out);
  assert.deepEqual(r.items.map(m => [m.id, m.type, m.at]), [['c', 'escalation', '2026-11-17T01:00:00Z'], ['a', 'worker_done', '2026-11-16T23:14:27Z'], ['d', 'question', '2026-11-15T00:00:00Z']], '최근 것부터, 세 종류만');
  assert.equal(r.items[0].subject, '멈춤 <b>', '제어문자는 빈칸이 된다(이스케이프는 화면이 한다)');
  const bidi = String.fromCharCode(0x202e), ls = String.fromCharCode(0x2028);
  assert.equal(parseInbox(JSON.stringify({ ok: true, result: { messages: [full({ subject: `가${bidi}나${ls}다` })] } })).items[0].subject, '가 나 다', '글 방향 바꾸기·줄 구분 문자도 빈칸');
  assert.equal(r.items[0].unread, true);
  assert.ok(!JSON.stringify(r).includes('긴 본문'), '본문은 싣지 않는다');
  assert.equal(parseInbox(JSON.stringify({ ok: true, result: { messages: Array.from({ length: 9 }, (_, i) => full({ id: 'm' + i })) } })).items.length, 5, '최근 다섯 줄까지');
  assert.equal(parseInbox('nope'), null);
  // 실행: 셸 없이, 시간 제한. orca가 없으면 null(소식 절을 그리지 않는다), 그 밖의 실패는 failed
  const seen = [];
  const fake = (err, stdout) => (cmd, args, opts, cb) => { seen.push({ cmd, args, opts }); setImmediate(() => cb(err, stdout, '')); };
  const ok = await readInbox(RUN, { execFileFn: fake(null, out) });
  assert.deepEqual([ok.status, ok.items.length, seen[0].cmd, seen[0].opts.shell, seen[0].opts.windowsHide], ['ok', 3, 'orca', false, true]);
  assert.equal(await readInbox(RUN, { execFileFn: fake(Object.assign(new Error('spawn orca ENOENT'), { code: 'ENOENT' }), '') }), null);
  assert.equal((await readInbox(RUN, { execFileFn: fake(Object.assign(new Error('x'), { code: 1 }), '') })).status, 'failed');
});

test('[M11-G5 63] the server polls only when the inbox handle is set and puts the lines into the snapshot', async t => {
  const watchFn = () => Object.assign(new EventEmitter(), { close() {} });
  const collectFn = async (repo, o) => ({ schema: 'ad-dashboard/1', revision: o.revision, collectedAt: '2026-11-21T10:00:00+09:00', sources: [] });
  let calls = 0;
  const inboxFn = async handle => { calls++; return { status: 'ok', handle, items: [{ id: 'a', type: 'worker_done', subject: '끝', at: '2026-11-21T00:00:00Z', unread: false }] }; };
  const off = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null, inboxHandle: null }, { collectFn, watchFn, pingMs: 60000, inboxFn, findMain: null });
  t.after(() => off.close());
  assert.equal(calls, 0, '칸이 없으면 부르지 않는다');
  assert.equal(off.snapshot.inbox, null);
  const old = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null }, { collectFn, watchFn, pingMs: 60000, inboxFn, findMain: null });
  t.after(() => old.close());
  assert.deepEqual([calls, old.snapshot.inbox], [0, null], '칸이 없는 옛 설정도 그대로 뜬다');
  const odd = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null, inboxHandle: 'run:run_; rm -rf' }, { collectFn, watchFn, pingMs: 60000, inboxFn, findMain: null });
  t.after(() => odd.close());
  assert.equal(calls, 0, '형식이 아닌 handle은 설정 밖에서 넘어와도 부르지 않는다');
  const on = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null, inboxHandle: RUN }, { collectFn, watchFn, pingMs: 60000, inboxFn, inboxMs: 60000, findMain: null });
  t.after(() => on.close());
  assert.equal(calls, 1);
  assert.deepEqual(on.snapshot.inbox.items.map(m => m.id), ['a']);
  assert.ok(!JSON.stringify(on.snapshot).includes('run_7b56'), 'handle은 페이지에 싣지 않는다');
  await on.refresh();
  assert.deepEqual(on.snapshot.inbox.items.map(m => m.id), ['a'], '다시 수집해도 소식은 남는다');
  const broken = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null, inboxHandle: RUN }, { collectFn, watchFn, pingMs: 60000, inboxFn: async () => { throw new Error('boom'); }, inboxMs: 60000, findMain: null });
  t.after(() => broken.close());
  assert.deepEqual(broken.snapshot.inbox, { status: 'failed', items: [] }, '던져도 서버는 살고 「읽지 못함」이다');
  const gone = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null, inboxHandle: RUN }, { collectFn, watchFn, pingMs: 60000, inboxFn: async () => null, inboxMs: 60000, findMain: null });
  t.after(() => gone.close());
  assert.equal(gone.snapshot.inbox, null, 'orca가 없으면 절을 그리지 않는다');
  let subject = '하나';
  const ticking = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null, inboxHandle: RUN }, { collectFn, watchFn, pingMs: 60000, findMain: null, inboxMs: 15,
    inboxFn: async () => ({ status: 'ok', items: [{ id: 'a', type: 'question', subject, at: null, unread: true }] }) });
  t.after(() => ticking.close());
  const rev = ticking.snapshot.revision;
  await new Promise(r => setTimeout(r, 80));
  assert.equal(ticking.snapshot.revision, rev, '같은 소식이면 새 판을 내지 않는다');
  subject = '둘';
  await new Promise(r => setTimeout(r, 80));
  assert.equal(ticking.snapshot.inbox.items[0].subject, '둘');
  assert.ok(ticking.snapshot.revision > rev, '바뀐 소식은 새 판으로 민다');
  let late = 0;
  const shut = await createDashboard({ repoPath: 'C:/x', port: 0, mainTerminalHandle: null, inboxHandle: RUN }, { collectFn, watchFn, pingMs: 60000, findMain: null, inboxMs: 10, inboxFn: async () => { late++; return null; } });
  await shut.close();
  const at = late;
  await new Promise(r => setTimeout(r, 50));
  assert.equal(late, at, '닫으면 더 읽지 않는다');
});

test('[M11-G5 63] loadConfig validates inboxHandle and keeps it optional', async () => {
  const at = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  assert.equal((await loadConfig(at('config-handle.json'))).inboxHandle, null);
  assert.equal((await loadConfig(at('config-inbox.json'))).inboxHandle, RUN);
  assert.equal((await loadConfig(at('config-bad-inbox.json'))).inboxHandle, null);
  assert.equal((await loadConfig(new URL('../config.example.json', import.meta.url))).inboxHandle, null, '예시 설정은 칸을 보이되 비워 둔다');
});

// ── M07-35 ──
const H = n => `term_${String(n).padStart(8, '0')}-1111-4222-8333-444444444444`;
const T = (n, over = {}) => ({ handle: H(n), worktreePath: 'C:/Dev/AgentDeck', agentIdentity: 'claude', connected: true, writable: true, orphaned: false, tabId: `tab${n}`, leafId: `leaf${n}`, title: `제목 ${n}`, ...over });
const ps = (...agents) => ({ worktrees: [{ path: 'C:/Dev/AgentDeck', agents }] });
test('[M11-G5 M07-35] the main-terminal finder leaves out orchestration workers (agents[].parentPaneKey) and names the picked terminal', async () => {
  assert.deepEqual(psArgs(), ['worktree', 'ps', '--limit', '200', '--json']);
  const worker = { paneKey: 'tab2:leaf2', parentPaneKey: 'tab1:leaf1', agentType: 'claude' }, main = { paneKey: 'tab1:leaf1', parentPaneKey: null, agentType: 'claude' };
  // 메인이 닫히고 worker 하나만 남으면 넣지 않는다
  const onlyWorker = pickMain({ terminals: [T(2)] }, 'C:/Dev/AgentDeck', null, ps(worker));
  assert.equal(onlyWorker.handle, null);
  assert.match(onlyWorker.reason, /worker/);
  assert.deepEqual(pickMain({ terminals: [T(1), T(2)] }, 'C:/Dev/AgentDeck', null, ps(main, worker)), { handle: H(1), title: '제목 1' });
  // ps를 못 읽으면 예전처럼 terminal list만으로 고른다
  assert.deepEqual(pickMain({ terminals: [T(1)] }, 'C:/Dev/AgentDeck', null, null), { handle: H(1), title: '제목 1' });
  const seen = [];
  const replies = [JSON.stringify({ ok: true, result: { terminals: [T(1), T(2)], truncated: false } }), JSON.stringify({ ok: true, result: ps(main, worker) })];
  const opts = [];
  const fake = (cmd, args, o, cb) => { seen.push(args); opts.push([cmd, o]); const out = replies[seen.length - 1]; setImmediate(() => cb(null, out, '')); };
  assert.deepEqual(await findMainTerminal('C:\\Dev\\AgentDeck', null, { execFileFn: fake }), { handle: H(1), title: '제목 1' });
  assert.deepEqual(seen.map(a => a.slice(0, 2)), [['terminal', 'list'], ['worktree', 'ps']], '둘 다 읽기 전용 목록 명령이다');
  assert.deepEqual(opts.map(([c, o]) => [c, o.shell, o.windowsHide, o.timeout > 0]), [['orca', false, true, true], ['orca', false, true, true]], '셸 없이, 창 없이, 시간 제한');
  // 후보가 없으면 ps를 부르지 않는다
  seen.length = 0; replies[0] = JSON.stringify({ ok: true, result: { terminals: [], truncated: false } });
  assert.equal((await findMainTerminal('C:\\Dev\\AgentDeck', null, { execFileFn: fake })).handle, null);
  assert.equal(seen.length, 1);
});

// ── 61 ──
const M = globalThis.AgentDeckMerge;
const pending = (pr = 9) => ({ id: 'merge', key: 'merge:g.md', level: 'todo', say: `PR ${pr}의 병합을 기다려요`, source: 'goal 문서 머리말', pr });
const view = (over = {}) => ({ number: 9, state: 'open', merged: false, checks: [{ name: 'hard-gates', result: 'success' }], ...over });
test('[M11-G5 61] the hand line for the pending PR follows the PR the merge card read from GitHub', () => {
  const other = { id: 'stopped', key: 's', level: 'stop', say: '멈췄어요' };
  const same = M.mergeHand([pending(), other], view());
  assert.deepEqual(same.hand.map(h => [h.id, h.level]), [['merge', 'todo'], ['stopped', 'stop']]);
  assert.equal(same.note, null);
  const merged = M.mergeHand([pending(), other], view({ state: 'closed', merged: true }));
  assert.deepEqual(merged.hand.map(h => h.id), ['stopped'], '병합됐으면 병합을 부탁하지 않는다(알림음·배지에서도 빠진다)');
  assert.match(merged.note, /PR 9.*병합됐어요.*goal 문서 갱신만 남았어요/);
  const closed = M.mergeHand([pending()], view({ state: 'closed', merged: false }));
  assert.deepEqual([closed.hand.length, /병합 없이 닫혔어요/.test(closed.note)], [0, true]);
  const red = M.mergeHand([pending()], view({ checks: [{ name: 'hard-gates', result: 'failure' }, { name: 'x', result: 'success' }] }));
  assert.equal(red.hand[0].level, 'stop', 'CI 실패는 빨강');
  assert.match(red.hand[0].say, /필수 검사.*hard-gates.*실패/);
  assert.notEqual(red.hand[0].key, pending().key, '빨강으로 바뀌면 새 사실이라 한 번 울린다');
  assert.deepEqual(M.mergeHand([pending()], view({ number: 10, state: 'closed', merged: true })).hand.map(h => h.id), ['merge'], '다른 PR의 카드는 보지 않는다');
  assert.deepEqual(M.mergeHand([pending()], null).hand.map(h => h.id), ['merge']);
  const waiting = M.mergeHand([pending()], view({ checks: [{ name: 'hard-gates', result: 'pending' }, { name: 'other', result: 'failure' }] }));
  assert.deepEqual([waiting.hand[0].level, waiting.hand[0].key], ['todo', pending().key], '도는 중이거나 필수 아닌 검사의 실패는 그대로다');
  assert.deepEqual(M.mergeHand(null, view()), { hand: [], note: null });
});
