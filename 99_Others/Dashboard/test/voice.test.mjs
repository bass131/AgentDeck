import test from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { collect, readTail } from '../lib/collector.mjs';
import { judgeFlow, parseHookTail, parsePin, shortSession, splitSentences } from '../lib/markdown.mjs';
import { HOOK_PHRASES, hookPhrase, parseOverview, parseVoice } from '../lib/phrases.mjs';
import { fakeGit, fixture, NOW } from './helpers.mjs';

const io = (overrides = {}) => ({ readFile: fsp.readFile, readdir: fsp.readdir, stat: fsp.stat, tail: readTail, ...overrides });
const failing = (suffix, code = 'ENOENT') => ({
  readFile: async (file, enc) => { if (path.normalize(file).endsWith(path.normalize(suffix))) throw Object.assign(new Error('x'), { code }); return fsp.readFile(file, enc); },
});

test('sentences: split at sentence ends only; backticks, brackets and numbering stay whole; no text is lost', () => {
  const text = '**Phase 1 진행 중** (2026-11-11) — 문답이 끝났습니다. 안건 1은 「맞아. 그래」, `a. b`는 그대로입니다. 1. 번호 뒤는 나누지 않는다 (괄호. 안도) 끝? 마지막';
  const parts = splitSentences(text);
  assert.deepEqual(parts, ['**Phase 1 진행 중** (2026-11-11) — 문답이 끝났습니다.', '안건 1은 「맞아. 그래」, `a. b`는 그대로입니다.', '1. 번호 뒤는 나누지 않는다 (괄호. 안도) 끝?', '마지막']);
  assert.equal(parts.join(' '), text);
  assert.deepEqual([splitSentences(''), splitSentences(null), splitSentences('한 문장')], [[], [], ['한 문장']]);
  const pin = parsePin('## 좌표\n- 상태: 하나입니다. 둘입니다.\n## 마감 요약\n- 바뀐 것: 가. 나.\n');
  assert.deepEqual([pin.coord.items[0].parts, pin.summary.changed.parts], [['하나입니다.', '둘입니다.'], ['가.', '나.']]);
});

test('voice file: 「## 마일스톤」 and 「## Phase N」 sections, known labels only, first line wins', () => {
  const v = parseVoice('# 제목\n- 한 줄: 절 밖은 읽지 않는다\n## 마일스톤\n- 한 줄: 고치고 있습니다.\n- 목표: 목표입니다: 콜론 포함\n- 한 줄: 둘째\n- 모름: x\n## Phase 2\n- 이름: 둘\n- 진행 중: 하는 중\n- 완료: 끝\n- 시작 전 필요: 답\n- 끝나면: 다음\n## Phase 흐름\n- 이름: 아님\n## Phase 10\n- 이름: 열\n');
  assert.deepEqual(v.milestone, { sectionLine: 3, line: { text: '고치고 있습니다.', line: 4 }, goal: { text: '목표입니다: 콜론 포함', line: 5 } });
  assert.deepEqual([v.phases[2].name.text, v.phases[2].doing.text, v.phases[2].done.text, v.phases[2].need.text, v.phases[2].after.text], ['둘', '하는 중', '끝', '답', '다음']);
  assert.deepEqual(Object.keys(v.phases), ['2', '10']);
  assert.deepEqual(parseVoice('본문만\n'), { milestone: null, phases: {} });
});

test('overview fallback: first paragraph of 「## 사람용 개요」 as sentences; null without the section', () => {
  const o = parseOverview('# T\n\n## 사람용 개요\n\n첫 문장입니다.\n둘째 문장입니다. 셋째입니다.\n\n다음 문단은 읽지 않는다.\n## 개요\n');
  assert.deepEqual(o, { line: 5, sentences: ['첫 문장입니다.', '둘째 문장입니다.', '셋째입니다.'] });
  assert.equal(parseOverview('# T\n## 개요\n본문\n'), null);
  assert.equal(parseOverview('## 사람용 개요\n\n## 다음\n'), null);
});

test('hook dictionary: exact rule first, then hook|verdict, otherwise no sentence', () => {
  assert.deepEqual(hookPhrase({ hook: 'cmd-guard', verdict: 'deny', rule: 'rm-재귀' }), { say: '폴더째 지우는 명령을 막았습니다.', level: 'block', hookName: '위험 명령 검사' });
  assert.equal(hookPhrase({ hook: 'cmd-guard', verdict: 'deny', rule: '새-규칙' }).say, '위험 명령 검사가 명령을 막았습니다.');
  assert.equal(hookPhrase({ hook: 'cmd-guard', verdict: 'allow', rule: null }).level, 'ok');
  assert.deepEqual(hookPhrase({ hook: 'new-hook', verdict: 'allow', rule: 'r' }), { say: null, level: null, hookName: null });
  assert.deepEqual(hookPhrase({ hook: 'tdd-guard', verdict: '모르는-판정', rule: null }), { say: null, level: null, hookName: '테스트 동반 검사' });
  for (const [key, [say, level]] of Object.entries(HOOK_PHRASES)) {
    assert.match(say, /[다]\.$/, key);
    assert.ok(['ok', 'note', 'block', 'quiet'].includes(level), key);
    if (/\|(deny|block)(\||$)/.test(key)) assert.equal(level, 'block', key);
  }
});

