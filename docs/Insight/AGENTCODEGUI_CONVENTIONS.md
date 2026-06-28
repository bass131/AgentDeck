# AgentCodeGUI 코드 컨벤션·설계 철학 — 정밀 비교 (vs AgentDeck)

> **작성일**: 2026-06-29
> **대상 (upstream)**: `UnrealFactory/AgentCodeGUI` @ `f8e375e` (v1.3.3), 로컬 클론 `C:/Dev/AgentCodeGUI`
> **대상 (우리)**: AgentDeck @ `625f15f` (브랜치 `feature/rf1-trackC`)
> **방법**: 3개 분석 에이전트(upstream main/shared · upstream renderer · AgentDeck 대칭 분석) + 메인 세션 직접 정독. **모든 주장에 `파일:라인` 근거.**
> **성격**: 시점 *관찰*이지 결정이 아님. 액션으로 승격 시 ADR/Phase로 별도 상정. → 우선순위는 §3.

---

## 0. TL;DR

AgentCodeGUI는 **단일 시니어가 전체를 머릿속에 들고 만든** 코드라 컨벤션이 *균일하고 촘촘*하다. AgentDeck은 **AI 협업 + 하네스 거버넌스** 아래 만들어져 구조가 *외부화*(번호접두·두꺼운 계약 주석·순수 팩토리)돼 있다. 둘 다 시니어급(신뢰경계·라이프사이클·why-주석)이며, 비교의 올바른 질문은 *"누가 낫나"*가 아니라 **"upstream의 어떤 패턴이 제약과 무관하게 보편적으로 좋은가"**다.

- **배울 점 (learn)**: ① mutation 에러 계약 *일관성* ② LSP 자원 상한(LRU) ③ 반환 타입으로 클라이언트 행동 인코딩 ④ 낙관적 업데이트+롤백 ⑤ reducer `never` 망라성 가드 ⑥ 미세 UX 패턴.
- **이미 대등/앞선 것 (ahead)**: 신뢰경계 게이트(fs+LSP 동일 재사용·realpath 차단), 테스트 가능 순수 팩토리, ADR/Phase/원본:라인 인용 주석, 백엔드 추상화, TODO 0·`as any` 3.
- **정직한 약점 (weakness)**: 비원자적 JSON 쓰기, mutation 에러 계약 불일치, LSP 자원 무한 증가, 주석 과잉.

---

## 1. 메타-철학 — 구조 차이는 *우연*이 아니라 *제약의 반영*

이 비교에서 가장 값진 통찰. 두 코드의 구조적 선택은 각자의 *개발 제약*에서 직접 도출된다.

| 차원 | AgentCodeGUI (upstream) | AgentDeck |
|---|---|---|
| 만든 방식 | 단일 시니어, 전체를 기억에 보유 | AI 협업 + 하네스 거버넌스(다수 세션·compact) |
| `src/main` 구조 | **flat** — `maStore.ts`·`talkStore.ts`·`uiPrefs.ts` | **번호접두 모듈** `00_ipc`~`06_window` (ADR-027) |
| 상태관리(renderer) | store 없음 — `useReducer` 1개 + `useState` 다수 + `useEvent`/`memo` | Zustand 9슬라이스 + 좁은 셀렉터 |
| IPC 계약 | `protocol.ts` 575줄 + `api.ts` 259줄 (촘촘) | `ipc-contract.ts` 2290줄(≈70% 주석) + `agent-events.ts` 526줄 |
| 주석 | "이 버그를 막는다"는 *why* | *why* + **ADR·Phase·원본파일:라인 인용** |
| 테스트 결합 | main이 `electron`에 강결합(단위 테스트 난도↑) | main 모듈 `electron` import 0 = 순수 팩토리(Vitest 직접) |

**해석**: upstream의 컨벤션이 균일한 건 *한 사람이 전부 기억*하기 때문이다. AgentDeck의 구조 외부화는 *단일 기억자가 없기* 때문이다 — 번호접두는 에이전트가 길을 잃지 않게, 계약의 두꺼운 주석은 compact(대화 압축)로 맥락이 날아가도 살아남게, 순수 팩토리는 TDD를 강제하려고. AgentDeck의 "장황함"은 결함이 아니라 *협업 제약에 대한 적응*이다.

