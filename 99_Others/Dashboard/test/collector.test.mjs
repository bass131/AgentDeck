import test from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { collect, readTail } from '../lib/collector.mjs';
import { READ_ONLY, gitRunner } from '../lib/git.mjs';
import { fakeGit, fixture, NOW } from './helpers.mjs';

const io = (overrides = {}) => ({ readFile: fsp.readFile, readdir: fsp.readdir, stat: fsp.stat, tail: readTail, ...overrides });
const failing = (suffix, code = 'EACCES') => ({
  readFile: async (file, enc) => { if (path.normalize(file).endsWith(path.normalize(suffix))) throw Object.assign(new Error('x'), { code }); return fsp.readFile(file, enc); },
});

test('fixture snapshot: every block is read from files and read-only git', async () => {
  const git = fakeGit();
  const vm = await collect(fixture, { now: NOW, git, io: io() });
  assert.equal(vm.schema, 'ad-dashboard/1');
  assert.deepEqual(vm.sources.filter(s => s.status !== 'ok'), []);
  assert.equal(vm.pointer.planPath, '01_Milestones/M02_Test/_MilestonePreview.md');
  assert.deepEqual([vm.milestone.title, vm.milestone.statusText], ['M02 — Test · 시험 마일스톤', '승인 완료 (2026-11-11) · Phase 2 진행']);
  assert.equal(vm.pin.summary.stamp.text, '2026-11-11T09:45:00+09:00');
  assert.equal(vm.pin.summary.watch.text, 'Phase 2의 FAIL 세 번.');
  assert.equal(vm.pin.coord.items[2].text, '사용자에게 묻기 이어지는 줄도 같은 항목이다');

  const [p1, p2, p3] = vm.phases.items;
  assert.deepEqual([p1.name, p1.goal, p1.state, p1.record.pass, p1.record.fail, p1.record.userInput, p1.record.failSinceUserInput], ['첫 단계', '첫 목표', 'recorded', 2, 1, 1, 0]);
  assert.deepEqual([p1.record.last.marker, p1.record.last.text, p1.ref.path], ['PASS', '마지막 통과', '01_Milestones/M02_Test/01_Phase_1.md']);
  assert.deepEqual([p2.state, p2.record.fail, p2.record.failSinceUserInput, p2.tags], ['stopped', 4, 3, ['guard', 'harness']]);
  assert.deepEqual([p3.state, p3.goal], ['empty', '셋째 목표 | 파이프']);

  assert.deepEqual(vm.ledger.tally, { USER: 2, 'USER·위임': 1, AI: 2, 'AI·비가역': 0 });
  assert.deepEqual([vm.ledger.userSide, vm.ledger.gate], [3, 'clear']);
  assert.deepEqual(vm.ledger.aiLines.map(a => [a.line, a.text]), [[23, '에이전트 제안 첫째 — `코드` 포함 (2026-11-11)'], [25, '에이전트 제안 둘째 (2026-11-11)']]);

  assert.deepEqual(vm.milestones.items.map(m => [m.name, m.state, m.current, m.statusText]),
    [['M00_NoPlan', 'missing', false, null], ['M01_Old', 'ok', false, '종결'], ['M02_Test', 'ok', true, '승인 완료 (2026-11-11) · Phase 2 진행']]);

  const W = vm.worktree;
  assert.deepEqual([W.branch, W.head.hash, W.head.subject, W.tracked, W.untracked], ['master', 'abc1234', '제목 한글 커밋', 2, 1]);
  assert.deepEqual(W.compare, { ref: 'origin/master', kind: 'upstream', behind: 1, ahead: 2 });
  assert.ok(git.calls.every(args => READ_ONLY.includes(args[0])));
  assert.ok(!git.calls.some(args => args.includes('fetch')));

  assert.deepEqual([vm.hooks.lines, vm.hooks.bad, vm.hooks.entries.length, vm.hooks.truncated], [6, 1, 5, false]);
  assert.deepEqual(vm.hooks.entries.filter(e => e.deny).map(e => e.verdict), ['deny', 'block']);

  assert.equal(vm.backlog.count, 3);
  assert.deepEqual(vm.backlog.sections.map(s => [s.name, s.items.map(i => i.title)]), [['대기 항목', ['첫 항목', '둘째 항목']], ['처리된 항목', ['처리된 항목']]]);
});

