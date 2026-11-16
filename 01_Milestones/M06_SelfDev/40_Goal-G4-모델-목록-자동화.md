# M06 G4 — 모델 목록 자동화 · 모델 선택기를 SDK가 알려 주는 목록으로 그린다

- 마일스톤: M06 자가 개발 · 작성: 2026-11-16 · 상태: 실행 중 · 검증 강도: 강(앱 소스 50줄 이상 예상, 의존성 버전 변경)
- 작업 브랜치: `feat/m06-g4-model-list` — master `c635ef75`(PR 60·61 병합 뒤)에서 갈랐다.

## 목표

새 모델이 나와도 앱의 모델 표를 손으로 고치지 않는다. 모델 선택기와 노력 단계 메뉴는 앱에 든 Agent SDK의 `supportedModels()` 응답으로 그리고, 사람이 하는 일은 SDK 버전을 올리는 것 하나만 남긴다. 그 첫걸음으로 SDK를 최신으로 올린다.

## 범위

- **만들 것**
  - 번들 Agent SDK를 0.3.201에서 최신으로 올리고, G3 가드 질문 판별이 새 SDK에서도 성립하는지 블랙박스로 다시 잰다.
  - 앱 시작 때 짧은 세션으로 `supportedModels()`를 받아 사용자 데이터 폴더에 캐시하는 main 쪽 모델 목록 공급자. 실패하면 마지막 캐시, 캐시도 없으면 코드의 최소 목록(최신 네 모델)을 쓴다.
  - 선택기·노력 단계 메뉴가 그 목록(`displayName`, `supportedEffortLevels`)을 IPC로 받아 그리는 경로.
  - 대화에는 정식 ID(`resolvedModel`이 있으면 그 값)를 저장한다. 옛 ID로 저장된 대화는 그대로 열린다.
  - 「최소」 노력 단계(사고 끄기)는 선택지에서 뺀다 — 목록이 사고 끄기 가능 여부를 알려 주지 않고, 최신 모델 다수가 거부한다.
  - 컨텍스트 계기는 턴 결과의 `modelUsage.contextWindow`를 우선하고, 첫 턴 전 기본값 하나만 남긴다.
  - SDK 갱신 알림 수단 하나(Dependabot 설정 또는 점검 명령 문서화 — 3단계 실측 뒤 고른다).
- **건드릴 곳**: `package.json`·`package-lock.json`의 Agent SDK 버전, `shared/03_Agent/models/`(knownModels·modelEffort), `shared/03_Agent/agent.ts`의 컨텍스트 창 표, `main/04_Claude/runArgs.ts`, main의 모델 목록 공급자(신규)와 IPC 계약, `renderer/src/03_Agent/pickerOptions.ts`와 선택기, 각 테스트. SDK 업데이트로 깨지는 타입·호출 지점.
- **하지 않을 것**: PC에 설치된 Claude Code CLI 사용(사용자가 B안을 고르지 않았다), 판정 장치 변경, 모델 라우팅 정책 문서 변경(이미 최신), 노력 단계 UI 디자인 개편, 가드의 줄 이음 구멍(M06 Backlog 8).
- **완료조건**
  - 번들 SDK가 최신 버전이고, G3 블랙박스 실측(가드 ask 다섯 꼴, 일반 질의)을 새 SDK에서 다시 돌려 「가드 ask는 제안 없이 콜백에 온다」가 성립한다.
  - 실제 앱 선택기에 SDK가 돌려준 모델이 보이고(innerText 인용), 최신 네 모델(`claude-fable-5-2`·`claude-opus-5-5`·`claude-sonnet-5-5`·`claude-haiku-5-5` 또는 그 별칭) 각각으로 한 턴이 응답한다.
  - 네트워크·SDK 호출이 실패해도 선택기가 캐시나 최소 목록으로 뜬다(단위 테스트).
  - 옛 ID로 저장된 대화가 열리고 이어진다.
  - 소스에 모델 ID를 나열한 표는 최소 목록 한 곳만 남는다(grep 인용).
  - 구현 문맥 없는 검수자 PASS, 하드 게이트 다섯 종 exit 0, `npm test` 실패 0.

## Phase 1 — SDK 업데이트와 모델 목록 자동화 · 태그: `source` · 의존: G3

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 문서 준비 — 이 goal 문서, 포인터 전환, pin 갱신
- [x] 2. SDK 올리기 — `@anthropic-ai/claude-agent-sdk` 0.3.201 → 최신, 하드 게이트·전체 테스트 기준선 확인
- [x] 3. 가드 질문 회귀 실측 — G3 블랙박스 실측을 새 SDK에서 다시 돌려 판별이 성립하는지, 새 공식 필드(`suppressAlwaysAllowRule`·`defaultToNo`)가 오는지 확인. 새 SDK의 `supportedModels()` 응답도 이때 받는다
- [ ] 4. 실패하는 테스트 먼저 쓰기 — 공급자(성공·실패·캐시), 선택기 렌더, 정식 ID 저장, 「최소」 제거
- [ ] 5. 모델 목록 공급자와 IPC 만들기
- [ ] 6. 선택기·노력 메뉴·계기 고치기, 손 표 정리
- [ ] 7. 실제 앱으로 재기 — 선택기 innerText, 네 모델 한 턴씩, 옛 대화 열기
- [ ] 8. 독립 검수와 최종 검증
- [ ] 9. PR 올리고 병합 승인 요청