> **교훈(meta)**: 단일 시니어가 *머릿속 규칙*으로 강제하던 일관성을, 협업 프로젝트는 *코드/하네스로 외부화*해야 한다. 그래서 §3의 1순위가 "에러 계약 통일"이다 — 일관성이야말로 단일 기억자가 없을 때 가장 먼저 깨지는 것.

---

## 2. 차원별 정밀 비교

각 차원: **upstream 근거** → **AgentDeck 근거** → **판정**.

### 2.1 에러 처리

**upstream — mutation은 예외 없이 Result 타입.** 렌더러로 가는 모든 fs *변경*이 `{ ok, error }` 디스크리미네이티드 결과를 반환하고 던지지 않는다. `index.ts:642` — `catch (e) { return { ok: false, error: (e as Error)?.message || '이름을 바꿀 수 없어요' } }`. 읽기는 센티넬로 degrade(`readFile`→`content:null`+`error`, `index.ts:704-733`). LSP 핸들러는 `.catch(() => null)`/`.catch(() => [])`로 "뷰어가 hover/jump만 잃고 절대 에러 안 남"을 명문화(`index.ts:758`).

**AgentDeck — 읽기는 동일하게 graceful, mutation은 *불일치*.**
- 읽기 degrade: `FS_READ`→`{kind:'not-found'}`(`read.ts:65`), `LIST_FILES`/`FS_LIST_DIR`→`{files:[]}`/`{entries:[]}`(`00_ipc/index.ts:617-666`), `store.load`→`null`(`04_persistence/store.ts:192`).
- 그러나 mutation 계약이 **4종 혼재**: `gitCommit/Push/Pull`→`{ok,error}`(`git.ts:489`, 자격증명 마스킹 포함) / `CONVERSATION_DELETE/RENAME`→`{ok}`(에러 없음) / `REFERENCE_ADD`→`{reference:null}`(Result 아님) / `CONVERSATION_SAVE`·`AGENT_RUN`·`store.save`→**throw**(`index.ts:717,722`, `store.ts:231`). **같은 conversation store가 throw하는 `save`와 Result 반환 `delete`로 동시에 접근됨.**

**판정: learn (weakness).** upstream의 *균일성*이 더 성숙. IPC 경계에선 예외가 직렬화되며 타입을 잃으므로 Result가 유리. → §3 P1.

### 2.2 신뢰경계 · 경로 보안

**upstream — 경로 탈출 가드 + 명시적 근거 주석.** `files.ts:138-141` — `if (abs !== root && !abs.startsWith(root + path.sep)) return []` // *"a crafted ../ rel could otherwise browse anywhere"*. `fsMove`는 containment + 자기-안으로-이동 거부(`index.ts:666-672`), `fsRename`은 새 이름의 경로구분자·`.`/`..` 거부(`index.ts:636`). argv는 *packaged일 때만* 신뢰(`index.ts:63-75`), `setWindowOpenHandler`는 항상 `{action:'deny'}`(`index.ts:441`), `saveImageData`는 ext를 화이트리스트 검증 후 `randomUUID()` 파일명(`index.ts:581`).

**AgentDeck — 동등 강도 + *symlink 차단까지* + 게이트 재사용.** `resolveSafe(root,p)`(`02_fs/workspace.ts:69-85`)가 ① string containment(`isWithin`: resolve+slash정규화+win32 lowercase+`startsWith(root+'/')`) ② **realpath containment**(가장 깊은 실존 조상 기준 — symlink/junction 탈출 차단). rootId 레지스트리(`02_fs/roots.ts:120`)가 불투명 ID→신뢰 경로 매핑, 미등록 ID→`null`. **LSP가 동일 게이트 재사용**(`03_lsp/manager.ts:294-303,492-498` — `definition` 결과의 워크스페이스 밖 절대경로는 `toRelPath`로 드롭). 탈출·미존재 둘 다 `not-found`로 *은닉*(`read.ts:65`).

