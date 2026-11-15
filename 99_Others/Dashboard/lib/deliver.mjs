// 현황판의 유일한 바깥 쓰기: 결정 응답 문장을 메인 Claude 입력창에 넣는다(M05 H7). Enter는 누르지 않는다.
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
