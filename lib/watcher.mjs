import { watch } from 'node:fs';

// 저장소 전체를 본다. 화면 값에 닿지 않는 큰 폴더만 거른다.
// 작업 사본 블록은 어떤 파일 변경에도 달라질 수 있어서 확장자로 거르지 않는다.
export function relevant(relative) {
  const p = String(relative).replace(/\\/g, '/');
  if (/(^|\/)node_modules(\/|$)/.test(p)) return false;
  if (/^\.git\/(objects|lfs|logs|hooks)(\/|$)/.test(p)) return false;
  return true;
}

// 변경은 debounceMs로 모은다. 변경이 끊이지 않아도 maxWaitMs마다 한 번은 다시 수집한다.
// 감시를 시작하거나 유지하지 못하면 pollMs 간격 재수집으로 대체한다.
export function watchRepo(repoPath, onChange, { watchFn = watch, debounceMs = 180, maxWaitMs = 1500, pollMs = 30000, onFailure = () => {} } = {}) {
  let watcher, timer = null, first = 0, poll, closed = false, failed = false;
  function fire() { timer = null; first = 0; if (!closed) onChange(); }
  function schedule() {
    if (closed) return;
    const t = Date.now();
    if (!first) first = t;
    clearTimeout(timer);
    timer = setTimeout(fire, t - first >= maxWaitMs ? 0 : debounceMs);
  }
  function fail() {
    if (closed || failed) return;
    failed = true;
    try { watcher?.close(); } catch {}
    onFailure(`파일 변경 감시를 시작하거나 유지하지 못했어요. ${pollMs / 1000}초마다 다시 수집해요.`);
    schedule();
    poll = setInterval(onChange, pollMs);
  }
  try {
    watcher = watchFn(repoPath, { recursive: true }, (event, name) => {
      const relative = name?.toString();
      if (relative && !relevant(relative)) return;
      schedule();
    });
    watcher.on('error', fail);
  } catch { fail(); }
  return { close() { closed = true; clearTimeout(timer); clearInterval(poll); try { watcher?.close(); } catch {} } };
}
