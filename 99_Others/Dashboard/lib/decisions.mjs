// 결정 응답의 순수 함수. 입출력이 없다. 설명은 docs/결정-응답.md다.
// 본보기는 C:\Dev\DawnHolder_Dashboard 의 lib/answer.mjs(문장 조립·코멘트 정리)와 web/lib/answers.mjs(고른 답 검사)다.
// 병합 승인 줄(「병합 승인: PR… head …」)과 단독 전송 규칙은 들이지 않았다.
// 병합은 앱 PR 카드의 「병합」 버튼으로만 한다. 보드의 병합 결정(kind: merge)은 없어졌고, 남은 항목은 경고와 함께 일반 결정으로 읽는다.
//
// 문장은 한 줄이다. 메인 입력창에 들어간 줄바꿈이나 제어 바이트는 입력을 저절로 제출하거나 터미널을 움직일 수 있다
// (`orca terminal send`는 --enter 없이 보내면 글을 PTY에 그대로 쓴다). 그래서 보드에서 온 글과 코멘트를 닦고, 조립한 문장 전체를 한 번 더 닦는다.
import { createHash } from 'node:crypto';

export const BOARD = '01_Milestones/00_Decision_Board.local.json';
export const ANSWER_LEAD = '현황판 결정 응답';
export const COMMENT = 'C';
export const COMMENT_MAX = 300;
export const OPTION_KEYS = Object.freeze(['A', 'B']);
export const RETIRED_MERGE_KIND = 'merge';
// Orca가 터미널마다 주는 handle. term_ 뒤에 소문자 UUID 전체다.
export const HANDLE_FORMAT = /^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const validHandle = h => (typeof h === 'string' && HANDLE_FORMAT.test(h) ? h : null);

export class BoardError extends Error {}
export class AnswerError extends Error {}