**판정: ahead (parity 이상).** 양쪽 강하지만 AgentDeck이 realpath 차단 + fs/LSP 단일 게이트 재사용으로 더 체계적. 헌법 CRITICAL 신뢰경계 규칙이 코드에 박힌 결과.

### 2.3 IPC 계약 설계

**upstream — 단일 SoT, thin router.** 채널명은 `protocol.ts`의 `IPC` 객체에만(`index.ts:21`), 양쪽 import. 핸들러는 1줄 위임이 다수: `ipcMain.handle(IPC.gitRoot, async (_e,a) => gitApi.gitRoot(a.cwd||'', !!a.force))`(`index.ts:760`). 멀티-arg는 단일 객체 `a:{...}`. preload 표면은 `git`/`lsp`/`win`/`talk`/`multi` 등으로 네임스페이스, 메서드마다 JSDoc(단위 명시), 구독은 일관되게 unsubscribe 함수 반환(`api.ts:205`).

**AgentDeck — 단일 SoT, 2290줄의 정체 = *주석 밀도 + 더 넓은 표면*(타입 비대 아님).** `IPC_CHANNELS`(`ipc-contract.ts:60`)에만 채널 존재, 헌법이 "문자열 채널 산재 금지" 강제. 87 `interface` + 23 `type`이 20개 문서화 섹션. 추가 표면은 *실제 기능 격차*: 듀얼백엔드(`BackendId`·`BACKEND_LABELS`), 오케스트레이션, usage 게이지, 엔진 버전관리(ADR-018), LSP, 멀티세션 영속. 채널마다 의도+보안노트 인라인(예: `FS_LIST_DIR`의 15줄 보안 독블록 `ipc-contract.ts:91-106`).

**판정: parity (장단 교환).** 양쪽 단일 SoT. upstream은 *촘촘*, AgentDeck은 *맥락 보존*(compact 너머로 의도 살아남음)을 택해 ≈70%가 주석 — 신호는 높지만 그 자체가 유지보수 표면.

### 2.4 프로세스 · 자원 라이프사이클 (방어 공학)

**upstream — 깊은 방어 + 플랫폼 지식.**
- crash 쿨다운 `RESPAWN_COOLDOWN=30_000` // *"broken install can't spawn-loop"*(`manager.ts:166`).
- **bounded working set** — `MAX_OPEN_DOCS=32`, 초과 시 가장 오래된 doc `didClose`(LRU, `manager.ts:163,1437`).
- **프로세스 트리 kill** — Windows `taskkill /T /F` // *"child.kill() leaves grandchildren (OmniSharp MSBuild) holding file locks"*(`manager.ts:226`).
- 양쪽 종료 경로 모두 dispose(`window-all-closed`+`before-quit`), 의도적 restart는 쿨다운 우회(맵에서 먼저 삭제, `manager.ts:738`).
- 타이머가 제스처보다 오래 살지 않게 `blur`에서 강제 종료 // *"a timer that outlives its mouseup is what made the window keep growing"*(`index.ts:191`).

**AgentDeck — crash 쿨다운·taskkill·전 경로 dispose는 *동등*, 단 *상한 없음*.** `RESPAWN_COOLDOWN=30_000`(`03_lsp/manager.ts:189`), `killTree` taskkill /T /F(`:118`), `ready.catch`/`on('error')`/`on('exit')` 각각 `diedAt` 스탬프+`rpc.dispose`(`:421-439`), `closeAll()`이 종료 시 전 run abort(`agent-runs.ts:112`, `index.ts:184`). 파일워크는 `MAX_FILES` 상한(`listFiles.ts:34`), 트리는 1레벨 lazy(`workspace.ts:142`, node_modules 폭발 방지). **그러나 `servers`·`tokenCache`·`openedUris`에 LRU/상한 없음 — 세션 내 distinct 파일/루트마다 무한 증가.**

**판정: learn (weakness).** 핵심 방어는 대등하나 **LSP 자원 상한이 빠짐**. → §3 P2.

### 2.5 영속화

