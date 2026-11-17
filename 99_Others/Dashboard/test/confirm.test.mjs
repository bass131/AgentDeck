// M07 G9 사람 확인 창(lib/confirm.mjs) — 주입한 가짜 execFile로만 본다. 시험은 창을 띄우지 않는다.
// 창은 유일한 사람 증명이다. 남이 정한 글(PR 제목·브랜치 이름)은 스크립트·인자에 끼우지 않고 환경변수로만 넘기고,
// 확인은 전용 출력 한 줄로만 판정한다. 나머지(비정상 종료·빈 출력·다른 출력·시간 초과·띄우지 못함)는 모두 취소다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIRM_SCRIPT, CONFIRM_TOKEN, POWERSHELL, confirmArgs, confirmEnv, createConfirm } from '../lib/confirm.mjs';

const SHA = 'f4e0ff3812cde4caf1585a73ac77d3f9836bc2dd';
const EVIL = "'; Remove-Item -Recurse C:\\ ; '\" & calc $(whoami) `n";
const info = (over = {}) => ({ repo: 'bass131/AgentDeck', number: 75, title: EVIL, baseRef: 'master', headRef: 'feat/m07-g9-dashboard-merge', sha: SHA,
  mustSee: ['CLAUDE.md', '98_Management/01_GateState/gate-config.json'], ...over });
function fake(result) {
  const calls = [];
  const fn = (cmd, args, opts, cb) => { calls.push({ cmd, args, opts }); const r = typeof result === 'function' ? result(calls.length) : result;
    if (r?.hang) return { pid: 1 }; setImmediate(() => cb(r.error ?? null, r.stdout ?? '', r.stderr ?? '')); return { pid: 1 }; };
  fn.calls = calls;
  return fn;
}
const winConfirm = (execFileFn, over = {}) => createConfirm({ execFileFn, platform: 'win32', ...over });