test('hook tail: session, short id, sub-agent flag and per-session tally', () => {
  const line = o => JSON.stringify(o);
  const h = parseHookTail([
    line({ ts: '2026-11-11T09:00:00+09:00', hook: 'cmd-guard', verdict: 'allow', session: 'b989a371-aa91-4684-be26-c1d2e4905e4f', agent_id: null, role: 'main' }),
    line({ ts: '2026-11-11T09:01:00+09:00', hook: 'tdd-guard', verdict: 'deny', session: 'b989a371-aa91-4684-be26-c1d2e4905e4f', agent_id: 'a1', role: 'worker', evidence: { file: 'src/a.mjs' } }),
    line({ ts: '2026-11-11T09:02:00+09:00', hook: 'cmd-guard', verdict: 'allow', session: 'synthetic-m03-p1-pointer' }),
    line({ ts: '2026-11-11T09:03:00+09:00', hook: 'cmd-guard', verdict: 'allow' }),
  ].join('\n') + '\n');
  assert.deepEqual(h.entries.map(e => [e.sessionShort, e.sub, e.role]), [['b989', false, 'main'], ['b989', true, 'worker'], ['synthetic-m03-…', false, null], [null, false, null]]);
  assert.equal(h.entries[1].detail, 'src/a.mjs');
  assert.deepEqual(h.sessions.map(s => [s.short, s.lines, s.deny, s.lastAt, s.roles]), [
    [null, 1, 0, '2026-11-11T09:03:00+09:00', []], ['synthetic-m03-…', 1, 0, '2026-11-11T09:02:00+09:00', []], ['b989', 2, 1, '2026-11-11T09:01:00+09:00', ['main', 'worker']]]);
  assert.equal(shortSession(''), null);
});

test('flow: commit tokens first, then the pin sentence, then records; stop wins over everything', () => {
  const rec = (pass, fail = 0, since = 0) => ({ section: true, pass, fail, userInput: 0, failSinceUserInput: since });
  const items = [{ num: 1, state: 'recorded', record: rec(3) }, { num: 2, state: 'recorded', record: rec(1) }, { num: 3, state: 'empty', record: rec(0) }, { num: 10, state: 'empty', record: rec(0) }];
  const flows = r => r.items.map(p => p.flow);
  const commits = [{ hash: 'c2', subject: 'docs: M03-P10 메모' }, { hash: 'c1', subject: 'feat(m03-p1): 첫 단계' }, { hash: 'c0', subject: 'feat(M02-P2): 다른 마일스톤' }];
  const byCommit = judgeFlow(items, { milestoneId: 'M03', commits, pinPhase: 1 });
  assert.deepEqual([byCommit.basis, byCommit.current, flows(byCommit)], ['commit', 2, ['done', 'current', 'waiting', 'done']]);
  assert.deepEqual([byCommit.items[0].commit.hash, byCommit.items[1].commit, byCommit.items[3].commit.hash], ['c1', null, 'c2']);
  const allDone = judgeFlow(items.slice(0, 1), { milestoneId: 'M03', commits });
  assert.deepEqual([allDone.current, flows(allDone)], [null, ['done']]);
  const byPin = judgeFlow(items, { milestoneId: 'M03', commits: null, pinPhase: 3 });
  assert.deepEqual([byPin.basis, byPin.current, flows(byPin)], ['pin', 3, ['done', 'done', 'current', 'waiting']]);
  const byRecord = judgeFlow(items, { milestoneId: null, commits, pinPhase: 99 });
  assert.deepEqual([byRecord.basis, byRecord.current, flows(byRecord)], ['record', 2, ['done', 'current', 'waiting', 'waiting']]);
  const empty = judgeFlow(items.map(p => ({ ...p, record: rec(0) })), {});
  assert.deepEqual([empty.basis, empty.current], ['record', 1]);
  const stopped = judgeFlow([{ num: 1, state: 'stopped', record: rec(0, 3, 3) }, items[1]], { milestoneId: 'M03', commits: [] });
  assert.deepEqual([stopped.current, flows(stopped)], [1, ['stopped', 'waiting']]);
});

