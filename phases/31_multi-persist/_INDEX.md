# Phase 31 — M3: 멀티 세션 영속 (W2β, JSON blob)

> 드라이버: `docs/WEAKNESS_BOOST.md` M3. "most-lacking" 본체 — 멀티 패널 워크스페이스가 재시작에 휘발하는 약점 정조준.
> 등급: **대규모(다도메인·교차)**. shared + main + renderer를 동반. ADR-021 신설(사용자 게이트).

## 0. 스코프 결정 (Explore 매핑 근거)
현 멀티(`MultiWorkspace.tsx`)는 **단일뷰 N패널**(count 2~6, 세션그룹 없음), 멀티 영속 **전무**, 패널 메타 전부 `SAMPLE_PANELS` 하드코딩, ThreadItem은 JSON 직렬화 100% 가능.
- **IN**: 멀티 패널 워크스페이스(메타 {title,cwd,picker,sysPrompt,count} + **thread 스냅샷**)를 `userData/multi-agent.json` blob에 저장 → 마운트 복원 → 디바운스 저장. 패널 메타 **실데이터화**(SAMPLE은 first-run 기본값으로만). sysPrompt(M2) 패널 편집 → 영속 + 실행 반영.
- **OUT**: 원본의 **멀티 세션그룹 사이드바**(recent-tasks, 여러 세션 생성/전환/삭제) — 7약점 밖. PersistedMultiState는 `sessions[]` 봉투를 쓰되 M3는 **단일 활성 세션만** 채움(forward-compat). 그룹 UI는 후속 증분.

## 1. 목표 (왜)
원본은 멀티 워크스페이스(패널 레이아웃 + 각 패널 세션 스냅샷)를 `multi-agent.json` JSON blob에 저장(maStore.ts) → 재시작에 복원. 우리는 전무 → 폴더 선택·프롬프트·대화가 매 재구동 소실. W2β = most-lacking.

## 2. 범위 (무엇) — 도메인별

### A. shared-ipc (`src/shared/ipc-contract.ts` + `src/preload/index.ts`)
1. 타입(원본 MultiAgent.tsx L82-130 미러) — **의존방향 CRITICAL(B1): shared는 renderer를 import 금지**. 따라서 shared 내 자족 타입만:
   - `PersistedMsg { id: string; role: 'user' | 'assistant'; text: string; error?: boolean; images?: string[] }` — **B1+S3 해소**: ThreadItem(renderer) 대신 shared 자족 최소 메시지 타입. (패널은 msg 버블만 렌더 — MultiWorkspace L504 — 이라 toolgroup/thinking은 영속/복원 불필요. 비대·죽은데이터·ToolCard(unknown) shared 의존 동시 제거.)
   - `PersistedPicker { model: string; effort: string; mode: string }` — PickerState(renderer) 대신 shared 자족 picker 타입(직렬화용).
   - `PanelThreadSnapshot { messages: PersistedMsg[]; seq: number; lastUsage?: TokenUsage; lastContextWindow?: number }` — `TokenUsage`는 **이미 shared**(`agent-events.ts` L19) 재사용. 휘발 필드(currentRunId/status) 제외.
   - `PersistedPanel { title: string; cwd?: string; picker: PersistedPicker; sysPrompt?: string; snapshot?: PanelThreadSnapshot }`
   - `PersistedMultiSession { id: string; title?: string; count: number; panels: PersistedPanel[] }`
   - `PersistedMultiState { version: number; activeSessionId: string; sessions: PersistedMultiSession[] }` — **version 고정 = 2**(원본 `MULTI_VERSION=2` 미러, S1). version 불일치 blob → graceful null(원본 동형).
2. 채널: `MULTI_SESSION_SAVE: 'multiSession.save'` · `MULTI_SESSION_LOAD: 'multiSession.load'`(conversation.save/load 패턴 미러). 요청/응답 타입.
3. preload: `multiSessionSave(state)`·`multiSessionLoad()` 화이트리스트 노출.

