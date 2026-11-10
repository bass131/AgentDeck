import { execFile } from 'node:child_process';
import path from 'node:path';
import { RULES, isoKst, parseStatus } from './markdown.mjs';

// 읽기 전용 git 하위 명령만 실행한다. fetch·commit·switch·stash 같은 쓰기 명령은 목록에 없다.
export const READ_ONLY = Object.freeze(['rev-parse', 'log', 'status', 'rev-list', 'symbolic-ref']);

export function gitRunner(repoPath, { execute = execFile } = {}) {
  return args => new Promise((resolve, reject) => {
    if (!READ_ONLY.includes(args[0])) { reject(new Error(`읽기 전용 목록에 없는 git 명령이라 실행하지 않았어요: git ${args[0]}`)); return; }
    // --no-optional-locks: status가 색인을 갱신해 쓰는 일을 막는다. 감시가 자기 쓰기에 다시 깨어나는 일도 막는다.
    execute('git', ['--no-optional-locks', '-c', 'core.quotepath=false', ...args], {
      cwd: repoPath, windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024, shell: false,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
    }, (error, stdout, stderr) => {
      if (!error) { resolve(String(stdout)); return; }
      const first = String(stderr || '').split(/\r?\n/).find(Boolean);
      const failure = new Error(error.code === 'ENOENT' ? 'git 실행 파일을 찾지 못했어요.' : `git ${args[0]} 명령이 실패했어요${first ? `: ${first}` : '.'}`);
      failure.exitCode = error.code;
      reject(failure);
    });
  });
}

const optional = async promise => { try { return await promise; } catch { return null; } };

// 작업 사본: 브랜치, HEAD, 미커밋·미추적 파일, origin 대비 앞·뒤. git fetch는 하지 않는다.
export async function readWorktree(git, { stat } = {}) {
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const [hash, subject, committedAt] = (await git(['log', '-1', '--format=%h%x00%s%x00%cI'])).replace(/\r?\n$/, '').split('\0');
  const changes = parseStatus(await git(['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  let compare = null;
  const upstream = await optional(git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']));
  if (upstream?.trim()) compare = { ref: upstream.trim(), kind: 'upstream' };
  else if (branch !== 'HEAD' && await optional(git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]))) compare = { ref: `origin/${branch}`, kind: 'same-name' };
  else {
    const fallback = await optional(git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']));
    if (fallback?.trim()) compare = { ref: fallback.trim(), kind: 'default' };
  }
  if (compare) {
    const [behind, ahead] = (await git(['rev-list', '--left-right', '--count', `${compare.ref}...HEAD`])).trim().split(/\s+/).map(Number);
    Object.assign(compare, { ahead, behind });
  }
  let fetchedAt = null;
  if (stat) {
    const gitDir = await optional(git(['rev-parse', '--absolute-git-dir']));
    if (gitDir?.trim()) fetchedAt = await optional(stat(path.join(gitDir.trim(), 'FETCH_HEAD')).then(s => isoKst(s.mtime)));
  }
  // 최근 커밋 제목: Phase 커밋 토큰을 찾는 데만 쓴다. 못 읽으면 null이고 흐름 판정은 다른 근거로 내려간다.
  const raw = await optional(git(['log', `-${RULES.commitScan}`, '--format=%h%x00%s%x1e']));
  const log = raw == null ? null : raw.split('\x1e').map(r => r.replace(/^\r?\n/, '')).filter(Boolean).map(r => { const [h, s] = r.split('\0'); return { hash: h, subject: s || '' }; });
  return { log, branch, detached: branch === 'HEAD', head: { hash, subject, committedAt: committedAt ? isoKst(committedAt) : null }, changes,
    untracked: changes.filter(c => c.code === '??').length, tracked: changes.filter(c => c.code !== '??').length, compare, fetchedAt };
}