실행 단계 일괄 승인 대상 (사용자 「A로 가」·「이참에 SDK도 업데이트 해줘」·「좋아, 그렇게 진행해줘」)

- `package.json` 편집과 `npm install`, 저장소 밖 실험 스크립트로 SDK 호출(작은 모델, 짧은 프롬프트, 네 모델 각 한 턴), 독립 clone + 로컬 bare origin + 임시 userData로 앱 실행과 Playwright 조작, 하드 게이트 다섯 종, `npm test`, 하위 에이전트·검수자 기동, 커밋, 작업 브랜치 push, `gh pr create`

실험의 안전 규칙 — G1·G3 규칙을 그대로 따르고 하나를 더한다

- 앱과 앱 세션은 독립 clone에서, clone의 `origin`은 로컬 bare 저장소. 임시 `--user-data-dir`. 이 저장소 작업 트리를 앱 세션에 열지 않는다. 카드는 거부한다.
- **SDK·CLI 내부를 열람하지 않는다** — `claude.exe`·플랫폼 패키지·축소된 `sdk.mjs`·`cli.js`를 grep·해독하지 않는다. 근거는 공개 타입(`sdk.d.ts`)·공식 문서·요청이 돌려준 값뿐이다(사용자 지시 2026-11-16). 하위 에이전트 지시에도 맨 위에 넣는다.
- 실험 폴더 삭제가 가드에 막히면 사용자에게 명령을 건넨다.

DoD

- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-16T15:07:26+09:00 2단계 — `package.json`의 Agent SDK 명세를 `^0.3.201`에서 `^0.3.325`로 올리고 `npm install`, 설치본 `0.3.325` 확인(`package-lock.json` 37줄). 폴백 상수 `SDK_VERSION_FALLBACK`과 그 테스트 기댓값을 같이 올렸다. 하드 게이트 다섯 종 exit 0, `npm run test` 431 통과·6 건너뜀, 5827건 통과·실패 0 — SDK 업데이트로 깨진 타입·테스트 없음.
- PASS 2026-11-16T15:25:06+09:00 3단계 — SDK 0.3.325(CLI 2.1.325) 블랙박스 재측정(공개 타입과 반환값만, 내부 미열람). 가드 ask 20건(push·`gh release`·`npm publish`·`update-ref -d`·`gh repo edit` × default·acceptEdits·bypassPermissions·실행 중 auto)이 모두 콜백에 제안 없이 왔고 settings ask 규칙과 겹친 둘은 사유도 없었다 — G3 판별 성립. 세션 Bash 전체 허용 뒤에도 push 가드 ask는 콜백에 왔다(대조 명령은 콜백 없이 실행, bare refs 불변). 일반 질의 4종은 제안 1개 이상, plan 모드 `ExitPlanMode`만 제안 없음(0.3.201과 같음). `defaultToNo`·`suppressAlwaysAllowRule`은 28건 모두 값 없음. `supportedModels()`는 `initializationResult().models`와 같은 14행(별칭 `default`·`opus`·`fable`·`sonnet`·`haiku`가 각각 `claude-opus-5-5`·`claude-opus-5-5`·`claude-fable-5-2`·`claude-sonnet-5-5`·`claude-haiku-5-5`로 풀림)이고, 네 최신 ID와 다섯 별칭 아홉 개가 모두 한 턴 응답했다. 같은 계정·같은 시각에 0.3.201은 5행(`haiku`→`claude-haiku-4-5-20251001`)이라 목록은 CLI 버전에 따라 바뀐다 — SDK 업데이트가 모델 갱신 경로라는 A안 전제가 맞다. 공개 타입에 없는 필드(`decisionReasonType`·`serverPolicyAskOnly`·`supportsThinkingOff`)는 설계에 쓰지 않는다. 턴마다 `modelUsage`에 `claude-haiku-5-5` 항목이 함께 와서, 계기는 주 모델 항목을 골라야 한다.

## 결정 대장

- [USER] 모델 라인업을 최신본으로 바꾼다 — 「모델 라인업도 최신본으로 바꿔야겠네」, 「매번 SDK 업데이트 될 때마다 모델을 수동으로 업데이트하기 힘드니까…」 (2026-11-16)
- [USER] 모델 목록은 앱에 든 SDK의 `supportedModels()`로 가져오고, 사람 손은 SDK 갱신 하나만 남긴다 — A안(앱 SDK에 묻기)과 B안(설치된 CLI 사용) 중 「A로 가」 (2026-11-16)
- [USER] SDK를 최신으로 올린다 — 「이참에 SDK도 업데이트 해줘」. G3 실측이 0.3.201에 기대고 node_modules를 실험 clone과 공유하므로, 올리기는 G3 PR 뒤 G4 첫 실행 단계로 둔다. 순서는 「좋아, 그렇게 진행해줘」 (2026-11-16)
- [USER] SDK 동작은 공개 타입·문서·반환값으로만 검증한다 — 「API나 SDK로 받는 결과는, 요청시 받은 반환 데이터 기준으로 검증해야지, 멋대로 바이너리를 뜯어서 강제로 보면 어떻게하니」 (2026-11-16)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
