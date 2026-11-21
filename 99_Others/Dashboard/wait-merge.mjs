// 병합 완료 감지 실행 파일. `node 99_Others/Dashboard/wait-merge.mjs <PR 번호>`를 세션의 백그라운드 명령으로 건다.
// 저장소 루트는 이 파일 위치에서 구하고, 저장소는 그 루트의 origin으로 고정한다 — 세션의 cwd·GH_REPO에 기대지 않는다.
// 끝나면 한 줄(MERGED·CLOSED·ERROR)을 쓰고 그 결과 코드로 끝나며, 세션이 다시 불린다. 읽기만 한다(gh pr view).
// 세션은 끝난 뒤 gh pr view로 다시 읽어 기록한다 — 이 출력만으로 병합을 믿지 않는다(헌법 11조).
import { fileURLToPath } from 'node:url';
import { ghRunner, gitOriginUrl, parseGithubRepo } from './lib/merge.mjs';
import { parsePrArg, waitForMerge } from './lib/waitMerge.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const pr = parsePrArg(process.argv.slice(2));
if (pr === null) {
  console.error('사용법: node 99_Others/Dashboard/wait-merge.mjs <PR 번호>');
  process.exitCode = 64;
} else {
  const origin = parseGithubRepo(await gitOriginUrl(ROOT));
  const repo = origin ? `${origin.owner}/${origin.repo}` : null;
  console.log(`WATCH pr=${pr} repo=${repo ?? 'unknown'} since=${new Date().toISOString()}`);
  const result = await waitForMerge({ pr, repo, gh: ghRunner, cwd: ROOT });
  console.log(result.line);
  process.exitCode = result.code;
}
