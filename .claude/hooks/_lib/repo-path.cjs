// 저장소 상대 경로 판정 — 편집 계획 게이트와 tdd-guard가 함께 쓴다 (M11 G7, M03 Backlog 19).
// 표기만 다른 저장소 안 경로(`\\?\C:\…`, `/c/…`, 8.3 짧은 이름)가 「저장소 밖」으로 읽히면 게이트가 열린다.
// 그래서 접두를 벗기고, 실존하는 가장 깊은 조상을 실경로로 편 뒤 뿌리와 비교한다.
'use strict';
const fs = require('fs');
const path = require('path');

function unprefix(p) {
  let s = String(p);
  if (process.platform !== 'win32') return s;
  if (/^\\\\\?\\UNC\\/i.test(s)) s = '\\\\' + s.slice(8);
  else if (/^\\\\[?.]\\/.test(s)) s = s.slice(4);
  const m = s.match(/^\/([a-zA-Z])(?:\/(.*))?$/);
  if (m) s = `${m[1].toUpperCase()}:\\${(m[2] || '').split('/').join('\\')}`;
  return s;
}

function realish(abs) {
  const rest = [];
  let cur = abs;
  for (;;) {
    try {
      const real = fs.realpathSync.native(cur);
      return rest.length ? path.join(real, ...rest.reverse()) : real;
    } catch (e) {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

// 저장소 상대 경로(소문자 슬래시). 뿌리 자신은 '', 경계 밖이면 null. 상대 경로는 뿌리 기준이다.
function repoRel(root, p) {
  const rootAbs = realish(path.resolve(unprefix(root)));
  const abs = realish(path.resolve(rootAbs, unprefix(p)));
  const rel = path.relative(rootAbs, abs);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/').toLowerCase();
}

module.exports = { repoRel };