**upstream — 데이터 크기에 맞춘 메커니즘 + debounce.** `maStore`/`talkStore`는 단일 동기 JSON blob *"data is small and bounded (≤6 panels)"*(`maStore.ts:5`), 원자적 쓰기·debounce·마이그레이션 없음(의도적). 렌더러가 스키마 소유, main은 dumb pipe(payload `unknown`). 윈도우 상태는 더 무거운 처리: debounce 400ms(`scheduleSave`)+타입검증 로드+오프스크린 폐기. 단일 홈 `~/.agentcodegui` // *"survives appId/name changes"*. chats 600ms·prefs 250ms debounce + `beforeunload` flush.

**AgentDeck — 크기 맞춤은 동일, 변경캐시 있으나 *비원자적·debounce 없음*.** 대화는 fan-out(`<id>.json`+`index.json`, `store.ts:10`), multi-agent/ui-prefs/profile은 단일 blob, 버전 blob은 forward-degrade(`multiStore.ts:40`). 변경캐시로 중복쓰기 skip(`if cache.get(id)!==json`, `store.ts:268`). **그러나 전부 raw `writeFileSync` — temp+rename/fsync 없음**(검색으로 확인). 읽기측 graceful 복구 + 채팅별 fan-out으로 *완화*되나 쓰기 도중 크래시 시 JSON 절단 가능. debounce 없음(동기 쓰기, `close()`는 no-op).

**판정: weakness (parity-ish).** 크기 맞춤 영속은 대등. **비원자적 쓰기는 양쪽 공통 개선 여지**지만 AgentDeck은 upstream의 debounce+`beforeunload` flush조차 없어 더 노출. → §3 보조.

### 2.6 주석 철학

**upstream — 압도적 why, "막는 버그"를 콕 집음(종종 숫자 포함).**
- `session.ts:295` — *"A full Write replaces the whole file... otherwise re-writing stacks a second block and double-counts (+17 then +41 → +58)."*
- `index.ts:917` — transparent window + fractional DPI에서 `setPosition`이 매 호출 ~1px 키워 드래그가 창을 무한 확대 → `setBounds`로 고정.
- `manager.ts:778`(KR) — *"빈 토큰 = 지원하지만 아직 없음. null은 이 서버는 시맨틱 토큰 자체가 없음에만 — 그래야 렌더러가 폴링을 멈춘다."*
- 이중언어: 구조/아키텍처=영어, 도메인(UEFN/Verse/Roslyn) 기벽=한국어.

**AgentDeck — 동등한 why + *거버넌스 추적성* 추가.**
- `slices/selector.ts:175` — *"CRITICAL: 빈 배열 상수를 반환하지 않는다(매 호출 새 참조 → 불필요 리렌더)."*
- `multiStore.ts:82` — *"resolveSafe 미사용 근거: panel.cwd는 자체 루트인 독립 절대경로라 containment 검증 불필요."*(거부된 대안 명시)
- `workspace.ts:144` — *"이전: 전체 재귀 → node_modules 포함 대형 repo에서 폭발(W5). 이후: 루트+1레벨만."*(설계 이력)
- 주석이 **ADR-007/008/020/024·Phase 번호·원본파일:라인**을 일상적으로 인용(`store.ts:17`). `CRITICAL(신뢰경계)` 마커가 모든 경계 모듈 헤더에 정형화.

**판정: ahead (단, 과잉 주의).** AgentDeck이 추적성에서 앞섬(compact 너머 결정 근거 보존). 대가는 반복(`CRITICAL(신뢰경계)` 보일러플레이트, 계약 ≈70% 주석).

### 2.7 렌더러 상태관리

**upstream — store 없이 리렌더 규율.** `useAgentSession()`이 유일한 `useReducer`(`session.ts:473`), 나머지는 `MainApp`의 `useState` ~30개. `useEvent`(영구 함수가 항상 최신 클로저 호출, `App.tsx:79`)+`memo`로 *prop drilling을 공짜로* 만듦 — store의 의도적 대안. prop 변경 리셋은 effect 아닌 *렌더 중*(`Explorer.tsx:91`, 깜빡임 방지). prefs는 React 밖 동기 모듈 캐시(`prefs.ts:7`, FOUC 방지). reducer 망라성 `never` 가드 — `default: return ((_x:never)=>state)(e)`(`session.ts:461`, 미처리 변종 시 빌드 실패). `/ask`는 같은 reducer를 다른 `subscribe`로 격리 재사용(`session.ts:467`).