// C0 제어문자·DEL·C1 제어문자와 유니코드 줄·문단 구분자. 모두 공백으로 바꾼 뒤 공백을 하나로 모은다.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
export const oneLine = s => String(s ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
export const cleanComment = s => Array.from(oneLine(s)).slice(0, COMMENT_MAX).join('').trim();

const ID = /^[A-Za-z0-9][\w.-]{0,63}$/;
const isRecord = v => v != null && typeof v === 'object' && !Array.isArray(v);
const text = v => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
const when = v => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

// 보드 파일 글 → { items, warnings, skipped }. items는 state가 waiting인 항목뿐이고 보드 순서 그대로다.
// 최상위가 객체가 아니거나 JSON이 아니면(반쯤 쓰인 파일 포함) BoardError를 던진다. 수집기는 그때 직전 정상 목록을 유지한다.
// 그 밖에 모양이 틀린 것은 그 항목이나 그 칸만 빼고 경고를 남긴다.
export function parseBoard(raw) {
  let data;
  try { data = JSON.parse(String(raw ?? '').replace(/^\uFEFF/, '')); } catch { throw new BoardError('결정 보드의 JSON을 읽지 못했어요. 쓰는 중이었을 수 있어요.'); }
  if (!isRecord(data)) throw new BoardError('결정 보드의 맨 바깥이 객체가 아니에요.');
  const warnings = [], warn = (where, what) => warnings.push({ where, what });
  let list = data.decisions ?? [];
  if (!Array.isArray(list)) { warn('decisions', '결정 목록이 배열이 아니라 읽지 않았어요.'); list = []; }
  const items = [], seen = new Set();
  let skipped = 0;
  list.forEach((d, i) => {
    const at = `${i + 1}번째 항목`;
    if (!isRecord(d)) return warn(at, '객체가 아니라 뺐어요.');
    const id = text(d.id);
    if (!id || !ID.test(id)) return warn(at, 'id가 없거나 글자·숫자·하이픈 꼴이 아니라 뺐어요.');
    if (seen.has(id)) return warn(id, '같은 id가 앞에 있어 뺐어요.');
    seen.add(id);
    const title = oneLine(text(d.title));
    if (!title) return warn(id, '제목이 없어 뺐어요.');
    if (oneLine(text(d.state)) !== 'waiting') { skipped++; return; }
    const kind = null; // 받는 kind 값이 없다(merge는 없어졌다). 칸은 모양 호환으로 남긴다
    if (d.kind != null) {
      if (String(d.kind).toLowerCase() === RETIRED_MERGE_KIND) warn(id, '병합 결정은 보드에서 없어졌어요 — 병합은 앱 PR 카드의 「병합」 버튼으로 해요. 일반 결정으로 읽어요.');
      else warn(id, `kind 「${oneLine(text(d.kind))}」는 모르는 값이라 일반 결정으로 읽어요.`);
    }
    let pr = null;
    if (d.pr != null) {
      const m = /^#?(\d{1,7})$/.exec(String(d.pr).trim());
      if (m && Number(m[1]) > 0) pr = Number(m[1]); else warn(id, 'pr을 숫자로 읽지 못했어요.');
    }
    const options = [];
    if (d.options != null && !Array.isArray(d.options)) warn(id, '선택지가 배열이 아니라 읽지 않았어요.');
    for (const o of Array.isArray(d.options) ? d.options : []) {
      if (!isRecord(o)) { warn(id, '객체가 아닌 선택지를 뺐어요.'); continue; }
      const key = oneLine(text(o.key)).toUpperCase(), label = oneLine(text(o.label));
      if (key === COMMENT) { warn(id, 'C는 코멘트 자리라 C 선택지를 뺐어요.'); continue; }
      if (!OPTION_KEYS.includes(key) || !label) { warn(id, '키가 A·B가 아니거나 이름이 없는 선택지를 뺐어요.'); continue; }
      if (options.some(x => x.key === key)) { warn(id, `같은 키 ${key}의 두 번째 선택지를 뺐어요.`); continue; }
      options.push({ key, label, effect: oneLine(text(o.effect)) });
    }
    let recommended = null;
    if (d.recommended != null) {
      const r = oneLine(text(d.recommended)).toUpperCase();
      if (options.some(o => o.key === r)) recommended = r; else warn(id, '추천이 있는 선택지 키가 아니에요.');
    }
    let detail = [];
    if (typeof d.detail === 'string') detail = d.detail.split(/\r?\n/);
    else if (Array.isArray(d.detail)) detail = d.detail.flatMap(l => { const t = text(l); return t == null ? [] : t.split(/\r?\n/); });
    else if (d.detail != null) warn(id, '상세 글이 글 배열이 아니라 읽지 않았어요.');
    detail = detail.map(l => l.replace(CONTROL, ' ').trimEnd());
    items.push({ id, kind, title, state: 'waiting', pr, recommended, options, detail, arrivedAt: when(d.arrivedAt), updatedAt: when(d.updatedAt) });
  });
  return { items, warnings, skipped };
}

// 페이지가 그린 목록과 서버의 지금 목록이 같은지 보는 서명. 답의 뜻을 바꾸는 칸만 넣는다.
// 상세 글(detail)도 넣는다. 사용자는 읽은 글을 보고 답하므로, 글이 고쳐졌으면 화면에 그린 목록은 낡은 것이다. 시각 칸은 넣지 않는다.
export function decisionSig(items) {
  const rows = (items || []).map(d => [d.id, d.kind, d.title, d.options.map(o => [o.key, o.label, o.effect]), d.recommended, d.pr, d.detail ?? []]);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
}

export const selectable = d => d.state === 'waiting' && d.options.length > 0;
export const pickKeys = d => [...(selectable(d) ? d.options.map(o => o.key) : []), COMMENT];

// 페이지가 보낸 { picks: {id: 키}, comments: {id: 글} } → Map 둘. 지금 목록에 없는 id나 지금 고를 수 없는 키는
// 빼지 않고 거절한다. 빼면 화면에 보인 것보다 적게 넣게 된다. 코멘트는 한 줄로 닦아 300자로 자른다.
export function readPicks(items, body) {
  if (!isRecord(body)) throw new AnswerError('답 형식을 읽지 못했어요.');
  const rawPicks = body.picks ?? {}, rawComments = body.comments ?? {};
  if (!isRecord(rawPicks) || !isRecord(rawComments)) throw new AnswerError('답 형식을 읽지 못했어요.');
  const byId = new Map((items || []).map(d => [d.id, d]));
  const gone = '지금 결정 목록에 없는 항목이에요. 화면이 바뀌었으면 다시 확인해 주세요.';
  const picks = new Map(), comments = new Map();
  for (const [id, key] of Object.entries(rawPicks)) {
    if (key == null) continue;
    const d = byId.get(id);
    if (!d) throw new AnswerError(gone);
    if (typeof key !== 'string' || !pickKeys(d).includes(key)) throw new AnswerError(`${d.title}: 지금 고를 수 없는 선택지예요.`);
    picks.set(id, key);
  }
  for (const [id, t] of Object.entries(rawComments)) {
    if (t == null) continue;
    if (!byId.has(id)) throw new AnswerError(gone);
    if (typeof t !== 'string') throw new AnswerError('코멘트는 글이어야 해요.');
    const clean = cleanComment(t);
    if (clean) comments.set(id, clean);
  }
  for (const [id, key] of picks) if (key === COMMENT && !comments.has(id)) throw new AnswerError(`${byId.get(id).title}: C 코멘트를 골랐는데 글이 비어 있어요.`);
  return { picks, comments };
}

// 고른 답 → 메인 입력창에 넣을 한 줄. 「현황판 결정 응답: 1) <제목> → A <이름> · 2) <제목> → C 코멘트 「…」」 꼴이고,
// 번호는 보드의 기다리는 항목 순서다. 고른 것이 없으면 빈 글이다.
export function composeAnswer(items, picks, comments = new Map()) {
  const parts = (items || []).flatMap((d, i) => {
    const key = picks.get(d.id);
    if (key === COMMENT) { const note = cleanComment(comments.get(d.id)); return note ? [`${i + 1}) ${d.title} → C 코멘트 「${note}」`] : []; }
    const o = selectable(d) ? d.options.find(x => x.key === key) : null;
    return o ? [`${i + 1}) ${d.title} → ${o.key} ${o.label}`] : [];
  });
  return parts.length ? oneLine(`${ANSWER_LEAD}: ${parts.join(' · ')}`) : '';
}

export const STALE = '화면에 그린 결정 목록이 지금 목록과 달라요. 화면을 다시 그렸으니 확인하고 다시 골라 주세요.';
// 페이지의 요청 하나 → { text } 또는 { refusal, stale }. 서명은 서버의 지금 목록({ items, sig })에서 온 값만 믿는다.
// 문장은 늘 서버가 id와 키로 만든다. 페이지가 보낸 문장 칸이 있어도 읽지 않는다.
export function lineFor(list, body) {
  if (!isRecord(body) || body.sig !== list.sig) return { refusal: STALE, stale: true };
  const { picks, comments } = readPicks(list.items, body);
  const line = composeAnswer(list.items, picks, comments);
  if (!line) throw new AnswerError('고른 항목이 없어요.');
  return { text: line };
}
