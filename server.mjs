import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { collect } from './lib/collector.mjs';
import { SCHEMA, isoKst } from './lib/markdown.mjs';
import { watchRepo } from './lib/watcher.mjs';
import { loadConfig } from './lib/config.mjs';

export const HEADER = 'X-AgentDeck-Dashboard';
// U+2028·U+2029는 코드 포인트로 만든다. 원문에 보이지 않는 글자를 두지 않는다.
const LINE_SEP = String.fromCharCode(0x2028), PARA_SEP = String.fromCharCode(0x2029);
export const scriptJSON = value => JSON.stringify(value).replace(/</g, '\\u003c').replaceAll(LINE_SEP, '\\u2028').replaceAll(PARA_SEP, '\\u2029');
const types = { '/app.js': 'text/javascript; charset=utf-8', '/styles.css': 'text/css; charset=utf-8',
  '/fonts/PretendardVariable.woff2': 'font/woff2' };

// 읽기 전용 현황판 서버. 저장소에 쓰는 API와 임의 파일 열기 API는 없다.
export async function createDashboard(config, { collectFn = collect, watchFn, debounceMs, maxWaitMs, pollMs, pingMs = 15000, now = () => new Date() } = {}) {
  const clients = new Set();
  const template = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  let vm, revision = 0, watchError = null, pending = false, collecting = null, closed = false, origin = null;
  function push() {
    const data = `event: snapshot\nid: ${vm.revision}\ndata: ${JSON.stringify(vm)}\n\n`;
    for (const client of clients) {
      if (client.destroyed || client.writableLength > 1024 * 1024) { client.destroy(); clients.delete(client); }
      else client.write(data);
    }
  }
  // 수집 중에 들어온 변경은 끝난 뒤 한 번 더 모아 수집한다.
  async function refresh() {
    if (closed) return;
    pending = true;
    if (collecting) return collecting;
    collecting = (async () => {
      while (pending && !closed) {
        pending = false;
        try {
          const next = await collectFn(config.repoPath, { revision: revision + 1, now: now(), watchError });
          if (closed) break;
          next.revision = ++revision; vm = next; push();
        } catch {
          if (!vm) throw new Error('최초 수집에 실패했어요. repoPath와 접근 권한을 확인해 주세요.');
          vm = { ...vm, revision: ++revision, sources: [...vm.sources.filter(s => s.id !== 'collection'),
            { id: 'collection', label: '전체 수집', target: config.repoPath, status: 'failed', collectedAt: isoKst(now()), error: '다시 수집하지 못했어요. 화면에는 이전 수집 내용이 남아 있어요.' }] };
          push();
        }
      }
    })();
    try { await collecting; } finally { collecting = null; }
  }
  await refresh();
  const watcher = watchRepo(config.repoPath, () => { void refresh(); }, {
    watchFn, debounceMs, maxWaitMs, pollMs, onFailure: error => { watchError = error; }
  });
  if (watchError) await refresh();

  function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(HEADER, SCHEMA);
    response.setHeader('Referrer-Policy', 'no-referrer');
    // 다른 Host 값(DNS rebinding 포함)은 거부한다.
    if (request.headers.host !== new URL(origin).host) return json(response, 403, { ok: false, reason: '허용되지 않은 현황판 주소예요.' });
    const url = new URL(request.url, origin);
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { ok: false, reason: '이 현황판은 읽기 전용이라 GET만 받아요.' });
      if (url.pathname === '/') {
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return response.end(template.replace('__BOOTSTRAP_JSON__', () => scriptJSON({ vm })));
      }
      if (types[url.pathname]) {
        let data;
        try { data = await readFile(new URL('./public' + url.pathname, import.meta.url)); }
        catch { return json(response, 404, { ok: false, reason: '파일이 없어요.' }); }
        response.writeHead(200, { 'Content-Type': types[url.pathname] }); return response.end(data);
      }
      if (url.pathname === '/events') {
        if (request.headers.origin && request.headers.origin !== origin) return json(response, 403, { ok: false, reason: '허용되지 않은 요청 출처예요.' });
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        response.flushHeaders();
        clients.add(response);
        response.write(`retry: 3000\nevent: snapshot\nid: ${vm.revision}\ndata: ${JSON.stringify(vm)}\n\n`);
        response.on('close', () => clients.delete(response));
        return;
      }
      json(response, 404, { ok: false, reason: '요청한 주소를 찾지 못했어요.' });
    } catch { if (!response.headersSent) json(response, 500, { ok: false, reason: '요청을 처리하지 못했어요.' }); else response.end(); }
  });
  const ping = setInterval(() => { for (const client of clients) client.write(`event: ping\ndata: ${JSON.stringify({ at: isoKst(now()) })}\n\n`); }, pingMs);
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  } catch (error) { clearInterval(ping); watcher.close(); throw error; }
  return { origin, server, refresh, get snapshot() { return vm; }, async close() {
    closed = true; watcher.close(); clearInterval(ping);
    for (const client of clients) client.end(); clients.clear();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await collecting;
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const app = await createDashboard(await loadConfig(process.argv[2]));
    console.log(`AgentDeck 현황판: ${app.origin}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
