import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { collect } from './lib/collector.mjs';
import { SCHEMA, isoKst } from './lib/markdown.mjs';
import { watchRepo } from './lib/watcher.mjs';
import { loadConfig } from './lib/config.mjs';
import { AnswerError, decisionSig, lineFor, validHandle } from './lib/decisions.mjs';
import { findMainTerminal, typeIntoTerminal } from './lib/deliver.mjs';
import { createPrService, ghRunner, gitOriginUrl } from './lib/merge.mjs';
import { CONFIRM_TIMEOUT_MS, createConfirm } from './lib/confirm.mjs';
import { readInbox, validInboxHandle } from './lib/inbox.mjs';

export const HEADER = 'X-AgentDeck-Dashboard';
export const TOKEN_HEADER = 'x-dashboard-token';
export const BODY_MAX = 64 * 1024;
export const ANSWER_PATHS = Object.freeze({ '/api/answer/preview': false, '/api/answer/send': true });
// 병합 세 경로(docs/병합.md): 열린 PR 목록(읽기 전용), PR 읽기와 확인 창 → 병합. 토큰·출처 검사는 결정 응답과 같고, 사람 증명은 확인 창이다.
export const MERGE_PATHS = Object.freeze({ '/api/merge/list': 'list', '/api/merge/read': 'read', '/api/merge/run': 'run' });
const isPr = n => Number.isSafeInteger(n) && n > 0 && n <= 1e9;
// 이 서버가 앞에 문장을 넣은 뒤 다른 문장을 넣을 때 앞에 붙이는 고정 글. 입력창에 앞 문장이 남아 있어도 두 문장이 붙지 않고,
// 메인이 마지막 문장을 답으로 읽게 한다(docs/결정-응답.md 「문장」).
// 첫 글자는 선택 창의 키(숫자·글자·빈칸)도, 빈 프롬프트에서 명령 메뉴를 여는 `/`도 아니어야 한다.
export const CORRECTION = '【고쳐 고름】 ';
// U+2028·U+2029는 코드 포인트로 만든다. 원문에 보이지 않는 글자를 두지 않는다.
const LINE_SEP = String.fromCharCode(0x2028), PARA_SEP = String.fromCharCode(0x2029);
export const scriptJSON = value => JSON.stringify(value).replace(/</g, '\\u003c').replaceAll(LINE_SEP, '\\u2028').replaceAll(PARA_SEP, '\\u2029');
const types = { '/app.js': 'text/javascript; charset=utf-8', '/chime.js': 'text/javascript; charset=utf-8', '/styles.css': 'text/css; charset=utf-8',
  '/fonts/PretendardVariable.woff2': 'font/woff2' };