**AgentDeck — 슬라이스 Zustand + 좁은 셀렉터 규율.** `appStore.ts`는 62줄 조립 루트가 9슬라이스 spread(`:33-46`), `AgentEvent→state` reducer는 `reducer/*.ts`로 분할 후 thin dispatcher(`reducer.ts:141`). ~50개 단일필드 셀렉터(`slices/selector.ts`), 87개 `useAppStore(select...)` 사용처, `useShallow` 0(좁은 셀렉터+참조안정 업데이트로 규율). 단방향: `onAgentEvent→applyAgentEvent→state→components`, 컴포넌트는 슬라이스 액션 통해서만 `window.api`(`conversation.ts:11`). **네이티브 다이얼로그 0**(alert/confirm 0개) — 에러는 `role="alert"` 배너+인라인 notice(`Conversation.tsx:343`). 단 **낙관적-롤백 없음**(fire-and-set, `conversation.ts:104`).

**판정: parity (다른 경로, 같은 목적) + 2개 learn.** "store vs 좁은셀렉터"는 동등하게 유효한 리렌더 규율. **배울 것: ① reducer `never` 가드(AgentDeck 확인 필요) ② 낙관적 업데이트+진실 롤백.** → §3 P3.

### 2.8 네이밍 · 구조 · UX 장인정신

**upstream.** 함수=짧은 동사(`ensure`/`prep`/`killTree`/`warm`), 상수=SCREAMING_SNAKE, 채널=camelCase. CSS는 도메인별 짧은 prefix(`.pr-*` 모달 primitive·`.fv-*` 뷰어·`.exp-*` 탐색기)로 충돌 회피 — **그리고 오버레이 클래스명이 곧 모달 레지스트리**(전역 키핸들러가 `.fv-overlay,.pr-overlay`를 `querySelector`해 "모달 열렸나" 판정, `App.tsx:530`). 인라인 스타일은 *계산값 전용*(indent·커서앵커 팝오버·데이터구동 색), 정적은 CSS 변수 토큰. UX 디테일: 캡처페이즈로 부모 `stopPropagation` 우회(`Settings.tsx:103`), 스크롤-따라가기 latch(휠 deltaY로 의도 읽기, `App.tsx:319`), 이름변경 시 확장자 앞까지만 선택(`FileOpModal.tsx:39`), 숫자키 권한 선택(`Chat.tsx:1275`). ARIA 전면 정확, 디스크리미네이티드 유니온으로 N개 다이얼로그를 1컴포넌트+룩업테이블로(`FileOpModal.tsx:6-56`).

**AgentDeck.** 번호접두 `NN_`가 *레이어/파이프라인 순서*를 인코딩(main·renderer 양쪽 일관). 팩토리 네이밍 균일(`createRootRegistry`/`createLspManager`/`create*Slice`). CSS는 컴포넌트별 co-located `.css`, kebab BEM-ish. 섹션 디바이더(`// ── 제목 ──`·`═══` 배너)로 긴 파일 구조화. 망라성·stale-async 가드 등 방어 다수(`genRef` 카운터로 순서 어긋난 IPC 응답 폐기는 upstream `Explorer.tsx:176` 패턴 — AgentDeck도 유사 필요 시 참고).

**판정: parity + learn(미세 UX).** 구조 철학은 각자 일관. **upstream의 미세 UX 패턴(캡처페이즈·스크롤 latch·확장자 제외 선택·오버레이 레지스트리)은 AgentDeck이 파일 CRUD UI를 만들 때 직접 참고.** → §3 P4.

---

## 3. 배울 점 — 우선순위 액션 후보

> 전부 `docs`/`ADR`/코드 변경이라 **영호 단독 통제 + ask 게이트**. 여기선 *후보 박제*만, 승격은 별도.