### B. main-process (`src/main/multiStore.ts` 신규 + `src/main/ipc/index.ts` + `src/main/index.ts`)
1. `multiStore.ts`(원본 maStore.ts 미러): `userData/multi-agent.json` blob, `readMulti()`/`writeMulti(data)` best-effort try-catch(원본 L12-28 동형). electron 미import 순수 모듈(테스트 위해 경로 주입 또는 app.getPath 호출부 분리).
2. `MULTI_SESSION_SAVE` 핸들러: untrusted state 받아 best-effort 기록. **저장은 검증 최소**(읽기 시 검증).
3. `MULTI_SESSION_LOAD` 핸들러: blob 읽어 반환 **전 cwd 재검증(ADR-020·신뢰경계 CRITICAL)**: 각 panel.cwd를 `isAbsolute + existsSync + statSync.isDirectory`로 검증 → 실패 시 해당 cwd `undefined` drop(renderer는 전역 workspaceRoot 폴백). **임의 경로 무확인 통과 금지**(hand-edit 방어). 손상/version 불일치 blob → null(graceful).
   - **B2(검증 방법 정정·CRITICAL)**: 드라이버 문구의 "resolveSafe 재검증"은 **부적합** — `resolveSafe(root,p)`는 *루트 하위경로 containment* 용이고 panel.cwd는 **자체 루트인 독립 절대경로**(하위경로 아님)라 적용 대상 아님. 정답 = **`isAbsolute+existsSync+isDirectory`**(WORKSPACE_OPEN `index.ts` L316 / `ConversationRecord.cwd` 자동복원 L799 선례와 동일 단일 패턴 재사용). 드라이버 문구 정정은 사용자에게 보고.
4. `src/main/index.ts`: app.whenReady에서 multiStore 경로 초기화(store와 동형, best-effort).

### C. renderer (`src/renderer/src/store/panelSession.ts` + `src/renderer/src/components/MultiWorkspace.tsx`)
1. `panelSession.ts`:
   - `makePanelInitialState(snapshot?: PanelThreadSnapshot)` — snapshot 있으면 `messages`를 `{kind:'msg',...}` ThreadItem[]로 재구성, `seq` 시드, `currentRunId:null`. 없으면 기존 빈 초기상태(하위호환·회귀 0, optional이라 기존 무인자 호출처 무영향).
   - **B5(id 충돌 방지·CRITICAL)**: 복원 시 메시지 id를 **라이브 id 소스로 재발급**(re-id) + reducer `seq`를 재발급분 이상으로 시드. 모듈전역 `nextId()` 카운터(`pmsg-N`, 6패널 공유)와 복원 thread id가 충돌하면 reducer text `existsInThread` 매칭이 엉뚱한 메시지에 delta append → Phase A append-only/인터리브 붕괴. 재발급으로 **복원 id < 모든 미래 id** 불변식 보장. (snapshot 메시지는 완료 상태라 정확한 id 값 무의미 — 미래 충돌만 차단하면 됨.)
   - **교차 불변식**: reducer `makeInitialState`/`applyAgentEvent`/`ThreadItem` 재사용 — append-only·인터리브 포인터(openGroupId/openMsgId/seq) 무변경, panelApply 무변경.
