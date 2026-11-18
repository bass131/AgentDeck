// 현황판의 바깥 쓰기는 둘뿐이다. 하나가 이것 — 결정 응답 문장을 메인 Claude 입력창에 넣는다(M05 H7). Enter는 누르지 않는다.
// 다른 하나는 사람 확인 창을 거친 PR 병합(M07 G9, lib/merge.mjs·lib/confirm.mjs, docs/병합.md)이다.
// 사용자가 메인 pane에서 Enter를 눌러야 메인 세션이 사용자의 직접 입력으로 받는다. 현황판이 대신 제출하지 않는다.
// 본보기는 C:\Dev\DawnHolder_Dashboard 의 lib/deliver.mjs typeIntoMain이다.
//
// `orca terminal send`를 execFile 인자 배열로, 셸 없이, --enter 없이 한 번 부른다. 실패해도 다시 시도하지 않는다.
// 다시 시도하면 입력창에 같은 줄이 두 번 쌓일 수 있다. 서버가 실패를 받아 복사를 안내한다.
//
// 실패는 둘로 나눠 표시한다. 서버가 같은 문장 표시를 지울지 남길지를 이것으로 정한다.
// - definite: 글이 들어가지 않은 것이 확실하다 — 부르기 전에 거절, orca를 찾지 못함(ENOENT), 0이 아닌 종료 코드, orca의 ok:false.
// - uncertain: 글이 들어갔을 수 있다 — 시간 초과로 자식을 죽임, 0으로 끝났는데 응답을 읽지 못함, 그 밖의 모르는 오류.
import { execFile } from 'node:child_process';
import { validHandle } from './decisions.mjs';

export const ORCA = 'orca';
export const sendArgs = (handle, text) => ['terminal', 'send', '--terminal', handle, '--text', text, '--json'];
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const definite = message => Object.assign(new Error(message), { definite: true });
const uncertain = message => Object.assign(new Error(message), { uncertain: true });

export function typeIntoTerminal(handle, text, { execFileFn = execFile, timeoutMs = 10000 } = {}) {
  if (!validHandle(handle)) return Promise.reject(definite('메인 handle 형식이 맞지 않아 넣지 않았어요.'));
  // 문장은 서버가 이미 한 줄로 닦았다. 여기서 한 번 더 막아, 닦이지 않은 글이 PTY로 가는 길을 없앤다.
  if (typeof text !== 'string' || !text || CONTROL.test(text)) return Promise.reject(definite('문장에 제어문자나 줄바꿈이 있어 넣지 않았어요.'));
  return new Promise((resolve, reject) => {
    execFileFn(ORCA, sendArgs(handle, text), { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: false }, (error, stdout, stderr) => {
      if (error) {
        const message = String(stderr || error.message).trim().split('\n')[0] || 'orca 실행 실패';
        const sure = !error.killed && !error.signal && (error.code === 'ENOENT' || (typeof error.code === 'number' && error.code !== 0));
        return reject(sure ? definite(message) : uncertain(message));
      }
      let r;
      try { r = JSON.parse(stdout); } catch { return reject(uncertain('orca 응답을 읽지 못했어요.')); }
      if (!r || r.ok === false) return reject(definite(r?.error?.message || 'orca가 넣기를 거절했어요.'));
      resolve(r.result ?? r);
    });
  });
}

// ── 메인 터미널 찾기 (M07 G13) ── 넣기 직전에 Orca 목록에서 이 저장소의 Claude 터미널을 찾는다. 읽기만 한다.
// 후보가 정확히 하나면 그것, 여럿이면 설정 handle이 그 안에 있을 때만 그것이다. 추측해 고르지 않는다 — 엉뚱한 세션에 글이
// 들어가는 것이 복사 한 번보다 비싸다(goal G13 결정 대장 [AI]). 이유 글에는 handle을 싣지 않는다.
const normPath = p => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
const samePath = (a, b) => normPath(a).toLowerCase() === normPath(b).toLowerCase();
export const findArgs = repoPath => ['terminal', 'list', '--worktree', `path:${normPath(repoPath)}`, '--json'];
const isCandidate = (x, repoPath) => !!x && x.agentIdentity === 'claude' && x.connected === true && x.writable === true && x.orphaned !== true
  && typeof x.worktreePath === 'string' && samePath(x.worktreePath, repoPath) && !!validHandle(x.handle);

export function pickMain(result, repoPath, configHandle) {
  const list = Array.isArray(result?.terminals) ? result.terminals : [];
  const found = [...new Set(list.filter(x => isCandidate(x, repoPath)).map(x => x.handle))];
  if (result?.truncated === true) return { handle: null, reason: 'Orca 터미널 목록이 잘려 와서 메인 Claude 터미널을 하나로 정하지 못해 넣지 않았어요.' };
  if (found.length === 1) return { handle: found[0] };
  if (!found.length) return { handle: null, reason: '이 저장소에서 연결된 Claude 터미널을 찾지 못했어요.' };
  const cfg = validHandle(configHandle);
  if (cfg && found.includes(cfg)) return { handle: cfg };
  return { handle: null, reason: `이 저장소에 Claude 터미널이 ${found.length}개라 어느 것이 메인인지 몰라 넣지 않았어요. config.local.json의 mainTerminalHandle로 메인을 지정할 수 있어요.` };
}

// 없는 폴더(Orca 실측: exit 1, {"ok":false,"error":{"code":"selector_not_found"}})는 「찾지 못함」이고, 그 밖의 실패는 「닿지 못함」이다.
// 닿지 못하면 서버가 설정 handle을 그대로 쓴다(G12까지의 동작).
export function findMainTerminal(repoPath, configHandle, { execFileFn = execFile, timeoutMs = 5000 } = {}) {
  const unreachable = { handle: null, unreachable: true, reason: 'Orca에 닿지 못해 메인 터미널을 찾지 못했어요.' };
  return new Promise(resolve => {
    try {
      execFileFn(ORCA, findArgs(repoPath), { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: false }, (error, stdout) => {
        let r = null;
        try { r = JSON.parse(stdout); } catch { /* 아래에서 닿지 못함 */ }
        if (r && r.ok === false && r.error?.code === 'selector_not_found') return resolve({ handle: null, reason: '이 저장소 폴더를 Orca가 몰라 메인 Claude 터미널을 찾지 못했어요.' });
        if (error || !r || r.ok !== true || !Array.isArray(r.result?.terminals)) return resolve(unreachable);
        resolve(pickMain(r.result, repoPath, configHandle));
      });
    } catch { resolve(unreachable); }
  });
}