// 현황판 서버. 저장소에 쓰는 API와 임의 파일 열기 API는 없다.
// POST를 받는 곳은 다섯뿐이다. 결정 응답 두 경로(POST /api/answer/preview·send)는 메인 입력창에 문장을 넣기만 하고(docs/결정-응답.md),
// 병합 세 경로(POST /api/merge/list·read·run)는 열린 PR 목록과 PR을 읽고, 사람 확인 창에서 「병합」을 받은 뒤에만 GitHub 병합 API를 부른다
// (docs/병합.md). 목록 경로는 읽기만 하고 병합 길(보인 SHA 기억)을 건드리지 않는다.
// 주입 지점은 함수 인자뿐이다(환경변수·설정 스위치 없음). `type`은 넣는 함수, `prService`는 병합 모듈, `confirm`은 확인 창,
// `confirmTimeoutMs`는 확인 창 시간 초과, `mergeFn`은 확인 뒤 보내는 함수(없으면 prService.sendMerge)다. 시험과 실측 서버는 가짜를 넘긴다.
export async function createDashboard(config, { collectFn = collect, watchFn, debounceMs, maxWaitMs, pollMs, pingMs = 15000, now = () => new Date(), type = typeIntoTerminal, findMain = findMainTerminal,
  prService = createPrService({ gh: ghRunner, originUrl: gitOriginUrl }), confirmTimeoutMs = CONFIRM_TIMEOUT_MS, confirm = createConfirm({ timeoutMs: confirmTimeoutMs }), mergeFn,
  inboxFn = readInbox, inboxMs = 30000 } = {}) {
  const clients = new Set();
  const template = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  // 서버를 시작할 때마다 새 페이지 토큰. 페이지 bootstrap에만 싣고 SSE 스냅샷에는 싣지 않는다.
  const token = randomBytes(32).toString('hex');
  const handle = validHandle(config.mainTerminalHandle);
  let vm, revision = 0, watchError = null, pending = false, collecting = null, closed = false, origin = null;
  // 마지막으로 넣은 문장(typed, 표지 없는 문장), 그것이 들어갔는지 확실한지(typedSure), 넣는 중인지(sending).
  // 같은 고름을 두 번 넣거나 겹쳐 넣으면 입력창에 줄이 쌓인다. typed는 결정 목록 서명이 바뀌면 지운다.
  // everTyped는 이 서버 수명 동안 무엇이든 넣었는지(들어갔을 수 있음 포함)다. 목록이 바뀌어도 지우지 않는다 —
  // 사용자가 Enter를 안 눌렀으면 입력창에 앞 문장이 남아 있어서, 다음 문장은 고쳐 고름 표지(CORRECTION)를 앞에 붙여 넣는다.
  let typed = null, typedSure = false, everTyped = false, sending = false;
  const inboxHandle = validInboxHandle(config.inboxHandle);
  let inbox = null, inboxTimer = null;
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
          next.answer = { canType: !!handle || !!findMain };
          next.inbox = inbox;
          const before = currentList().sig;
          next.revision = ++revision; vm = next;
          // 목록이 바뀌면 같은 문장 표시를 지운다. 바뀐 목록에서 같은 문장은 다른 답일 수 있다.
          if (currentList().sig !== before) { typed = null; typedSure = false; }
          push();
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
  // Orca 워커 보고 소식(lib/inbox.mjs). 수집과 따로 inboxMs마다 읽고, 바뀌었을 때만 새 판을 민다. handle은 페이지에 싣지 않는다.
  async function pollInbox() {
    let r;
    try { r = await inboxFn(inboxHandle); } catch { r = { status: 'failed' }; }
    const nextInbox = r ? { status: r.status === 'ok' ? 'ok' : 'failed', items: r.status === 'ok' && Array.isArray(r.items) ? r.items : [] } : null;
    if (closed || JSON.stringify(nextInbox) === JSON.stringify(inbox)) return;
    inbox = nextInbox;
    vm = { ...vm, inbox, revision: ++revision };
    push();
  }
  if (inboxHandle) { await pollInbox(); inboxTimer = setInterval(() => { void pollInbox(); }, inboxMs); }
  const watcher = watchRepo(config.repoPath, () => { void refresh(); }, {
    watchFn, debounceMs, maxWaitMs, pollMs, onFailure: error => { watchError = error; }
  });
  if (watchError) await refresh();

  function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
  // 서명은 서버의 지금 목록에서만 계산한다. 페이지가 보낸 서명은 비교 대상일 뿐이다.
  function currentList() { const items = Array.isArray(vm?.decisions?.items) ? vm.decisions.items : []; return { items, sig: decisionSig(items) }; }
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
    if (!send) return json(response, 200, { ok: true, line, canType: !!handle || !!findMain });
    // 페이지가 「보낼 문장」 칸에 보인 문장(expect)과 지금 만든 문장이 다르면 넣지 않는다 — 화면에 안 보인 글은 터미널로 가지 않는다.
    // 예외는 고쳐 고름 표지(CORRECTION) 하나다. 서버가 붙이는 고정 글이고, 넣은 뒤 결과 줄(note)이 그 사실을 알린다.
    if (typeof body.expect !== 'string' || body.expect !== line) return json(response, 409, { ok: false, stale: true, reason: '화면의 문장이 최신이 아니에요. 「보낼 문장」을 다시 확인하고 눌러 주세요.' });
    if (sending) return json(response, 409, { ok: false, reason: '앞 문장을 넣는 중이에요. 메인 입력창을 확인해 주세요.' });
    if (typed === line) return json(response, 409, { ok: false, line, reason: typedSure ? '같은 문장을 이미 넣었어요. 메인 pane에서 Enter만 누르면 돼요.'
      : '같은 문장을 넣었는지 확인하지 못했어요. 다시 넣으면 쌓일 수 있어 넣지 않았어요. 메인 입력창을 보고, 비어 있으면 문장을 복사해 붙여 넣어 주세요.' });
    if (!handle && !findMain) return json(response, 200, { ok: false, copy: true, line, reason: '설정에 메인 handle이 없거나 형식이 맞지 않아 넣지 않았어요. 문장을 복사해 메인 입력창에 붙여 넣어 주세요.' });
    // 겹침 막기는 찾기 전에 건다 — 찾는 동안 들어온 두 번째 요청이 함께 넣어 줄이 쌓이지 않게.
    sending = true;
    // 넣기 직전에 메인 Claude 터미널을 찾는다(lib/deliver.mjs findMainTerminal). 못 찾으면 넣지 않고 복사를 안내한다 —
    // 아무것도 넣지 않았으니 같은 문장 표시는 건드리지 않는다. Orca에 닿지 못할 때만 설정 handle을 그대로 쓴다.
    let target = handle, terminal;
    if (findMain) {
      let found;
      try { found = await findMain(config.repoPath, handle); } catch { found = { handle: null, unreachable: true, reason: 'Orca에 닿지 못해 메인 터미널을 찾지 못했어요.' }; }
      target = found?.handle ? validHandle(found.handle) : found?.unreachable ? handle : null;
      if (!target) { sending = false; return json(response, 200, { ok: false, copy: true, line, reason: `${found?.reason || '메인 터미널을 찾지 못했어요.'} 문장을 복사해 메인 입력창에 붙여 넣어 주세요.` }); }
      if (found?.handle && typeof found.title === 'string' && found.title) terminal = found.title;
      // 찾는 동안 결정 목록이 바뀌었으면 넣지 않는다 — 화면에서 확인한 문장이 지금 목록의 문장과 같을 때만 넣는다
      let now;
      try { now = lineFor(currentList(), body); } catch { now = null; }
      if (!now || now.refusal || now.text !== line) { sending = false; return json(response, 409, { ok: false, stale: true, reason: '넣기 직전에 결정 목록이 바뀌어 넣지 않았어요. 「보낼 문장」을 다시 확인하고 눌러 주세요.' }); }
    }
    // 넣기 실패가 「글은 들어갔는데 응답만 깨진」 경우일 수 있으니, 부르기 전에 같은 문장 표시를 남긴다.
    // 글이 안 들어간 것이 확실한 실패(definite)면 앞 값으로 되돌린다. 그 사이 목록이 바뀌어 표시가 지워졌으면 건드리지 않는다.
    const prev = { typed, typedSure, everTyped }, corrected = everTyped;
    typed = line; typedSure = false; everTyped = true;
    try { await type(target, corrected ? CORRECTION + line : line); }
    catch (e) {
      if (e?.definite === true) {
        if (typed === line) ({ typed, typedSure } = prev);
        everTyped = prev.everTyped;
        return json(response, 200, { ok: false, copy: true, line, reason: '메인 입력창에 넣지 못했어요. 아무것도 들어가지 않았으니 다시 눌러도 되고, 문장을 복사해 붙여 넣어도 돼요.' });
      }
      return json(response, 200, { ok: false, copy: true, uncertain: true, line, reason: '메인 입력창에 넣었는지 확인하지 못했어요(시간 초과이거나 응답을 읽지 못함). 글이 들어갔을 수 있어 다시 시도하지 않았어요. 메인 입력창을 먼저 보고, 안 들어갔으면 문장을 복사해 붙여 넣어 주세요.' });
    }
    finally { sending = false; }
    if (typed === line) typedSure = true;
    const named = terminal ? { terminal } : {};
    if (!corrected) return json(response, 200, { ok: true, via: 'input', line, ...named });
    return json(response, 200, { ok: true, via: 'input', line, ...named, corrected: true,
      note: '앞에 넣은 문장이 메인 입력창에 남아 있을 수 있어, 「고쳐 고름」 표지를 붙여 뒤에 넣었어요. 메인은 마지막 문장을 답으로 읽어요. 앞 문장을 지우고 Enter를 눌러도 돼요.' });
  }
  // 병합: 토큰·출처 → 본문 → PR 번호(와 SHA) 꼴. read는 PR을 읽어 화면 값을 준다. run은 병합 모듈이 마지막으로 보인 SHA를 소비하고
  // 다시 읽어 대조한 뒤 확인 창(confirm)을 띄우고, 정확히 「예」일 때만 mergeFn(기본 prService.sendMerge)으로 보낸다(lib/merge.mjs mergePr).
  // 병합은 한 번에 하나다. 확인 창을 기다리는 동안 온 두 번째 요청은 줄 세우지 않고 409로 돌려보낸다(기다린 뒤 뜨는 창은 사람이 예상하지 못한다).
  let merging = false;
  const send = mergeFn ?? (ticket => prService.sendMerge(ticket));
  async function merge(request, response, kind) {
    if (!authorized(request)) return json(response, 403, { ok: false, reason: '현황판 토큰이나 요청 출처를 확인하지 못했어요. 화면을 새로고침해 주세요.' });
    let body;
    try { body = await readBody(request); } catch (e) { if (e instanceof AnswerError) return json(response, e.status ?? 400, { ok: false, reason: e.message }); throw e; }
    // 목록: 본문의 칸은 보지 않는다. 병합 중(merging)이어도 막지 않는다 — 읽기만 하고 병합 길에 들어가지 않는다.
    if (kind === 'list') {
      let r;
      try { r = typeof prService.listPrs === 'function' ? await prService.listPrs(config.repoPath) : null; } catch { r = null; }
      return json(response, 200, r?.ok ? { ok: true, repo: r.repo, items: r.items, more: !!r.more, dropped: r.dropped ?? 0 } : { ok: false, reason: r?.reason || '열린 PR 목록을 읽지 못했어요.' });
    }
    const pr = body?.pr;
    if (!isPr(pr)) return json(response, 400, { ok: false, reason: 'PR 번호는 양의 정수여야 해요.' });
    if (kind === 'read') {
      let r;
      try { r = await prService.readPr(config.repoPath, { number: pr }); } catch { r = { ok: false, error: `PR #${pr}을 읽지 못했어요.` }; }
      return json(response, 200, r?.ok ? { ok: true, pr: r.pr } : { ok: false, reason: r?.error || `PR #${pr}을 읽지 못했어요.` });
    }
    const sha = body?.sha;
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/i.test(sha)) return json(response, 400, { ok: false, reason: '머리 SHA는 40자리 16진수여야 해요.' });
    if (merging) return json(response, 409, { ok: false, reason: '앞 병합 요청의 확인 창이 아직 열려 있거나 결과를 기다리는 중이에요. 바탕화면의 확인 창을 먼저 봐 주세요.' });
    merging = true;
    let result;
    try { result = await prService.mergePr(config.repoPath, pr, sha, { confirm, send }); }
    catch { result = { status: 'unknown', message: '결과 모름 — 다시 읽기로 확인하세요' }; }
    finally { merging = false; }
    return json(response, 200, { ok: result?.status === 'merged' || result?.status === 'enqueued', ...result });
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(HEADER, SCHEMA);
    response.setHeader('Referrer-Policy', 'no-referrer');
    // 다른 Host 값(DNS rebinding 포함)은 거부한다.
    if (request.headers.host !== new URL(origin).host) return json(response, 403, { ok: false, reason: '허용되지 않은 현황판 주소예요.' });
    // `//[` 같은 요청 줄은 URL 파서가 던진다. 처리기 밖으로 새면 서버 프로세스가 죽으므로 여기서 400으로 답한다.
    let url;
    try { url = new URL(request.url, origin); } catch { return json(response, 400, { ok: false, reason: '요청 주소를 읽지 못했어요.' }); }
    try {
      if (Object.hasOwn(ANSWER_PATHS, url.pathname)) {
        if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, { ok: false, reason: '결정 응답은 POST로만 받아요.' }); }
        return await answer(request, response, ANSWER_PATHS[url.pathname]);
      }
      if (Object.hasOwn(MERGE_PATHS, url.pathname)) {
        if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, { ok: false, reason: '병합 요청은 POST로만 받아요.' }); }
        return await merge(request, response, MERGE_PATHS[url.pathname]);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { ok: false, reason: '이 현황판은 결정 응답 두 경로와 병합 세 경로 밖에서는 GET만 받아요.' });
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
  } catch (error) { clearInterval(ping); clearInterval(inboxTimer); watcher.close(); throw error; }
  return { origin, server, refresh, get snapshot() { return vm; }, async close() {
    closed = true; watcher.close(); clearInterval(ping); clearInterval(inboxTimer);
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
