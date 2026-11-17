// 병합 완료 감지 실행 파일 (M07 G10). 저장소 루트에서 `node 99_Others/Dashboard/wait-merge.mjs <PR 번호>`를
// 세션의 백그라운드 명령으로 건다. 끝나면 한 줄(MERGED·CLOSED·ERROR)을 쓰고 그 결과 코드로 끝나며, 세션이 다시 불린다.
// 읽기만 한다(gh pr view). 세션은 끝난 뒤 gh pr view로 다시 읽어 기록한다 — 이 출력만으로 병합을 믿지 않는다.
import { ghRunner } from './lib/merge.mjs';
import { parsePrArg, waitForMerge } from './lib/waitMerge.mjs';

const pr = parsePrArg(process.argv.slice(2));
if (pr === null) {
  console.error('사용법: node 99_Others/Dashboard/wait-merge.mjs <PR 번호>');
  process.exitCode = 64;
} else {
  console.log(`WATCH pr=${pr} since=${new Date().toISOString()}`);
  const result = await waitForMerge({ pr, gh: ghRunner, cwd: process.cwd() });
  console.log(result.line);
  process.exitCode = result.code;
}