test('a failed source fails only its own block, with a Korean reason', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit(), io: io(failing('01_Milestones/M02_Test/01_Work_Pin.md')) });
  assert.equal(vm.pin.status, 'failed');
  assert.match(vm.sources.find(s => s.id === 'pin').error, /01_Work_Pin\.md을\(를\) 읽지 못했어요 \(EACCES\)/);
  for (const id of ['pointer', 'milestone', 'phases', 'ledger', 'milestones', 'worktree', 'hooks', 'backlog']) assert.equal(vm[id].status, 'ok', id);
});

test('missing pointer leaves dependent blocks unknown (null), not zero', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit(), io: io(failing('gate-config.json', 'ENOENT')) });
  for (const id of ['pointer', 'milestone', 'pin', 'phases', 'ledger', 'backlog']) assert.equal(vm[id].status, 'failed', id);
  assert.match(vm.sources.find(s => s.id === 'pointer').error, /찾지 못했어요/);
  assert.match(vm.sources.find(s => s.id === 'ledger').error, /포인터를 읽지 못해/);
  assert.deepEqual([vm.ledger.tally, vm.backlog.count, vm.phases.items], [null, null, []]);
  for (const id of ['milestones', 'worktree', 'hooks']) assert.equal(vm[id].status, 'ok', id);
});

test('an unreadable Phase file fails phases and ledger like plan-gate, but keeps the plan header', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit(), io: io(failing('02_Phase_2.md')) });
  assert.deepEqual([vm.phases.status, vm.ledger.status, vm.milestone.status], ['failed', 'failed', 'ok']);
  assert.match(vm.sources.find(s => s.id === 'phases').error, /02_Phase_2\.md/);
});

test('git failure, hook-log absence and backlog absence are reported separately', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit({ fail: 'status' }), io: io({
    ...failing('99_Backlog.md', 'ENOENT'),
    tail: async () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); },
  }) });
  assert.equal(vm.worktree.status, 'failed');
  assert.match(vm.sources.find(s => s.id === 'worktree').error, /git status 명령이 실패했어요/);
  assert.equal(vm.hooks.status, 'failed');
  assert.match(vm.sources.find(s => s.id === 'hooks').error, /hook-log\.jsonl 파일이나 폴더를 찾지 못했어요/);
  assert.deepEqual([vm.backlog.status, vm.backlog.count], ['absent', null]);
  assert.equal(vm.sources.find(s => s.id === 'backlog').status, 'absent');
});

test('without an upstream the branch is compared with origin default branch and says so', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit({ branch: 'chore/x', upstream: null, counts: '0\t3' }), io: io() });
  assert.deepEqual(vm.worktree.compare, { ref: 'origin/master', kind: 'default', behind: 0, ahead: 3 });
});

test('hook-log tail reads only the last bytes of a large file', async () => {
  const big = '{"ts":"t","hook":"old","verdict":"deny"}\n'.repeat(15000) + '{"ts":"t","hook":"new","verdict":"allow"}\n';
  const vm = await collect(fixture, { now: NOW, git: fakeGit(), io: io({ tail: async (file, bytes) => {
    const start = Math.max(0, big.length - bytes);
    return { text: big.slice(start), size: big.length, truncated: start > 0 };
  } }) });
  assert.equal(vm.hooks.truncated, true);
  assert.equal(vm.hooks.lines, 400);
  assert.equal(vm.hooks.entries.at(-1).hook, 'new');
});

test('git runner refuses write commands and never lets status take optional locks', async () => {
  const seen = [];
  const git = gitRunner('C:/repo', { execute: (cmd, args, opts, done) => { seen.push({ cmd, args, opts }); done(null, 'ok\n', ''); } });
  assert.equal(await git(['status', '--porcelain=v1']), 'ok\n');
  assert.deepEqual([seen[0].cmd, ...seen[0].args.slice(0, 3)], ['git', '--no-optional-locks', '-c', 'core.quotepath=false']);
  assert.deepEqual([seen[0].opts.env.GIT_OPTIONAL_LOCKS, seen[0].opts.shell, seen[0].opts.cwd], ['0', false, 'C:/repo']);
  for (const cmd of ['fetch', 'commit', 'switch', 'stash', 'push', 'checkout', 'reset', 'add']) await assert.rejects(git([cmd]), /읽기 전용 목록에 없는/);
  assert.equal(seen.length, 1);
});
