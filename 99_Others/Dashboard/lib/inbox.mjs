// Orca 워커 보고 소식(M05 Backlog 63). 설정 inboxHandle이 가리키는 우편함을 읽기만 한다.
// `orca orchestration inbox`는 읽음 표시를 바꾸지 않는다(바꾸는 것은 `check`다). 셸 없이 인자 배열로 부르고, 본문은 싣지 않는다.
// orca가 없으면 null이라 화면이 소식 절을 그리지 않는다. 그 밖의 실패는 failed다.
import { execFile } from 'node:child_process';

export const INBOX_TYPES = Object.freeze(['worker_done', 'escalation', 'question']);
export const INBOX_SHOW = 5;
const TERM = /^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, RUN = /^run:run_[0-9a-f]{6,32}$/;
export const validInboxHandle = v => typeof v === 'string' && (TERM.test(v) || RUN.test(v)) ? v : null;
export const inboxArgs = handle => ['orchestration', 'inbox', '--terminal', handle, '--limit', '20', '--full', '--json'];

// 제어문자·줄 구분·글 방향 바꾸기 문자는 코드 포인트로 가른다(원문에 보이지 않는 글자를 두지 않는다)
const hidden = k => k < 0x20 || (k >= 0x7f && k <= 0x9f) || k === 0x2028 || k === 0x2029 || (k >= 0x202a && k <= 0x202e) || (k >= 0x2066 && k <= 0x2069);
const clean = (s, n) => Array.from(Array.from(String(s ?? ''), c => hidden(c.codePointAt(0)) ? ' ' : c).join('').replace(/\s+/g, ' ').trim()).slice(0, n).join('');
const isIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v);

export function parseInbox(stdout) {
  let r;
  try { r = JSON.parse(stdout); } catch { return null; }
  if (r?.ok !== true || !Array.isArray(r.result?.messages)) return null;
  const items = r.result.messages.filter(m => m && INBOX_TYPES.includes(m.type))
    .map(m => ({ id: clean(m.id, 40), type: m.type, subject: clean(m.subject, 120), at: isIso(m.created_at) ? m.created_at : null, unread: m.read === 0 || m.handled === false }))
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return { items: items.slice(0, INBOX_SHOW) };
}

export function readInbox(handle, { execFileFn = execFile, timeoutMs = 5000 } = {}) {
  const failed = { status: 'failed', items: [] };
  return new Promise(resolve => {
    try {
      execFileFn('orca', inboxArgs(handle), { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: false, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
        if (error?.code === 'ENOENT') return resolve(null);
        const parsed = error ? null : parseInbox(stdout);
        resolve(parsed ? { status: 'ok', ...parsed } : failed);
      });
    } catch { resolve(failed); }
  });
}
