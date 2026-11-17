// 병합 완료 감지 (M07 G10) — PR을 만든 세션이 뒤에서 걸어 두는 읽기 전용 감시다. 사용자가 어느 길로 병합하든
// (현황판 병합 카드, 앱 PR 카드, GitHub 웹, 사용자가 직접 치는 gh pr merge) 감시가 끝나며 세션이 다시 불린다.
// 끝은 셋이다 — 병합되면 MERGED 한 줄과 0, 병합 없이 닫히면 CLOSED 한 줄과 3, 읽기가 연달아 실패하면 ERROR 한 줄과 2.
// 출력은 세션을 깨우는 방아쇠일 뿐이다. 세션은 끝난 뒤 gh pr view로 다시 읽어 결정 대장에 적는다(헌법 11조).
// 이 모듈은 gh pr view만 부른다. 병합·쓰기 호출은 없다.

export const WATCH_FIELDS = 'state,mergedAt,mergeCommit,mergedBy,headRefOid';
export const viewArgs = pr => ['pr', 'view', String(pr), '--json', WATCH_FIELDS];
export const INTERVAL_MS = 30000;
export const MAX_ERRORS = 10;

// 실행 인자: PR 번호 하나(양의 정수, 9자리까지). 그 밖은 null.
export function parsePrArg(argv) {
  if (!Array.isArray(argv) || argv.length !== 1 || !/^[1-9]\d{0,8}$/.test(String(argv[0]))) return null;
  return Number(argv[0]);
}

// 출력 한 줄에 싣는 값은 꼴이 맞을 때만 그대로 둔다. 남이 정한 글이 세션에 그대로 흘러가지 않게 한다.
const hex = v => (typeof v === 'string' && /^[0-9a-f]{40}$/i.test(v) ? v : 'unknown');
const iso = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) ? v : 'unknown');
const login = v => (typeof v === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/.test(v) ? v : 'unknown');
const reasonOf = s => String(s ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || '알 수 없는 오류';

function read(r) {
  if (!r || r.code !== 0) return { error: reasonOf(r?.stderr) };
  let v;
  try { v = JSON.parse(r.stdout); } catch { return { error: 'gh 응답을 읽지 못했어요' }; }
  if (!v || typeof v !== 'object' || !['OPEN', 'MERGED', 'CLOSED'].includes(v.state)) return { error: `알 수 없는 PR 상태(${reasonOf(v?.state ?? typeof v)})` };
  return { view: v };
}

export async function waitForMerge({ pr, gh, cwd, sleep = ms => new Promise(r => setTimeout(r, ms)), intervalMs = INTERVAL_MS, maxErrors = MAX_ERRORS }) {
  let errors = 0, last = '';
  for (;;) {
    const { view, error } = read(await gh(viewArgs(pr), cwd));
    if (view) {
      errors = 0;
      if (view.state === 'MERGED') return { kind: 'merged', code: 0, line: `MERGED pr=${pr} commit=${hex(view.mergeCommit?.oid)} at=${iso(view.mergedAt)} by=${login(view.mergedBy?.login)} head=${hex(view.headRefOid)}` };
      if (view.state === 'CLOSED') return { kind: 'closed', code: 3, line: `CLOSED pr=${pr} head=${hex(view.headRefOid)}` };
    } else {
      errors += 1; last = error;
      if (errors >= maxErrors) return { kind: 'error', code: 2, line: `ERROR pr=${pr} reason=${last}` };
    }
    await sleep(intervalMs);
  }
}
