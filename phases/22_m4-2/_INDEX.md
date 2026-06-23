# Phase 22 — M4-2: 대화 고도화 (슬래시·@mention·이미지·큐)

> SDK 전환(Phase 21)으로 헤드리스 제약이 풀린 4기능을 **실 데이터/동작에 배선**. 원본 AgentCodeGUI 미러.
> 핵심 발견(Explore 2026-06-23): **원본은 4기능 모두 prompt를 STRING으로 유지** — 이미지·@mention을 "텍스트 노트"로 첨부하고 에이전트가 Read 도구로 가져옴. 슬래시는 `/command`를 그대로 prompt로 전송 → SDK 네이티브 해석. **→ AgentRunInput.prompt(string) 불변, 구조화 콘텐츠 불요.**
> UI는 충실도 트랙(F1~F15)에서 이미 구축됨 — `Composer.tsx`에 `parseSlashQuery`·`parseMentionToken`·`QueuedMessage`·이미지 상태·`onSlashAsk`·큐 스트립 존재하나 **샘플 데이터(`SAMPLE_MENTION_ROOT`)에 배선**. M4-2 = 실 데이터/액션 연결 + 소수 IPC(listFiles/saveImageData/pathForFile).
> 신뢰경계 CRITICAL — fs(listFiles·이미지 temp 저장)는 **main 단독**. renderer는 IPC만. 경로는 워크스페이스 경계 검증.

## 근거 (원본 매핑 — Explore, file:line)
- **슬래시**: `Chat.tsx:136-143` `SLASH_COMMANDS` 정적 + skills. `App.tsx:584` `commandOf(text)`로 cmd명 추출. `App.tsx:567/574` **클라이언트 인터셉트**(`/clear`→clearConversation, `/ask`→AskModal). 그 외 `/command`는 `engine.ts:279` `prompt=req.prompt`로 **그대로 query()** → SDK 네이티브 실행. 커맨드는 mention/image 노트 미첨부.
- **슬래시 차단 게이트 스파이크 PASS(2026-06-23, `artifacts/slash-spike*.mjs`)**: SDK init이 **`slash_commands` 목록 노출**(compact·init·review·security-review·clear·config·context·usage 등). raw `/command`를 query()에 보내면 SDK가 **인터셉트·실행**(turns=0, 모델 미호출). 검증: `/context`→실 컨텍스트 사용량 출력(네이티브 실행 확인), `/help`→"isn't available in this environment"(일부 커맨드만 미지원, 원본도 /help 미사용). **결론: in-list 커맨드(compact/init/review/security-review)는 raw 전송으로 실행, /clear·/ask는 클라이언트 인터셉트.** ← 헤드리스 CLI에선 불가했던 기능이 SDK로 해소됨(마이그레이션 가치 입증).
- **@mention**: `Chat.tsx:1506-1590` 팔레트(`window.api.listFiles(base)`). `mentions.ts:39-54` `extractMentions(text)` 정규식 `/(^|\s)@([^\s@]+)/g`. `App.tsx:618-620` 추출 멘션을 `[멘션된 파일 — 필요하면 Read 도구로 확인하세요]\n- path...` 노트로 **prompt에 append**(인라인 @path도 유지).
- **이미지**: `Chat.tsx:1674-1693` drop/paste/picker → `images.ts:35-58` `filesToImagePaths`(디스크=`pathForFile`, 클립보드=`saveImageData`→temp 파일 경로). `App.tsx:621-622` 경로를 `[첨부 이미지 — Read 도구로 확인하세요]\n- path...` 노트로 prompt append. **구조화 content 아님**(원본도 텍스트 노트).
- **큐**: `App.tsx:122` `ScheduledMsg[]`(id/text/images/picker). `App.tsx:647-654` `scheduleMessage`(busy 중 Enter→enqueue). `App.tsx:656-668` 드레인 effect(**busy→idle 전이** + queue>0 → 첫 메시지 pop → runPrompt). `engine.ts:523` result→done이 busy=false 트리거.

## 설계 결정
1. **prompt=string 불변, 노트 첨부는 renderer**: mention/image는 **전송 직전 renderer가 prompt 문자열에 노트를 합성**(원본 `App.tsx:615-624` 미러). AgentRunInput/백엔드/shared 계약 **불변**. 슬래시는 raw `/command`를 prompt로 전송(이미 지원).
2. **신뢰경계**: `listFiles(dir)`·`saveImageData(bytes,ext)`·`pathForFile(file)`는 main IPC 핸들러(fs는 main 단독). listFiles는 **워크스페이스 루트 하위만**(경로 이탈 차단). saveImageData는 앱 전용 attachments 디렉토리에만 기록. 채널/타입은 `src/shared/ipc-contract.ts` 단일 정의.
3. **클라이언트 인터셉트**: `/clear`(대화 리셋)·`/ask`(독립 모달, `onSlashAsk` 기존 훅)는 엔진 미경유. 나머지 슬래시는 전송.
4. **커맨드 결과 카드**(`/init완료`·`/compact 요약`) = **범위 외**(M4-3 세션 트래킹) — 이번엔 슬래시가 일반 응답으로 흐르면 충분.
5. **큐 = renderer 상태**: 기존 `QueuedMessage`/큐 스트립 재사용. enqueue(busy 중 Enter)·드레인(isRunning true→false 전이 + 큐>0 → 첫 메시지 자동 전송) 로직을 store/Composer/Conversation에 배선. 드레인 시 picker(model/effort/mode)도 캡처값 사용.
6. **이미지 구조화 콘텐츠**(content blocks) = **범위 외**(원본도 텍스트 노트; 더 풍부한 비전 입력은 후속). MVP=경로 노트.
7. **샘플 데이터 제거**: `SAMPLE_MENTION_ROOT`/`SAMPLE_MENTION_CHILDREN`를 실 `listFiles`로 교체(mention 팔레트). slash/queue는 이미 실 구조라 배선만.

