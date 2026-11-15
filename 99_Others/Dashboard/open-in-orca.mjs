import { spawn, execFile } from 'node:child_process';
import { open, mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig, runtimeDirectory, ROOT } from './lib/config.mjs';

const SCHEMA = 'ad-dashboard/1';

export function sameURL(a, b) {
  try { const x = new URL(a), y = new URL(b); return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, ''); }
  catch { return false; }
}

// 서버가 없으면 창 없이 백그라운드로 띄우고, 준비되면 AgentDeck 작업 공간에 Orca 내부 브라우저 탭을 연다.
// 같은 URL의 탭이 있으면 새로 만들지 않는다.
export async function openOrca(config, { run = promisify(execFile), probe = fetch, launch } = {}) {
  const url = `http://127.0.0.1:${config.port}`, worktree = 'path:' + config.repoPath.replaceAll('\\', '/');
  async function ready() {
    let response;
    try { response = await probe(url, { signal: AbortSignal.timeout(1000) }); } catch { return false; }
    await response.body?.cancel();
    if (response.headers.get('x-agentdeck-dashboard') !== SCHEMA) throw new Error('설정한 포트를 다른 서버가 사용하고 있어요. port를 바꿔 주세요.');
    return response.ok;
  }
  let started = false;
  if (!await ready()) {
    if (launch) await launch();
    else {
      const runtime = runtimeDirectory(config.repoPath);
      await mkdir(runtime, { recursive: true });
      const log = await open(path.join(runtime, 'server.log'), 'a');
      const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
        cwd: ROOT, detached: true, windowsHide: true, shell: false, stdio: ['ignore', log.fd, log.fd]
      });
      try { await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); }
      finally { await log.close(); }
      child.unref();
      await writeFile(path.join(runtime, 'server.json'), JSON.stringify({ pid: child.pid, url, startedAt: new Date().toISOString() }, null, 2));
    }
    started = true;
    let success = false;
    for (let i = 0; i < 50; i++) { if (await ready()) { success = true; break; } await delay(200); }
    if (!success) throw new Error(`서버가 준비되지 않았어요. ${launch ? '' : path.join(runtimeDirectory(config.repoPath), 'server.log') + '를 확인해 주세요.'}`);
  }
  const execute = async args => {
    const { stdout } = await run('orca', args, { shell: false, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const receipt = JSON.parse(stdout);
    if (receipt.ok !== true) throw new Error('Orca 내부 브라우저 요청을 처리하지 못했어요.');
    return receipt.result;
  };
  const listed = await execute(['tab', 'list', '--worktree', worktree, '--json']);
  const tab = (listed.tabs || []).find(t => sameURL(t.url, url));
  if (tab) return { url, started, reused: true, tab };
  const created = await execute(['tab', 'create', '--url', url, '--worktree', worktree, '--json']);
  return { url, started, reused: false, tab: created };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await openOrca(await loadConfig());
    console.log(`${result.started ? '서버를 백그라운드로 시작했어요. ' : ''}${result.reused ? '기존 Orca 탭을 사용해요' : 'Orca 탭을 열었어요'}: ${result.url}`);
    console.log(JSON.stringify(result.tab));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
