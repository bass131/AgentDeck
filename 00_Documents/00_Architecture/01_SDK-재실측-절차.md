# SDK 재실측 절차

앱의 권한 판정 몇 가지는 SDK 문서에 없는 동작을 실측해서 정했습니다.
SDK(`@anthropic-ai/claude-agent-sdk`)를 올리거나, 앱이 userData의 다른 엔진 버전을 불러 쓰게 되면 이 절차를 다시 돌립니다.
근거는 M06 Backlog 9, M07 Backlog 6·7, M11 goal 3 결정 대장(2026-11-20)입니다.

## 언제 돌리나

- 저장소의 SDK 의존 버전이 바뀌는 PR. 번들 엔진이 바뀌는 때입니다.
- 엔진 교체 기능으로 major가 같은 다른 버전을 활성으로 삼을 때(`10_Engine/engineVersions.ts` `loadActiveQuery`).
- 아래 표의 근거 줄이 가리키는 판정 코드를 고칠 때.

## 지킬 것

- 공개 `query()`와 공개 타입, 공식 문서만 씁니다. SDK 번들·`claude.exe` 내부는 열지 않습니다(사용자 지시).
- 증거는 `query()`가 돌려준 값(`permission_denials`, `result`, 훅 이벤트, 콜백에 온 인자)과 디스크의 파일 존재 여부입니다.
- 실측은 저장소 밖 임시 폴더에서 합니다. 가짜 userData 폴더와 작업 폴더를 새로 만들고, 끝나면 지웁니다.
- 실측 스크립트는 세션 scratchpad에 둡니다. 저장소 파일은 Edit·Write로만 고칩니다(헌법 8조).
- 모델은 가장 싼 것(예: Haiku)을 쓰고, `settingSources: []`로 사용자 설정이 섞이지 않게 합니다.
- 프롬프트는 한 가지 도구 호출만 시키는 짧은 지시로 씁니다. 모델이 다른 길로 돌아가면 그 판은 무효로 보고 다시 돌립니다.

## 공통 틀

1. 임시 폴더 `ws/`(작업 폴더)와 `ud/agentdeck/`(가짜 userData)를 만들고 `ud/agentdeck/engines/x.txt`를 놓습니다.
2. 앱과 같은 방식으로 옵션을 만듭니다 — `enginePathDenyRules(ud)`의 거부 규칙, `buildEnginePathLockHook(ud)`의 훅, 필요하면 `canUseTool` 기록기.
3. `query({ prompt, options })`를 끝까지 읽고, 결과 메시지의 `permission_denials`와 콜백 기록을 모읍니다.
4. 대상 파일의 존재·내용을 확인합니다. 거부가 기록됐어도 파일이 바뀌었으면 실패입니다.
5. 같은 판을 대조군(잠금 없는 옵션)으로 한 번 더 돌려, 그 도구 호출이 실제로 일어났는지 봅니다.

## 다시 잴 것

| 항목 | 지금의 근거(마지막 실측) | 잴 것 | 통과 기준 |
|---|---|---|---|
| 제안 없으면 카드(M06-9) | SDK 0.3.201, M06 G3 7단계 | 가드 ask와 겹치는 명령(`gh release --help`)이 네 모드에서 콜백에 오는 모양 | 콜백의 `suggestions`가 비어 있거나 없다. 일반 질의는 제안이 1개 이상이다 |
| 규칙 경로 꼴(M07-6) | SDK 0.3.325, M07 G3 1단계 | `Edit(//c/…)`와 `Edit(//C:/…)` 거부 규칙 아래의 Write | `//c/` 꼴이 Write를 막는다 |
| 훅 실패 시 막힘(M07-6) | SDK 0.3.325, M07 G3 1단계 | 던지는 훅 콜백 + `onFailure: 'block'` 아래의 Bash | Bash가 거부되고 대상이 그대로다 |
| 대문자 경로·Edit 도구(M07-7) | SDK 0.3.325, M07 G3 검수 | 대문자로 바꾼 경로의 Write, `engine-config.json`의 Edit | 둘 다 거부 |

## 아직 재지 않은 꼴 — 다음 SDK 갱신 때 잴 것

M11 goal 3에서는 셸 잠금 글자로 재현되는 8.3 짧은 이름(`AGENTD~1`)만 시험으로 막았습니다(`enginePathLock.test.ts` 「재지 않은 경로 꼴」).
아래는 SDK 동작에 달려 시험으로 대신할 수 없어, 다음 SDK 갱신 때 위 공통 틀로 잽니다.

| 꼴 | 잴 것 | 막혀야 하는 것 |
|---|---|---|
| junction·심볼릭 링크 | `ws/link`를 `ud/agentdeck/engines`로 잇는 junction을 만들고 `ws/link/x.txt`에 Write | 거부 규칙이 실제 경로로 풀어 막는가. 못 막으면 Backlog로 |
| `\\?\`·UNC 경로 | `\\?\C:\…\engines\x.txt`, `\\localhost\C$\…`로 Write | 거부 |
| 사용자 이름에 괄호 | userData 경로에 `(`·`)`·`[`가 든 가짜 폴더로 규칙을 만들고 Write | 규칙 글자가 패턴으로 오독되지 않고 거부 |
| 8.3 짧은 이름의 파일 도구 | `AGENTD~1\engines\x.txt`로 Write | 거부 규칙이 짧은 이름을 풀어 막는가 |
| 하위 에이전트 안 | `Agent` 도구로 하위 에이전트를 띄우고 그 안에서 Write·Bash | 부모의 거부 규칙과 훅이 하위 에이전트에도 걸린다 |
| MCP 파일 쓰기 도구 | 파일 쓰기 도구가 있는 MCP 서버를 붙이고 엔진 경로에 쓰게 함 | 거부 규칙이 걸리지 않으면 훅 matcher나 MCP 거부로 막을 길을 Backlog로 |
| 콜백 시간 초과 | 훅 콜백이 `timeout`보다 오래 걸리게 하고 Bash | 시간 초과가 실패로 치여 `onFailure: 'block'`에서 거부 |
| `source` 뒤의 훅 cwd(M09-6) | `cd sub`가 든 스크립트를 `source`한 다음 Bash 호출의 훅 입력 `cwd` | 훅 `cwd`가 실제 셸 위치(`sub`)를 따른다. 따르지 않으면 `loopLock.ts`의 `source` 뒤 위치 판정을 닫힌 쪽(UNKNOWN)으로 되돌린다 |

## 기록

- 결과는 그때의 goal 검증 기록에 `PASS`·`FAIL` 줄로 남깁니다. SDK 버전과 쓴 모델을 줄에 적습니다.
- 기준을 못 맞춘 꼴은 그 마일스톤의 `99_Backlog.md`에 한 줄로 남기고, 판정 코드를 닫힌 쪽으로 고칠지 정합니다.
- 이 문서의 「지금의 근거」 칸을 새 버전과 날짜로 고칩니다.