## 추가/변경 계약 (shared) — additive
- `src/shared/ipc-contract.ts`: `LIST_FILES`·`SAVE_IMAGE_DATA`·`PATH_FOR_FILE` 채널 + req/res 타입 — **신규 확정**(auditor: 기존 `FS_READ`=단일파일·`WORKSPACE_TREE`=전체트리라 dir 드릴다운·이미지 저장과 불일치, 재사용 불가). preload 화이트리스트 노출.
- 기존 AGENT_RUN/AgentEvent/AgentRunInput **불변**(prompt 노트는 renderer 합성).

## 서브웨이브 (의존성 순서, 각 TDD, 슬래시 우선=최저비용·최고가치)
- **22a (슬래시)** — renderer 중심: `parseSlashQuery`+팔레트(이미 존재) → 선택/Enter 시 raw `/command` 전송 배선 + 클라이언트 인터셉트(`/clear`·`/ask`). 백엔드 불변. **차단 게이트 = 위 스파이크로 PASS**(폴백 불요). qa: 슬래시 **전송 경로**·인터셉트 단위만 단언(도구 실행 성공·권한모드 상호작용은 ⑦ 라이브로 — 22a 단위가 과대 단언 금지). *(shared/main 변경 0 예상.)*
- **22b (@mention 실 데이터)** — shared-ipc(`LIST_FILES` 계약) → main(`listFiles` 핸들러, 워크스페이스 경계 검증) → renderer(mention 팔레트 샘플→실 listFiles, `extractMentions`+노트 합성). 신뢰경계 reviewer.
- **22c (이미지)** — shared-ipc(`SAVE_IMAGE_DATA`/`PATH_FOR_FILE`) → main(temp 저장 핸들러, 앱 attachments 디렉토리 한정) → renderer(drop/paste/picker→경로→노트 합성, 기존 이미지 트레이·`onOpenImage` 연결). 신뢰경계 reviewer.
- **22d (큐 드레인)** — renderer-**store** 중심(배선 아닌 **reducer 신규**, auditor): store에 큐 상태(현재 부재) + enqueue(busy 중 Enter)·드레인(isRunning true→false 전이) + Composer 큐 스트립 배선. 다른 웨이브의 onSend 노트 합성이 먼저 안정돼야 그 위에 얹힘(마지막 순서). qa: enqueue/드레인 순서·picker 캡처 reducer 단위.

## 검증 / 완료조건
- 각 서브웨이브 = Worker TDD(실패 테스트 먼저) → reviewer(**신뢰경계 CRITICAL**: fs main 단독·경로 워크스페이스/attachments 경계·renderer untrusted·IPC 계약 단일·API 키 0) → typecheck 양쪽 + 단위 green → conventional commit.
- **완료조건(측정가능)**: ① 슬래시 — `/compact` 입력 전송 시 prompt에 `/compact` 그대로 도달(백엔드 input 단언) + `/clear`·`/ask` 인터셉트(엔진 미호출). ② @mention — 팔레트가 실 listFiles 결과 표시(샘플 0) + `@src/x.ts` 전송 시 prompt에 멘션 노트 합성(원본 포맷). ③ 이미지 — paste/drop/picker가 경로 확보 + prompt에 이미지 노트 합성 + temp 저장이 attachments 디렉토리 한정(경로 이탈 0). ④ 큐 — busy 중 Enter→enqueue, isRunning false 전이 시 첫 메시지 자동 전송(picker 캡처값) + 순서 보존. ⑤ listFiles가 워크스페이스 외 경로 거부(신뢰경계 단위). ⑥ **기존 단위 전부 green + 신규 green**(절대 카운트 비의존). ⑦ **라이브 검증**(LIVE_SDK=1 e2e 확장 또는 dev 앱): in-list 슬래시(예 `/context`/`/compact`) 실 실행 + 이미지 1장 실 첨부→**응답이 이미지 내용을 실제 인지**(경로 첨부만으로 비전 인지 보장 안 됨 — SDK Read 도구의 이미지 디코딩 동등성 미검증, 인지 실패 시 이미지 기능 "조용한 무동작" 위험이므로 인지까지 단언).
- **범위 외(후속)**: 커맨드 결과 카드/세션 트래킹·멀티 동시실행(M4-3) / 권한·질문 응답·thinking/subagent/todo 이벤트·이미지 구조화 콘텐츠·실시간 per-turn context(M4-4).