### P1 — mutation 에러 계약 통일 〔learn·weakness, 영향 中〕
- **무엇**: 신뢰경계 넘는 모든 mutation을 단일 계약(`{ok, error}` 권장)으로. 현재 throw/`{ok}`/`{ok,error}`/`null` 4종 혼재(§2.1).
- **근거**: upstream은 100% Result(`index.ts:630-746`). AgentDeck은 같은 store가 throw `save` + Result `delete`로 접근(`store.ts:231` vs `index.ts:756`).
- **트레이드오프**: 호출부마다 `if(!r.ok)` 강제로 약간 장황 ↔ "어디선 throw, 어디선 ok" 혼재가 더 위험.
- **범위**: 00_ipc 핸들러 + 호출 슬라이스. 계약 변경이라 shared-contract 깃발 → reviewer 무조건.

### P2 — LSP 자원 상한(LRU) 〔learn·weakness, 영향 中〕
- **무엇**: `servers`/`tokenCache`/`openedUris`에 상한+eviction. upstream `MAX_OPEN_DOCS=32` LRU(`manager.ts:163`).
- **근거**: AgentDeck은 crash쿨다운·taskkill·dispose는 있으나 상한 없음(§2.4) → 긴 세션에서 LSP 메모리 단조 증가.
- **트레이드오프**: eviction 후 재방문 파일은 재인덱싱 비용 ↔ 무한 증가 방지.
- **범위**: `03_lsp/manager.ts` 단일 파일, 계약 불변 → 저위험.

### P3 — 낙관적 업데이트 + reducer `never` 가드 〔learn, 영향 小·고가치〕
- **(a) `never` 가드**: 분할 reducer dispatcher에 `default: ((_x:never)=>state)(e)` 추가 → 새 `AgentEvent` 변종 미처리 시 *빌드 실패*. upstream `session.ts:461`. **먼저 AgentDeck `reducer.ts:141`에 이미 있는지 확인.**
- **(b) 낙관적+롤백**: 토글/CRUD UI에서 즉시 반영 후 실패 시 `refresh()`로 저장된 진실 복원. upstream `Settings.tsx:395`. AgentDeck은 fire-and-set(`conversation.ts:104`).
- **트레이드오프**: 낙관적은 코드 복잡도↑ ↔ 체감 반응성↑. `never` 가드는 거의 공짜.

### P4 — 미세 UX 패턴 (파일 CRUD UI 구축 시) 〔learn, 영향 상황의존〕
지난 세션 식별한 "탐색기 파일 CRUD 갭"을 구현할 때 upstream 패턴 차용:
- 캡처페이즈로 부모 `stopPropagation` 우회(`Settings.tsx:103`)
- 스크롤-따라가기 latch — 휠 deltaY로 의도 판독(`App.tsx:319`)
- 이름변경 시 확장자 제외 선택(`FileOpModal.tsx:39`)
- 오버레이 클래스명=모달 레지스트리(전역 키 핸들러 `querySelector`, `App.tsx:530`)
- N다이얼로그→1컴포넌트+유니온+룩업테이블(`FileOpModal.tsx:6-56`)
- **단 신뢰경계**: 파일 쓰기는 반드시 main IPC 경유(renderer 직접 fs 금지) — upstream `fsMove` containment 가드(`index.ts:666`)를 AgentDeck `resolveSafe`로 구현.

---

## 4. AgentDeck이 이미 대등하거나 앞선 것 (ahead — 베끼지 말 것)

- **신뢰경계 게이트**: `resolveSafe`가 realpath로 symlink 탈출까지 차단 + fs/LSP **동일 게이트 재사용**(§2.2). upstream보다 체계적.
- **테스트 가능성**: main 모듈 `electron` import 0 = 순수 팩토리 → Vitest 직접. upstream main은 electron 강결합(`app`/`BrowserWindow` 직참조)이라 단위 테스트 난도↑. TDD 거버넌스의 산물.
- **주석 추적성**: why + ADR/Phase/원본:라인 인용으로 compact 너머 결정 근거 보존(§2.6).
- **백엔드 추상화**: `AgentBackend` 인터페이스(ADR-003) — 설계상 upstream엔 없음(Claude 직결).
- **위생**: `TODO`/`FIXME`/`HACK` 0, `as any` 3개(전부 SDK 동적 import 경계). 자격증명 마스킹이 git 에러 계층에(`maskCredentials`).

