# M06 G1 실측 보고서 (2) — 초안 경로 대조와 다음 goal 목록

- 작성: 2026-11-16 · 본문: `11_G1-실측-보고서.md` · 출발 초안: `M04_Goal_Loop/90_자가-개발-goal-초안.md`
- 경로는 `02_Project/00_Source/` 기준이다. 줄 번호는 `chore/m06-g1-app-probe`의 `018d65a5`에서 다시 셌다.

## 초안 경로 대조표 (M05 재편 전 → 지금)

| 초안이 가리킨 것 | 초안 경로 | 지금 경로 | 지금의 내용 |
|---|---|---|---|
| 기본 권한 모드 | `renderer/src/lib/pickerOptions.ts:87-88` | `renderer/src/03_Agent/pickerOptions.ts:89-90` | `DEFAULT_MODE_CONVERSATION = 'auto'`, `DEFAULT_MODE_PANEL = 'bypass'` 그대로 |
| auto·bypass 무질의 허용 | `main/01_agents/permissionCoordinator.ts:130-132` | `main/04_Claude/permission/permissionCoordinator.ts:130-132` | 같은 줄, 같은 내용 |
| 「항상 허용」이 도구 단위 | 같은 파일 `:190-197` | 같은 파일 `:190-197` | `addRules: [{ toolName }]` 그대로 |
| 카드의 80자 자르기 | 같은 파일 `:68` | 같은 파일 `:68` | `oneLine(command, 80)` 그대로 |
| 모델 목록 | `shared/knownModels.ts:1-11` | `shared/03_Agent/models/knownModels.ts:1-11` | 다섯 ID 그대로(`claude-opus-5`·`fable-5`·`sonnet-5`·`haiku-4-5`·`opus-4-8`) |
| 목록 밖 ID 버림 | `main/01_agents/runArgs.ts:54-55` | `main/04_Claude/runArgs.ts:47-48` | `normalizeModel`이 `undefined`면 `model`을 싣지 않는다 |
| 목록 밖 전환 거부 | `runArgs.ts:71-79` | `main/04_Claude/runArgs.ts:64-72` | `resolveSetModelRequest`가 `null` |
| 같이 고칠 곳 | `shared/modelEffort.ts` | `shared/03_Agent/models/modelEffort.ts` | 이름만 이동 |
| 같이 고칠 곳 | `shared/ipc/agent.ts` | `shared/03_Agent/agent.ts` | `MODEL_CONTEXT_WINDOW`(:38), `SetModelRequest`(:79) |
| 같이 고칠 곳 | `pickerOptions.ts` | `renderer/src/03_Agent/pickerOptions.ts` | 위와 같음 |
| 설정 출처 구성 | `main/01_agents/sdkOptions.ts:97-119` | `main/04_Claude/sdkOptions.ts:72-120` | `settingSources: ['user', 'project', 'local']`(:115) |
| SDK 폴백 상수 | `main/01_agents/ClaudeCodeBackend.ts:14` (`0.3.186`) | `main/10_Engine/sdkVersion.ts:8` | `SDK_VERSION_FALLBACK = '0.3.201'`로 이미 갱신됨. `ClaudeCodeBackend.ts`(`main/04_Claude/`)는 import만 한다 |
| Codex 백엔드 stub | `main/01_agents/CodexBackend.ts:24-37` | `main/03_Agent/CodexBackend.ts:24-37` | `_stubStream` 그대로 |
| 권한 매핑 차이(M05 Backlog 3) | `runArgs.ts:10`, `claudeAgentRun.ts:31` | `main/04_Claude/permissionModes.ts:14-20` | 한 표로 모였다. `auto`는 시작 `acceptEdits`, 실행 중 `auto`. `bypass`는 실행 중 칸이 없다 |
| 실행 중 전환 허용 목록(새로 찾음) | — | `renderer/src/05_Conversation/state/composer.ts:9-14` | `LIVE_SWITCHABLE_MODES`에 `bypass`가 없다 |
| 턴 뒤 세션 닫기(새로 찾음) | — | `main/04_Claude/run/idleCloseGovernor.ts:3` | `IDLE_CLOSE_GRACE_MS = 3000` |
| 카드가 보는 모드(새로 찾음) | — | `main/04_Claude/run/claudeAgentRun.ts:297-298` | `this._currentModeId ?? this._req.mode` |

## G2 이후 goal 목록 (초안)

순서의 근거는 둘이다. 앱 소스를 고치는 goal은 TDD 가드의 리셋이 되어야 진행된다. 그래서 이 기계의 `npm test` 타임아웃 문제(M05 Backlog 57·78)를 먼저 푼다. 그다음은 실측에서 막는 것으로 확인된 권한이다.

### G2. 이 기계에서 npm test가 기본 설정으로 통과하게 하기 · 약

