import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { collect } from './lib/collector.mjs';
import { SCHEMA, isoKst } from './lib/markdown.mjs';
import { watchRepo } from './lib/watcher.mjs';
import { loadConfig } from './lib/config.mjs';
import { AnswerError, decisionSig, lineFor, validHandle } from './lib/decisions.mjs';
import { typeIntoTerminal } from './lib/deliver.mjs';

export const HEADER = 'X-AgentDeck-Dashboard';
export const TOKEN_HEADER = 'x-dashboard-token';
export const BODY_MAX = 64 * 1024;
export const ANSWER_PATHS = Object.freeze({ '/api/answer/preview': false, '/api/answer/send': true });
// U+2028·U+2029는 코드 포인트로 만든다. 원문에 보이지 않는 글자를 두지 않는다.
const LINE_SEP = String.fromCharCode(0x2028), PARA_SEP = String.fromCharCode(0x2029);
export const scriptJSON = value => JSON.stringify(value).replace(/</g, '\\u003c').replaceAll(LINE_SEP, '\\u2028').replaceAll(PARA_SEP, '\\u2029');
const types = { '/app.js': 'text/javascript; charset=utf-8', '/chime.js': 'text/javascript; charset=utf-8', '/styles.css': 'text/css; charset=utf-8',
  '/fonts/PretendardVariable.woff2': 'font/woff2' };

// 현황판 서버. 저장소에 쓰는 API와 임의 파일 열기 API는 없다.
// 쓰기는 결정 응답 두 경로(POST /api/answer/preview·send)뿐이고, 그것도 메인 입력창에 문장을 넣기만 한다(M05 H7, docs/결정-응답.md).
// `type`은 넣는 함수다. 시험은 가짜를 넘긴다.
export async function createDashboard(config, { collectFn = collect, watchFn, debounceMs, maxWaitMs, pollMs, pingMs = 15000, now = () => new Date(), type = typeIntoTerminal } = {}) {
  const clients = new Set();
  const template = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  // 서버를 시작할 때마다 새 페이지 토큰. 페이지 bootstrap에만 싣고 SSE 스냅샷에는 싣지 않는다.
  const token = randomBytes(32).toString('hex');
  const handle = validHandle(config.mainTerminalHandle);
  let vm, revision = 0, watchError = null, pending = false, collecting = null, closed = false, origin = null;
  // 마지막으로 넣은 문장과 넣는 중인지. 같은 고름을 두 번 넣거나 겹쳐 넣으면 입력창에 줄이 쌓인다.
  let typed = null, sending = false;
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
          const next = await collectFn(config.repoPath, { revision: revision + 1, now: now(), watchError, previous: vm });
          if (closed) break;
          // 넣기 버튼을 보일지만 알린다. handle 자체는 페이지에 싣지 않는다.
          next.answer = { canType: !!handle };
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
  // 서명은 서버의 지금 목록에서만 계산한다. 페이지가 보낸 서명은 비교 대상일 뿐이다.
  const currentList = () => { const items = Array.isArray(vm?.decisions?.items) ? vm.decisions.items : []; return { items, sig: decisionSig(items) }; };
  // 토큰은 길이를 먼저 비교한다(timingSafeEqual은 길이가 다르면 던진다). Origin은 정확히 이 서버여야 하고, 없어도 거절한다.
  function authorized(request) {
    if (request.headers.origin !== origin) return false;
    const got = Buffer.from(String(request.headers[TOKEN_HEADER] ?? '')), want = Buffer.from(token);
    return got.length === want.length && timingSafeEqual(got, want);
  }
  async function readBody(request) {
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw Object.assign(new AnswerError('JSON 형식으로 보내 주세요.'), { status: 400 });
    if (Number(request.headers['content-length']) > BODY_MAX) throw Object.assign(new AnswerError('요청이 너무 커요.'), { status: 413 });
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > BODY_MAX) throw Object.assign(new AnswerError('요청이 너무 커요.'), { status: 413 });
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new AnswerError('JSON을 읽지 못했어요.'), { status: 400 }); }
  }
  // 결정 응답: 토큰·출처 → 본문 → 목록 서명 → 고른 키 → 문장(서버가 만듦). send면 handle·겹침·같은 문장을 본 뒤 한 번 넣는다.
  // 하나라도 걸리면 아무것도 넣지 않는다. 넣을 수 없거나 넣기가 실패하면 문장을 돌려주고 복사를 안내한다(다시 시도하지 않는다).
  async function answer(request, response, send) {
    if (!authorized(request)) return json(response, 403, { ok: false, reason: '현황판 토큰이나 요청 출처를 확인하지 못했어요. 화면을 새로고침해 주세요.' });
    let body, result;
    try {
      body = await readBody(request);
      result = lineFor(currentList(), body);
    } catch (e) {
      if (e instanceof AnswerError) return json(response, e.status ?? 400, { ok: false, reason: e.message });
      throw e;
    }
    if (result.refusal) return json(response, 409, { ok: false, reason: result.refusal, stale: !!result.stale });
    const line = result.text;
    if (!send) return json(response, 200, { ok: true, line, canType: !!handle });
    // 페이지가 「보낼 문장」 칸에 보인 문장(expect)과 지금 만든 문장이 다르면 넣지 않는다 — 화면에 안 보인 글은 터미널로 가지 않는다
    if (typeof body.expect !== 'string' || body.expect !== line) return json(response, 409, { ok: false, stale: true, reason: '화면의 문장이 최신이 아니에요. 「보낼 문장」을 다시 확인하고 눌러 주세요.' });
    if (sending) return json(response, 409, { ok: false, reason: '앞 문장을 넣는 중이에요. 메인 입력창을 확인해 주세요.' });
    if (typed === line) return json(response, 409, { ok: false, line, reason: '같은 문장을 이미 넣었어요. 메인 pane에서 Enter만 누르면 돼요.' });
    if (!handle) return json(response, 200, { ok: false, copy: true, line, reason: '설정에 메인 handle이 없거나 형식이 맞지 않아 넣지 않았어요. 문장을 복사해 메인 입력창에 붙여 넣어 주세요.' });
    sending = true;
    // 넣기 실패가 「글은 들어갔는데 응답만 깨진」 경우일 수 있으니, 부르기 전에 같은 문장 표시를 남긴다 — 다시 눌러도 쌓이지 않는다
    typed = line;
    try { await type(handle, line); }
    catch { return json(response, 200, { ok: false, copy: true, line, reason: '메인 입력창에 넣었는지 확인하지 못했고, 다시 시도하지 않았어요. 입력창을 보고, 안 들어갔으면 문장을 복사해 붙여 넣어 주세요.' }); }
    finally { sending = false; }
    return json(response, 200, { ok: true, via: 'input', line });
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(HEADER, SCHEMA);
    response.setHeader('Referrer-Policy', 'no-referrer');
    // 다른 Host 값(DNS rebinding 포함)은 거부한다.
    if (request.headers.host !== new URL(origin).host) return json(response, 403, { ok: false, reason: '허용되지 않은 현황판 주소예요.' });
    const url = new URL(request.url, origin);
    try {
      if (Object.hasOwn(ANSWER_PATHS, url.pathname)) {
        if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, { ok: false, reason: '결정 응답은 POST로만 받아요.' }); }
        return await answer(request, response, ANSWER_PATHS[url.pathname]);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { ok: false, reason: '이 현황판은 결정 응답 두 경로 밖에서는 GET만 받아요.' });
      if (url.pathname === '/') {
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return response.end(template.replace('__BOOTSTRAP_JSON__', () => scriptJSON({ vm, token })));
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