> **시사점**: "원본이 시니어니까 다 따른다"는 오답. AgentDeck의 거버넌스(TDD·신뢰경계·ADR)는 *단일 시니어 코드가 구조적으로 갖기 어려운* 강점을 만들었다.

---

## 5. AgentDeck의 정직한 약점 (weakness)

1. **비원자적 JSON 쓰기** — temp+rename/fsync 없음(`store.ts:270`·`multiStore.ts:67`·`prefs.ts:180`). 크래시 시 절단 가능. 가장 물질적인 견고성 갭. *완화*: 읽기측 graceful 복구 + fan-out 폭발반경 축소. (upstream의 작은 blob도 원자적은 아니나 debounce+`beforeunload` flush는 함.)
2. **mutation 에러 계약 불일치** — §2.1 / §3 P1.
3. **LSP 자원 무한 증가** — §2.4 / §3 P2.
4. **주석 과잉** — 계약 ≈70% 주석, `CRITICAL(신뢰경계)` 반복. 신호는 높지만 유지보수 표면.

---

## 부록 A — upstream v1.3.x 업데이트 요약 + 전략 함의

이번에 pull한 6커밋(`f497e7e`→`f8e375e`, v1.3.0→v1.3.3)은 **압도적으로 Verse 언어 지원**(Verse = Epic UEFN/포트나이트 스크립트):

| 분류 | 내용 |
|---|---|
| Verse 전용 (~85%) | Verse 호버 카드 대폭 개선 · 공식 API 한국어 호버(`/Verse.org`·`/UnrealEngine.com`·`/Fortnite.com` 원문↔한국어 토글) · 선언부 호버 · 자동완성(`@속성`·`<지정자>`) · 탐색기 Verse API 그룹 · `verse-doc-*.cjs` 7개 · `verse-lsp` 연동 |
| 일반 UX (벤치마크 후보) | 탐색기 우클릭 메뉴 + 드래그 이동 + 필터 + 보던 폴더 기억 · **`FileOpModal`(파일 CRUD)** |
| 알림 UI | `NoticeModal`·`UpdateNotes`·`WhatsNew` |

**전략 함의**: AgentCodeGUI가 점점 **Verse/Unreal 전용 IDE로 분화** 중. FEATURE_MAP의 *"Track 1 = 완전 복제"* 정의가 흔들린다 — upstream 신규의 대부분이 도메인 특화라 복제 대상이 아니거나 AgentDeck 방향과 불일치. 다행히 AgentDeck은 "M5(배포)만 남은" 상태이고 이번 업데이트는 배포 트랙에 무영향. **검토 제안**: FEATURE_MAP에서 *"Verse는 명시적 scope-out"*을 박제하고, 일반 UX 후보(파일 CRUD)만 선별 흡수. (FEATURE_MAP 수정은 영호 단독.)

---

## 부록 B — 근거 파일 인덱스

**upstream (`C:/Dev/AgentCodeGUI`)**: `src/main/files.ts` · `src/main/index.ts` · `src/main/lsp/manager.ts` · `src/main/maStore.ts` · `src/main/talkStore.ts` · `src/shared/protocol.ts` · `src/shared/api.ts` · `src/renderer/src/App.tsx` · `src/renderer/src/store/session.ts` · `src/renderer/src/lib/prefs.ts` · `src/renderer/src/components/{FileOpModal,Explorer,Settings,Chat,FileModal}.tsx`

**AgentDeck**: `src/shared/ipc-contract.ts` · `src/shared/agent-events.ts` · `src/main/00_ipc/index.ts` · `src/main/02_fs/{workspace,read,roots,listFiles}.ts` · `src/main/03_lsp/manager.ts` · `src/main/04_persistence/store.ts` · `src/main/multiStore.ts` · `src/main/prefs.ts` · `src/main/git.ts` · `src/renderer/src/store/{appStore,reducer}.ts` · `src/renderer/src/store/slices/{selector,conversation}.ts` · `src/renderer/src/store/reducer/notice.ts` · `src/renderer/src/components/01_conversation/Conversation.tsx`
