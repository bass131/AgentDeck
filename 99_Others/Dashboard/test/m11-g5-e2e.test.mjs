// 병합 카드의 브라우저 수준 e2e. 실제 Edge(Playwright channel msedge, 창 없음)로 현황판 서버를 연다.
// opt-in이다 — DASHBOARD_E2E=1일 때만 돈다(기본 `node --test`에서는 건너뜀). 브라우저 내려받기(playwright install)는 하지 않는다.
// 서버 쪽 병합은 가짜다: PR 목록·읽기·병합은 주입한 prService, 확인 창은 주입한 confirm, 보내기는 기록만 하는 mergeFn이다. GitHub도 gh도 부르지 않는다.
// GitHub diff 링크가 여는 새 탭은 브라우저 안에서 가로채 빈 쪽으로 답한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { collect } from '../lib/collector.mjs';
import { createDashboard } from '../server.mjs';
import { fakeGit } from './helpers.mjs';

const ON = process.env.DASHBOARD_E2E === '1';
const SHA = 'f4e0ff3a5f2c4c1f9e2b7d6a8c0e1b2d3f4a5b6c';
const goalRepo = fileURLToPath(new URL('./fixtures/goal-repo/', import.meta.url));
const must = (path, patch) => ({ path, why: '판정 장치', patch, diffUrl: `https://github.com/o/r/pull/9/files#diff-${path.length}`, previousPath: null });
const VIEW = { number: 9, title: 'e2e 고정물 PR', state: 'open', merged: false, url: 'https://github.com/o/r/pull/9', baseRef: 'milestone/m11', headRef: 'chore/e2e', headSha: SHA,
  files: 2, checks: [{ name: 'hard-gates', result: 'success' }], notes: [], reasons: [], canMerge: true,
  mustSee: [must('.claude/hooks/x.cjs', '@@ -1 +1 @@\n-old\n+new'), must('CLAUDE.md', null)] };
const HAND = { id: 'merge', key: 'merge:e2e.md', level: 'todo', say: 'PR 9의 병합을 기다려요 — 위 병합 카드의 「병합」 버튼으로 해 주세요(바탕화면 확인 창에서 한 번 더 눌러요).', source: 'goal 문서 머리말 「상태: 병합 대기」', ref: null, pr: 9 };

async function server(t) {
  const log = { confirms: [], sent: [] };
  const collectFn = async (repo, o) => { const vm = await collect(goalRepo, { ...o, git: fakeGit() }); vm.summary = { ...vm.summary, hand: [HAND] }; return vm; };
  const prService = {
    listPrs: async () => ({ ok: true, repo: 'o/r', items: [{ number: 9, title: VIEW.title, baseRef: VIEW.baseRef, headRef: VIEW.headRef, sha: SHA, draft: false, author: 'o', updatedAt: '' }], more: false, dropped: 0 }),
    readPr: async (cwd, { number }) => number === 9 ? { ok: true, pr: VIEW } : { ok: false, error: '없음' },
    mergePr: async (cwd, n, sha, { confirm, send }) => {
      const c = await confirm({ number: n, sha, title: VIEW.title, mustSee: VIEW.mustSee.map(m => m.path) });
      if (c?.answer !== 'yes') return { status: 'cancelled', message: '확인 창에서 병합하지 않았어요. 다시 하려면 다시 읽기를 눌러 주세요' };
      return send({ number: n, sha });
    },
    sendMerge: async () => { throw new Error('e2e는 실제 보내기를 부르지 않는다'); },
  };
  const app = await createDashboard({ repoPath: goalRepo, port: 0, mainTerminalHandle: null }, {
    collectFn, watchFn: () => Object.assign(new EventEmitter(), { close() {} }), pingMs: 60000, findMain: null, inboxFn: async () => null,
    prService, confirm: async q => { log.confirms.push(q); return { answer: 'yes' }; },
    mergeFn: async ticket => { log.sent.push(ticket); return { status: 'merged', message: '병합했어요(e2e 가짜)', mergeSha: SHA }; },
  });
  t.after(() => app.close());
  return { app, log };
}

test('[M11-G5 M07-26] merge card in a real browser: expanded diffs survive repaints, the GitHub link counts as seen, the gate opens only then, and reduced motion runs no animation', { skip: !ON && 'DASHBOARD_E2E=1일 때만 돈다' }, async t => {
  const { chromium } = createRequire(import.meta.url)('@playwright/test');
  const browser = await chromium.launch({ channel: process.env.DASHBOARD_E2E_CHANNEL || 'msedge', headless: true });
  t.after(() => browser.close());
  const { app, log } = await server(t);
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 1000 } });
  await ctx.route('https://github.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>가짜 GitHub</title>' }));
  const page = await ctx.newPage();
  await page.goto(app.origin);
  await page.locator('#merge-card .mg').waitFor();
  const run = page.locator('[data-merge-run]');
  assert.equal(await run.isDisabled(), true, '아직 꼭 볼 것을 펼치지 않았다');
  assert.match(await page.locator('#brief .q-hand').innerText(), /PR 9 병합은 위 병합 카드에서 해요/, '같은 PR의 사실 줄은 카드 하나로 합친다(Backlog 72)');

  await page.locator('[data-merge-file=".claude/hooks/x.cjs"] > summary').click();
  await page.waitForFunction(() => document.querySelector('[data-merge-file=".claude/hooks/x.cjs"]')?.classList.contains('is-seen'));
  await app.refresh();
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('[data-merge-file=".claude/hooks/x.cjs"]').getAttribute('open'), '', '새 스냅샷과 시계의 다시 칠하기 뒤에도 펼친 diff는 펼친 채다');
  assert.equal(await run.isDisabled(), true, '하나 남았다');

  await page.locator('[data-merge-file="CLAUDE.md"] > summary').click();
  await page.waitForTimeout(200);
  assert.equal(await run.isDisabled(), true, 'patch가 없는 파일은 펼쳐도 본 것이 아니다');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.locator('[data-merge-link="CLAUDE.md"]').click()]);
  await popup.close();
  await page.waitForFunction(() => !document.querySelector('[data-merge-run]')?.disabled);

  await run.click();
  await page.locator('#merge-act .send-result.is-done').waitFor();
  assert.match(await page.locator('#merge-act').innerText(), /병합했어요\(e2e 가짜\)/);
  assert.deepEqual(log.sent, [{ number: 9, sha: SHA }], '보내기는 가짜 한 번, 보인 머리 SHA로');
  assert.equal(log.confirms.length, 1);

  const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
  assert.equal(running, 0, '「동작 줄이기」에서는 도는 애니메이션이 없다(M05 Backlog 68)');
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
});
