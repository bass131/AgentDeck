import { fileURLToPath } from 'node:url';

export const fixture = fileURLToPath(new URL('./fixtures/repo/', import.meta.url));
export const NOW = new Date('2026-11-11T10:00:00+09:00');

// 실제 git 대신 쓰는 고정 응답. 고정 입력 폴더는 git 저장소가 아니다.
export function fakeGit({ branch = 'master', upstream = 'origin/master', counts = '1\t2', status = ' M lib/a.mjs\0?? 새 폴더/b.md\0R  new.md\0old.md\0', fail = null,
  log = 'abc1234\0feat(m02-p1): 첫 단계 마감\x1e\nfff0000\0docs: M02-P10은 P1이 아니다\x1e\n' } = {}) {
  const calls = [];
  const git = async args => {
    calls.push(args);
    const k = args.join(' ');
    if (fail && k.startsWith(fail)) throw new Error(`git ${args[0]} 명령이 실패했어요: fatal: 시험용 실패`);
    if (k === 'rev-parse --abbrev-ref HEAD') return branch + '\n';
    if (k.startsWith('log -200')) { if (log == null) throw new Error('no log'); return log; }
    if (k.startsWith('log -1 ')) return 'abc1234\0제목 한글 커밋\x002026-11-11T06:00:00+09:00\n';
    if (k.startsWith('status ')) return status;
    if (k.includes('@{u}')) { if (!upstream) throw new Error('no upstream'); return upstream + '\n'; }
    if (k.startsWith('rev-parse --verify')) throw new Error('no ref');
    if (k.startsWith('symbolic-ref')) return 'origin/master\n';
    if (k.startsWith('rev-list')) return counts + '\n';
    if (k === 'rev-parse --absolute-git-dir') throw new Error('no git dir');
    throw new Error('unexpected git ' + k);
  };
  git.calls = calls;
  return git;
}

export async function events(origin) {
  const abort = new AbortController();
  const response = await fetch(origin + '/events', { signal: abort.signal });
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  return { close: () => abort.abort(), async next(type = 'snapshot') {
    while (true) {
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (event.includes('event: ' + type + '\n')) return JSON.parse(event.split('\n').find(l => l.startsWith('data: ')).slice(6));
      }
      const result = await reader.read();
      if (result.done) throw new Error('SSE closed before event');
      buffer += decoder.decode(result.value, { stream: true });
    }
  } };
}
