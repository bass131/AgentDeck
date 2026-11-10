import test from 'node:test';
import assert from 'node:assert/strict';
import { openOrca, sameURL } from '../open-in-orca.mjs';
import { runtimeDirectory } from '../lib/config.mjs';

const config = { repoPath: 'C:\\Dev\\AgentDeck', port: 4319 };
const ours = () => new Response('', { headers: { 'x-agentdeck-dashboard': 'ad-dashboard/1' } });

test('reuses an existing tab with the same URL without starting a server or another tab', async () => {
  const commands = [];
  const result = await openOrca(config, { probe: async () => ours(), launch: () => assert.fail('must not launch'), run: async (cmd, args) => {
    commands.push(args); assert.equal(cmd, 'orca');
    return { stdout: JSON.stringify({ ok: true, result: { tabs: [{ url: 'http://127.0.0.1:4319/', browserPageId: 'fixture' }] } }) };
  } });
  assert.deepEqual([result.reused, result.started, commands.length], [true, false, 1]);
  assert.deepEqual(commands[0], ['tab', 'list', '--worktree', 'path:C:/Dev/AgentDeck', '--json']);
  assert.equal(sameURL('http://127.0.0.1:4319/', 'http://127.0.0.1:4319'), true);
  assert.equal(sameURL('http://127.0.0.1:4318/', 'http://127.0.0.1:4319'), false);
});

test('starts an absent server, waits until ready, then creates a tab in the AgentDeck workspace', async () => {
  let ready = false, launches = 0; const commands = [];
  const result = await openOrca(config, { probe: async () => { if (!ready) throw new Error('down'); return ours(); },
    launch: async () => { launches++; ready = true; },
    run: async (cmd, args) => { commands.push(args); return { stdout: JSON.stringify({ ok: true, result: args[1] === 'list' ? { tabs: [] } : { tab: 'new' } }) }; } });
  assert.deepEqual([result.started, result.reused, launches], [true, false, 1]);
  assert.deepEqual(commands[1], ['tab', 'create', '--url', 'http://127.0.0.1:4319', '--worktree', 'path:C:/Dev/AgentDeck', '--json']);
});

test('refuses a foreign server on the configured port', async () => {
  await assert.rejects(openOrca(config, { probe: async () => new Response(''), run: async () => assert.fail() }), /다른 서버/);
});

test('runtime files cannot be put inside the repository', () => {
  assert.throws(() => runtimeDirectory(process.env.LOCALAPPDATA), /저장소 안/);
});