test('the script is fixed text: single quotes only, no accelerator, no data; arguments are fixed too', () => {
  assert.equal(POWERSHELL, 'powershell.exe');
  assert.deepEqual(confirmArgs(), ['-NoProfile', '-NonInteractive', '-STA', '-Command', CONFIRM_SCRIPT]);
  assert.equal(typeof CONFIRM_SCRIPT, 'string');
  assert.ok(!CONFIRM_SCRIPT.includes('"'), '큰따옴표가 없다 — -Command 인자 따옴표 처리가 끼어들 틈이 없다');
  assert.ok(!CONFIRM_SCRIPT.includes('&'), '가속키(&)가 없다');
  assert.ok(!/[\r\n]/.test(CONFIRM_SCRIPT), '한 줄이다');
  assert.match(CONFIRM_SCRIPT, /\.Text='병합'/);
  assert.match(CONFIRM_SCRIPT, /\.Text='취소'/);
  assert.match(CONFIRM_SCRIPT, /TopMost=\$true/);
  assert.match(CONFIRM_SCRIPT, /\.CancelButton=\$no/, '취소 단추가 CancelButton(창 닫기·Esc = 취소)');
  assert.doesNotMatch(CONFIRM_SCRIPT, /AcceptButton/, 'Enter가 병합으로 가는 AcceptButton은 없다');
  assert.match(CONFIRM_SCRIPT, /\.Interval=1500/, '뜬 뒤 1.5초 잠금');
  assert.match(CONFIRM_SCRIPT, /\$ok\.Enabled=\$false/); assert.match(CONFIRM_SCRIPT, /\$no\.Enabled=\$false/);
  assert.match(CONFIRM_SCRIPT, /\$f\.ActiveControl=\$no; \[void\]\$no\.Focus\(\)/, '잠금이 풀리면 초점은 취소');
  assert.match(CONFIRM_SCRIPT, /UseMnemonic=\$false/);
  assert.doesNotMatch(CONFIRM_SCRIPT, /UseMnemonic=\$true/);
  // 숨김 자식 프로세스의 첫 ShowWindow는 SW_HIDE를 물려받아 창이 안 보인다(2026-11-18 실측). 뜬 직후 창 상태를 한 번 바꿔 다시 보인다
  assert.match(CONFIRM_SCRIPT, /Add_Shown\(\{ \$f\.WindowState='Minimized'; \$f\.WindowState='Normal'/);
  for (const k of ['AD_MERGE_REPO', 'AD_MERGE_NUMBER', 'AD_MERGE_TITLE', 'AD_MERGE_BASE', 'AD_MERGE_HEAD', 'AD_MERGE_SHA', 'AD_MERGE_MUSTSEE', 'AD_MERGE_CLOSE_MS'])
    assert.ok(CONFIRM_SCRIPT.includes('$env:' + k), k);
  assert.ok(CONFIRM_SCRIPT.includes(`WriteLine('${CONFIRM_TOKEN}')`), '확인 줄은 병합을 눌렀을 때만 쓴다');
  assert.equal(CONFIRM_SCRIPT.split(CONFIRM_TOKEN).length, 2, '확인 줄을 쓰는 자리는 하나');
});

test('data rides only in environment variables: the PR title never appears in the arguments or the script', async () => {
  const run = fake({ stdout: '' });
  await winConfirm(run)(info());
  const { cmd, args, opts } = run.calls[0];
  assert.equal(cmd, 'powershell.exe');
  assert.deepEqual(args, confirmArgs());
  assert.ok(!args.join(' ').includes('Remove-Item'), '제목이 인자에 없다');
  assert.equal(opts.windowsHide, true); assert.ok(!opts.shell);
  assert.equal(opts.env.AD_MERGE_TITLE, EVIL.replace(/\n/g, ' ').trim(), '제목은 글자 그대로(제어문자만 빈칸) 환경변수로 간다');
  assert.equal(opts.env.AD_MERGE_NUMBER, '75'); assert.equal(opts.env.AD_MERGE_SHA, SHA);
  assert.equal(opts.env.AD_MERGE_BASE, 'master'); assert.equal(opts.env.AD_MERGE_HEAD, 'feat/m07-g9-dashboard-merge');
  assert.equal(opts.env.AD_MERGE_MUSTSEE, 'CLAUDE.md\r\n98_Management/01_GateState/gate-config.json');
  assert.equal(opts.env.AD_MERGE_REPO, 'bass131/AgentDeck');
});

test('env: control and bidi characters are blanked, long text is clipped, inherited AD_MERGE_* values are dropped, none-must-see is empty', () => {
  const env = confirmEnv(info({ title: 'a\u0000b\u202Ec\u2066d\u0007e' + 'x'.repeat(600), mustSee: [], headRef: 'h\r\nx' }), 5000, { PATH: 'p', AD_MERGE_SELFTEST: '1', AD_MERGE_TITLE: 'old' });
  assert.equal(env.PATH, 'p');
  assert.ok(!('AD_MERGE_SELFTEST' in env), '물려받은 AD_MERGE_* 값은 버린다');
  assert.ok(!/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(env.AD_MERGE_TITLE));
  assert.ok([...env.AD_MERGE_TITLE].length <= 300);
  assert.equal(env.AD_MERGE_HEAD, 'h  x');
  assert.equal(env.AD_MERGE_MUSTSEE, '', '없음 표시는 창이 한다');
  assert.equal(env.AD_MERGE_CLOSE_MS, '5000', '창이 스스로 닫히는 시간(죽이기보다 이르게 정하는 것은 createConfirm — 아래 timeout 시험)');
  const many = confirmEnv(info({ mustSee: Array.from({ length: 60 }, (_, i) => `f${i}`) }), 120000, {});
  assert.equal(many.AD_MERGE_MUSTSEE.split('\r\n').length, 41, '40개까지와 「외 N개」 한 줄');
  assert.match(many.AD_MERGE_MUSTSEE, /외 20개$/);
});

test('only the exact token line with a clean exit is yes; everything else is no with a reason', async () => {
  assert.deepEqual(await winConfirm(fake({ stdout: CONFIRM_TOKEN + '\r\n' }))(info()), { answer: 'yes' });
  for (const [label, r] of [
    ['empty', { stdout: '' }],
    ['other output', { stdout: 'hello\r\n' + CONFIRM_TOKEN + '\r\n' }],
    ['token with extra', { stdout: CONFIRM_TOKEN + ' yes' }],
    ['lowercase', { stdout: CONFIRM_TOKEN.toLowerCase() }],
    ['non-zero exit with token', { error: Object.assign(new Error('exit 1'), { code: 1 }), stdout: CONFIRM_TOKEN }],
    ['timeout kill', { error: Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM', code: null }), stdout: '' }],
    ['no powershell', { error: Object.assign(new Error('spawn powershell.exe ENOENT'), { code: 'ENOENT' }) }],
  ]) {
    const res = await winConfirm(fake(r))(info());
    assert.equal(res.answer, 'no', label); assert.equal(typeof res.reason, 'string', label); assert.ok(res.reason, label);
  }
  const t = await winConfirm(fake({ error: Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM', code: null }) }))(info());
  assert.match(t.reason, /시간/);
});

test('timeout: 120 s by default, injectable, passed to execFile so the child is killed', async () => {
  const a = fake({ stdout: '' }); await winConfirm(a)(info());
  assert.equal(a.calls[0].opts.timeout, 120000);
  const b = fake({ stdout: '' }); await winConfirm(b, { timeoutMs: 4000 })(info());
  assert.equal(b.calls[0].opts.timeout, 4000);
  assert.equal(b.calls[0].opts.env.AD_MERGE_CLOSE_MS, '2000');
});

test('single flight: a second request while a window is up is refused at once and spawns nothing; the slot frees after', async () => {
  let finish;
  const calls = [];
  const fn = (cmd, args, opts, cb) => { calls.push(args); finish = () => cb(null, CONFIRM_TOKEN, ''); return { pid: 1 }; };
  const confirm = winConfirm(fn);
  const first = confirm(info());
  const second = await confirm(info({ number: 76 }));
  assert.equal(second.answer, 'no'); assert.match(second.reason, /이미/);
  assert.equal(calls.length, 1);
  finish();
  assert.deepEqual(await first, { answer: 'yes' });
  const run = fake({ stdout: '' });
  const again = winConfirm(run);
  await again(info()); await again(info());
  assert.equal(run.calls.length, 2, '끝나면 다시 띄울 수 있다');
  // execFile이 동기로 던져도 자리를 비운다
  const boom = winConfirm(() => { throw new Error('spawn EPERM'); });
  assert.equal((await boom(info())).answer, 'no');
  assert.equal((await boom(info())).answer, 'no');
});

test('the confirm and merge sources hold no invisible line-separator or bidi characters (they are built from code points)', async () => {
  const { readFile } = await import('node:fs/promises');
  const cp = n => String.fromCharCode(n);
  const hidden = new RegExp(`[${cp(0x2028)}${cp(0x2029)}${cp(0x200e)}${cp(0x200f)}${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}]`);
  for (const p of ['../lib/confirm.mjs', '../lib/merge.mjs']) assert.doesNotMatch(await readFile(new URL(p, import.meta.url), 'utf8'), hidden, p);
  assert.equal(confirmEnv(info({ title: `a${cp(0x2028)}b${cp(0x202e)}c` }), 1000, {}).AD_MERGE_TITLE, 'a b c');
});

test('not Windows, or a malformed request, is no without spawning', async () => {
  const run = fake({ stdout: CONFIRM_TOKEN });
  const r = await createConfirm({ execFileFn: run, platform: 'linux' })(info());
  assert.equal(r.answer, 'no'); assert.match(r.reason, /Windows/);
  const w = winConfirm(run);
  for (const bad of [info({ number: 0 }), info({ sha: 'abc' }), info({ number: '75' }), null]) assert.equal((await w(bad)).answer, 'no');
  assert.equal(run.calls.length, 0);
});
