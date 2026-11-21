// 「녹취」는 2026-11-18 이 저장소(AgentDeck)에서 읽기 명령으로 받은 출력 그대로다.
//   gh pr list --state all --limit 3 --json number,state,headRefName,baseRefName,headRefOid,mergeCommit,createdAt,mergedAt,closedAt
//   gh pr view 93 --json number,state,headRefOid,mergeCommit,statusCheckRollup,mergedAt,closedAt
//   gh pr list --state closed ... (병합 없이 닫힌 PR 30), gh pr list --json number,statusCheckRollup (빈 rollup — PR 70·71)
// 「지어냄」은 녹취가 없는 꼴(열린 PR, 진행 중 검사, StatusContext, 실패 검사)이다. GitHub GraphQL 스키마의 값 이름을 따랐다.

// 녹취 — PR 93(병합됨, hard-gates 통과)
export const VIEW_93_MERGED = '{"closedAt":"2026-11-18T14:29:00Z","headRefOid":"4721ebb5b52ea55cfbbed040b09e599e8ef5d481","mergeCommit":{"oid":"4c345ed401fbb3e9813f6198fa6c467f40fa44ac"},"mergedAt":"2026-11-18T14:29:00Z","number":93,"state":"MERGED","statusCheckRollup":[{"__typename":"CheckRun","completedAt":"2026-11-18T14:28:11Z","conclusion":"SUCCESS","detailsUrl":"https://github.com/bass131/AgentDeck/actions/runs/44323984593/job/134870179192","name":"hard-gates","startedAt":"2026-11-18T14:24:56Z","status":"COMPLETED","workflowName":"hard-gates"}]}'

// 녹취 — 최근 PR 셋(모두 병합됨)
export const LIST_RECENT_3 = '[{"baseRefName":"milestone/m09-app-loop","closedAt":"2026-11-18T14:29:00Z","createdAt":"2026-11-18T14:24:49Z","headRefName":"feat/m09-g1-template-executor","headRefOid":"4721ebb5b52ea55cfbbed040b09e599e8ef5d481","mergeCommit":{"oid":"4c345ed401fbb3e9813f6198fa6c467f40fa44ac"},"mergedAt":"2026-11-18T14:29:00Z","number":93,"state":"MERGED"},{"baseRefName":"master","closedAt":"2026-11-18T12:48:12Z","createdAt":"2026-11-18T12:40:43Z","headRefName":"milestone/m08-milestone-loop","headRefOid":"6f9bb7fa0c9e1e3daa408200da17a185c423d167","mergeCommit":{"oid":"2517f670ff24c0b4cced748a108a566c632934b7"},"mergedAt":"2026-11-18T12:48:12Z","number":92,"state":"MERGED"},{"baseRefName":"milestone/m08-milestone-loop","closedAt":"2026-11-18T12:40:15Z","createdAt":"2026-11-18T12:34:50Z","headRefName":"feat/m08-g3-milestone-close","headRefOid":"d0e56c5c55c2081d1fa8d4b5ecc37055660115fe","mergeCommit":{"oid":"6f9bb7fa0c9e1e3daa408200da17a185c423d167"},"mergedAt":"2026-11-18T12:40:15Z","number":91,"state":"MERGED"}]'

// 녹취 — PR 30(병합 없이 닫힘)
export const LIST_CLOSED_30 = '[{"baseRefName":"chore/nc-naming-docs","closedAt":"2026-07-27T13:06:16Z","createdAt":"2026-07-27T12:30:06Z","headRefName":"chore/nc-naming-code","headRefOid":"e1c109ab4f9b7d2b80699c7a03e065a716fbf386","mergeCommit":null,"mergedAt":null,"number":30,"state":"CLOSED"}]'

// 녹취 — 빈 rollup(PR 71)
export const ROLLUP_EMPTY_71 = '{"number":71,"statusCheckRollup":[]}'

// 녹취 PR 30을 같은 head·base의 목록으로 옮긴 것 — 닫힌 옛 PR(30, 7월)과 병합된 새 PR(93의 값, 11월). gh pr list는 최신순이 보장되지 않으므로 순서를 섞었다.
export const LIST_SAME_HEAD_CLOSED_THEN_MERGED = `[${JSON.parse(LIST_CLOSED_30).map((p: object) => JSON.stringify(p)).join(',')},${JSON.stringify(JSON.parse(LIST_RECENT_3)[0])}]`

// 지어냄 — 열린 PR(머리에 아직 검사가 없다)
export const VIEW_OPEN_NO_CHECKS = '{"headRefOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mergeCommit":null,"number":101,"state":"OPEN","statusCheckRollup":[]}'

// 지어냄 — 진행 중 검사(CheckRun status IN_PROGRESS, conclusion 빈값)
export const VIEW_OPEN_IN_PROGRESS = '{"headRefOid":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","mergeCommit":null,"number":101,"state":"OPEN","statusCheckRollup":[{"__typename":"CheckRun","completedAt":"0001-01-01T00:00:00Z","conclusion":"","name":"hard-gates","startedAt":"2026-11-18T15:00:00Z","status":"IN_PROGRESS","workflowName":"hard-gates"}]}'

// 지어냄 — 실패 검사
export const VIEW_OPEN_FAILED = '{"headRefOid":"cccccccccccccccccccccccccccccccccccccccc","mergeCommit":null,"number":101,"state":"OPEN","statusCheckRollup":[{"__typename":"CheckRun","completedAt":"2026-11-18T15:10:00Z","conclusion":"FAILURE","name":"hard-gates","startedAt":"2026-11-18T15:00:00Z","status":"COMPLETED","workflowName":"hard-gates"}]}'

// 지어냄 — 커밋 상태(StatusContext) 꼴. 필수 검사가 아닌 다른 이름의 검사가 섞여 있다.
export const VIEW_OPEN_STATUS_CONTEXT = '{"headRefOid":"dddddddddddddddddddddddddddddddddddddddd","mergeCommit":null,"number":101,"state":"OPEN","statusCheckRollup":[{"__typename":"StatusContext","context":"ci/legacy","state":"PENDING","targetUrl":"https://example.invalid"},{"__typename":"CheckRun","completedAt":"2026-11-18T15:10:00Z","conclusion":"SUCCESS","name":"hard-gates","startedAt":"2026-11-18T15:00:00Z","status":"COMPLETED","workflowName":"hard-gates"}]}'

// 지어냄 — gh pr create의 표준 출력(PR URL 한 줄)
export const CREATE_STDOUT = 'https://github.com/example/practice/pull/101\n'