- **만들 것**: renderer 콜드 import가 6초 걸리는 이 기계에서도 `npm test`가 실패 0으로 끝나는 설정. 후보는 vitest `testTimeout` 상향이나 콜드 import 첫 테스트의 준비 단계 분리다(Backlog 45·57의 길).
- **건드릴 곳**: `vitest.config.ts`, 필요하면 콜드 import가 큰 테스트 파일 몇 개.
- **하지 않을 것**: 앱 소스 변경, TDD 가드(`.claude/hooks/33_tdd-guard.cjs`) 판정 변경, 테스트 삭제·skip.
- **완료조건**: 이 기계에서 `npm test`가 기본 명령으로 실패 0이다. TDD 가드의 리셋 경로 「`npm test` Green」이 hook-log에 한 번 찍힌다.

### G3. 앱 경유 세션에서 가드의 질문이 언제나 승인 카드로 오게 하기 · 강

- **만들 것**: 가드 훅이 `ask`를 낸 도구 호출은 모드와 관계없이 승인 카드로 올리는 권한 처리. 후보 길은 권한 콜백이 받는 결정 사유(훅 유래인지)를 보고 `auto`·`bypass`에서도 카드로 보내는 것이다. 같은 goal에서 시작·실행 중 매핑(M05 Backlog 3)과 Bypass 실행 중 전환의 표시 어긋남의 의미를 정한다.
- **건드릴 곳**: `main/04_Claude/permission/permissionCoordinator.ts`, `main/04_Claude/permissionModes.ts`, `main/04_Claude/run/claudeAgentRun.ts`, `renderer/src/05_Conversation/state/composer.ts`와 각 테스트.
- **하지 않을 것**: 가드 훅·`.claude/settings.json` 변경, 모드 기본값 변경(별도 판단), 「항상 허용」의 범위 변경(G4 후보).
- **완료조건**: 본문 3절의 14개 사례(단일·멀티 × 일반·모두 허용·자동·Bypass × 새로 시작·턴 사이·턴 안)를 같은 방법으로 다시 돌려 모든 사례에서 카드가 뜨고, bare 저장소에 `master`가 생기지 않는다. 가드가 묻지 않는 명령은 `자동`·`Bypass`에서 지금처럼 카드 없이 지나간다.

### G4. 승인 카드에 명령 전문과 가드 사유를 보이게 하기 · 약

- **만들 것**: 카드가 Bash 명령을 자르지 않고(접기·펼치기 허용) 보여 주고, 훅이 낸 사유(`master가 보이는 git push …`)를 함께 보여 주는 표시. 가드가 물은 호출에는 「항상 허용」을 숨기는 안을 같이 검토한다.
- **건드릴 곳**: `permissionCoordinator.ts`의 `permissionSummary`, `shared/agentEvents`의 권한 요청 이벤트, `renderer/src/03_Agent/PermissionCard.tsx`와 테스트.
- **하지 않을 것**: 권한 판정 논리(G3 몫), 카드의 시각 디자인 개편.
- **완료조건**: 3절의 긴 명령을 다시 보내면 카드 원문에 `push`와 `master`와 가드 사유가 보인다(innerText 인용).

### G5. 앱으로 이 저장소를 고칠 때 실행 중인 앱과 작업 트리를 분리하기 · 강

- **만들 것**: 자기 개발용 실행 방식. 앱은 저장소 밖 빌드본에서 띄우고, 세션은 저장소 작업 트리를 연다. 저장소의 `npm run build`·dev 리로드가 실행 중인 앱에 닿지 않게 한다. 렌더러 리로드 때 진행 중 턴의 답이 사라지는 결함(5절)은 이 goal에서 고치거나, 분리로 피할 수 있으면 Backlog로 넘긴다.
- **건드릴 곳**: 실행 스크립트(`99_Others/scripts/` 신설 후보), 필요하면 renderer의 대화 재동기화 부분과 테스트.
- **하지 않을 것**: 설치본·패키지 제작(로드맵 밖), 자동 업데이트.
- **완료조건**: 분리된 앱에서 이 저장소를 열고, 세션이 저장소에서 `npm run build`를 돌리는 동안 진행 중 턴이 끝까지 화면과 대화 기록에 남는다.

### G6. 앱 안에서 goal 하나를 합의부터 PR 생성까지 끝내기 · 약(실주행)

- **만들 것**: M06 완료선의 실증. CLI를 열지 않고 앱 안에서 이 저장소의 약 등급 goal 하나를 끝낸다.
- **건드릴 곳**: 그 goal이 정하는 곳.
- **하지 않을 것**: 실주행 중 앱 소스 수정(발견은 Backlog).
- **완료조건**: 그 세션의 hook-log에 승인 질의가 `gh pr merge` 한 건뿐이고, 그 질의에 앱 카드로 답했다(초안의 완료선 그대로).

### 뒤로 미루는 것 (Backlog 후보)

- 모델 목록 현행화: 옛 ID가 아직 답하므로 막지 않는다. 새 세대 ID를 쓰고 싶을 때 작은 약 등급 goal로 한다.
- 재시작 뒤 도구·사고 기록, 변경 파일 목록, 선택기 값 보존(4절): 맥락은 SDK 재개로 이어지므로 완료선을 막지 않는다.