test('fixture snapshot carries voice, focus, flow and hook sentences read from the sources', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit(), io: io() });
  assert.deepEqual([vm.voice.status, vm.voice.path], ['ok', '01_Milestones/M02_Test/00_현황판-문장.md']);
  assert.deepEqual([vm.voice.milestone.line.text, vm.voice.milestone.goal.text, vm.voice.milestone.after], ['시험용 저장소를 고치고 있습니다.', '판독 규칙을 고정하는 것입니다.', undefined]);
  assert.deepEqual([vm.voice.phases[1].done.text, vm.voice.phases[2].doing.text, vm.voice.phases[2].need.text, vm.voice.phases[3]], ['첫 단계를 마쳤습니다.', '둘째 단계를 하고 있습니다: 콜론이 더 있어도 된다.', '사용자의 답이 필요합니다.', undefined]);
  assert.deepEqual(vm.voice.overview.sentences, ['시험용 계획이에요.']);
  assert.deepEqual([vm.phases.basis, vm.phases.current, vm.phases.milestoneId, vm.phases.pinPhase, vm.phases.pinDisagrees], ['commit', 2, 'M02', 2, false]);
  assert.deepEqual(vm.phases.items.map(p => [p.num, p.flow, p.commit?.hash ?? null]), [[1, 'done', 'abc1234'], [2, 'stopped', null], [3, 'waiting', null]]);
  assert.deepEqual([vm.focus.current, vm.focus.nextPhase, vm.focus.pinNext.text, vm.focus.pinState.parts], [2, 3, '사용자에게 묻기 이어지는 줄도 같은 항목이다', ['**Phase 2 멈춤** (2026-11-11) — 사용자 판단 대기']]);
  assert.equal(vm.worktree.log, undefined);
  assert.deepEqual(vm.hooks.entries.map(e => [e.say, e.level]), [
    ['위험 명령 검사가 명령을 통과시켰습니다.', 'ok'], ['폴더째 지우는 명령을 막았습니다.', 'block'], ['마감 요약을 새로 쓰지 않아 세션 종료를 막았습니다.', 'block'],
    ['테스트 파일을 고쳐서, 테스트 없이 고친 횟수를 0으로 되돌렸습니다.', 'quiet'], ['원격 저장소에 올리는 명령이라 사용자 승인을 물었습니다.', 'note']]);
  assert.equal(vm.rules.denyFreshMinutes, 10);
});

test('no voice file: 「없음」 with the overview fallback, never invented sentences; other blocks stay ok', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit(), io: io(failing('00_현황판-문장.md')) });
  assert.deepEqual([vm.voice.status, vm.voice.milestone, vm.voice.phases, vm.voice.overview.sentences], ['absent', null, {}, ['시험용 계획이에요.']]);
  assert.equal(vm.sources.find(s => s.id === 'voice').status, 'absent');
  for (const id of ['pointer', 'milestone', 'pin', 'phases', 'ledger', 'hooks']) assert.equal(vm[id].status, 'ok', id);
  const broken = await collect(fixture, { now: NOW, git: fakeGit(), io: io(failing('00_현황판-문장.md', 'EACCES')) });
  assert.equal(broken.voice.status, 'failed');
});

test('without readable commits the flow falls back to the pin sentence, and says which basis it used', async () => {
  const noLog = await collect(fixture, { now: NOW, git: fakeGit({ log: null }), io: io() });
  assert.deepEqual([noLog.worktree.status, noLog.phases.basis, noLog.phases.current], ['ok', 'pin', 2]);
  assert.deepEqual(noLog.phases.items.map(p => p.flow), ['done', 'stopped', 'waiting']);
  const noGit = await collect(fixture, { now: NOW, git: fakeGit({ fail: 'status' }), io: io() });
  assert.deepEqual([noGit.worktree.status, noGit.phases.basis], ['failed', 'pin']);
  // pin이 「Phase 1 완료」라고 쓰면 그다음 Phase를 현재로 읽는다.
  const pinDone = '## 좌표\n\n- 상태: **Phase 1 완료** (2026-11-11) — 다음으로 넘어갑니다.\n';
  const donePin = await collect(fixture, { now: NOW, git: fakeGit({ log: null }), io: io({ readFile: async (file, enc) => path.normalize(file).endsWith('01_Work_Pin.md') ? pinDone : fsp.readFile(file, enc) }) });
  assert.deepEqual([donePin.phases.basis, donePin.phases.pinPhase, donePin.phases.current, donePin.phases.pinDisagrees], ['pin', 2, 2, false]);
  const noPin = await collect(fixture, { now: NOW, git: fakeGit({ log: null }), io: io(failing('01_Work_Pin.md', 'EACCES')) });
  assert.deepEqual([noPin.phases.basis, noPin.phases.current, noPin.focus.pinNext], ['record', 2, null]);
});