2. 직렬화 헬퍼 `snapshotForPersist(state): PanelThreadSnapshot` — **msg kind만**(S3): `state.thread.filter(kind==='msg').map(→PersistedMsg)` + seq/lastUsage/lastContextWindow. toolgroup/thinking 제외(패널 미표시·비대 방지). 휘발 필드 제외.
3. `MultiWorkspace.tsx`:
   - **B4(picker 상태 리프팅·필수 IN)**: 현재 picker는 PanelView 로컬 `useState`(L384)라 부모가 수집 불가. → picker를 **MultiWorkspace per-slot state로 끌어올림**, PanelView는 `picker`/`setPicker` props 수용(시그니처 추가). title은 M3에서 **사용자 편집 미도입** → 복원된 값 또는 SAMPLE 기본을 그대로 영속(derived). 이로써 한 패널의 영속 대상(picker/sysPrompt/cwd/count/thread)이 MultiWorkspace에서 단일 수집 가능 → `buildPersistState()` 성립.
   - **B3(복원/저장 race 게이트·CRITICAL)**: `restoredRef`(또는 state flag). 마운트 첫 effect = `multiSessionLoad()` async → 복원 setState 후 `restoredRef=true`. **저장 effect는 `restoredRef===true`일 때만 발화** → 복원 도착 전 빈 초기상태가 디스크 복원본을 덮어쓰는 데이터 소실 차단.
   - **디바운스 저장**: `restored` 이후 패널 메타/thread/count 변경 시 디바운스(≥500ms) `multiSessionSave(buildPersistState())`.
   - **패널 메타 실데이터화**: 복원 실데이터 우선, SAMPLE_PANELS는 first-run(미저장) 기본값으로만.
   - **sysPrompt 배선(M2 연계)**: 패널 sysPrompt 편집값 → (a) 영속 (b) `session.send(text,{sysPrompt})` 전달(M2 SendOptions.sysPrompt). 실행 반영.
   - cwd: 복원된 cwd는 main이 재검증한 값(B-3) → 신뢰. 전역 workspaceRoot 폴백 유지.

## 3. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| shared-ipc | `src/shared/ipc-contract.ts`(타입·채널)·`src/preload/index.ts`(노출) | W |
| main-process | `src/main/multiStore.ts`(신규)·`src/main/ipc/index.ts`(핸들러·cwd 재검증)·`src/main/index.ts`(초기화) | W |
| renderer | `src/renderer/src/store/panelSession.ts`(snapshot 시드·직렬화)·`src/renderer/src/components/MultiWorkspace.tsx`(복원·저장·메타·sysPrompt) | W |
| qa | `tests/**`(multiStore round-trip·cwd 재검증·snapshot 직렬화·복원 e2e) | W |
| 사용자 게이트(deny) | `docs/ADR.md`(ADR-021 신설) | 보고만 |
| 불변(확인) | reducer(`makeInitialState`/`applyAgentEvent` append-only 무변경)·threadTypes | 무변경 |

## 4. 의존성 순서 + 분해 (S4 — coordinator, 단일 통합 커밋)
**교차 동반 불변식**(panelSession=reducer 공유): shared 타입·panelSession 시드·MultiWorkspace 복원은 **한 커밋 동반**(중간 typecheck red 방지). 대규모+교차 → **coordinator + 2-Worker + reviewer**.
- **Backend half**(shared-ipc + main-process): shared 타입/채널 → preload → multiStore + 핸들러(+cwd 재검증) + 단위(round-trip·cwd drop·version≠2 null). 독립 테스트 가능.
- **Frontend half**(renderer): panelSession snapshot 시드/직렬화/**id 재발급(B5)** → **picker 리프팅(B4)** → MultiWorkspace 복원/저장(**race 게이트 B3**)/메타/sysPrompt + 단위.
- **통합**: 두 산출 한 커밋 → typecheck 양쪽 green → 단위 green → 실 런타임 e2e(재시작 복원) → reviewer(교차: B3 race·B5 id·신뢰경계 cwd 중점) → commit → 트래커. ADR-021은 사용자 게이트.
**순서(테스트 먼저)**: 실패 테스트(round-trip·cwd 재검증·snapshot msg-only·복원 시드·id 재발급·race 게이트) → 구현 → typecheck → 단위 → e2e.

## 5. 측정가능 완료조건 (AC)
- [ ] **multiStore round-trip 단위**: writeMulti(state) → readMulti() === state(deep). 손상 파일 → null 크래시 0. 파일 없음 → null. **version≠2 blob → null**(S1).
- [ ] **cwd 재검증 단위(신뢰경계 CRITICAL·B2)**: LOAD 핸들러가 존재하지 않는/비-절대/비-디렉토리 panel.cwd → `undefined` drop(isAbsolute+exists+isDirectory). 유효 cwd → 보존. 임의 경로 무확인 통과 0. (resolveSafe 미사용 확인.)
- [ ] **snapshot 직렬화 단위(S3)**: `snapshotForPersist(state)` → **msg kind만** 포함(toolgroup/thinking 제외), JSON 라운드트립 동일(messages/seq/lastUsage). 휘발 필드(currentRunId/status) 미포함.
- [ ] **복원 시드 + id 재발급 단위(B5·CRITICAL)**: `makePanelInitialState(snapshot)` → thread가 msg로 재구성, currentRunId=null. **복원 메시지 id < 이후 nextId()/reducer seq 발급분**(충돌 0) — 복원 후 새 user 메시지 전송 시 id 충돌·오매칭 없음 단위 단정. snapshot 없으면 빈 초기상태(회귀 0).
- [ ] **복원/저장 race 단위(B3·CRITICAL)**: `restored` 게이트 — 복원 완료 전 save 미발화(빈 상태가 복원본 덮어쓰지 않음). mock으로 load 지연 시 save 억제 단정.
- [ ] **picker 리프팅 회귀(B4)**: PanelView가 picker/setPicker props 수용, 기존 picker 동작(model/effort/mode 변경) 회귀 0. buildPersistState가 picker 수집.
- [ ] **panelSession 회귀 0**: reducer append-only·panelApply·인터리브 포인터 무변경(기존 panelSession/multi-concurrent 테스트 green).
- [ ] **재시작 복원 e2e(핵심·실 런타임)**: 앱 기동 → 패널 cwd/sysPrompt 설정 + 메시지 전송 → multiSessionSave 발생 → **앱 재구동 → 패널 메타(cwd/sysPrompt)·thread 복원** DOM 확인.
- [ ] **roots 밖 cwd 거부 e2e/단위**: hand-edit로 존재하지 않는 cwd 주입한 blob → 로드 시 그 패널 cwd 미적용(전역 폴백), 크래시 0.
- [ ] **sysPrompt 실행 반영**: 복원된 패널 sysPrompt가 send 시 M2 경로로 전달(단위 mock 또는 스모크). (M2 결정적 마커 재사용 가능.)
- [ ] **빌드**: typecheck 양쪽 green · `npm run test` 전체 green(기존 회귀 0) · `npm run build` 성공.

## 6. 검증 3층
- **① 단위 TDD**: multiStore round-trip·cwd 재검증·snapshot 직렬화·복원 시드·panelSession 회귀.
- **② 스모크**: (선택) 실 SDK로 복원된 sysPrompt가 실행에 반영(M2 마커 재사용).
- **③ 실 런타임 e2e(핵심)**: Playwright `_electron` — 설정→저장→**재구동→복원** DOM 단정. cwd 거부 케이스.

## 7. 리스크·롤백
- **신뢰경계(최우선)**: 영속 blob의 panel.cwd가 untrusted(hand-edit) → 무확인 open 시 임의 경로 접근. 완화 = **main LOAD 핸들러 cwd 재검증**(isAbsolute+exists+isDirectory) drop + reviewer 필수.
- **교차 회귀(panelSession/reducer)**: snapshot 시드가 reducer 인터리브 전제(Phase A)·append-only를 깨면. 완화 = makeInitialState 재사용·append-only 무변경·panelApply 무변경·기존 테스트 재실행.
- **저장 폭주/루프**: 디바운스 미흡 시 매 키입력 저장 → 디스크 폭주. 완화 = 디바운스(≥500ms) + 변경 시에만.
- **snapshot 비대**: thread 큰 패널 ×6 → blob 비대. 완화 = ≤6 패널 bounded(원본 전제). 필요시 메시지 cap은 후속.
- **롤백**: 신규 채널·신규 파일 위주, 기존 경로 additive → revert 1~2커밋. 복원 실패해도 SAMPLE 폴백으로 graceful.

## 8. ADR (사용자 게이트 — deny)
- **ADR-021 신설**(멀티 워크스페이스 JSON blob 영속, maStore.ts 미러). 사용자 이 세션 명시 결정(WEAKNESS_BOOST.md). `docs/ADR.md` deny → **메인 세션이 제안 문구 보고, 사용자 적용**.
