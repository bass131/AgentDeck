# Phase 29 — M1: 영속 JSON 통일 (sqlite 제거)

> 드라이버: `docs/WEAKNESS_BOOST.md` M1. 약점 보강 루프 토대 마일스톤.
> 등급: **보통~복잡** (main-process 단일 도메인 + qa + ADR). 신뢰경계·계약보존이 핵심.

## 1. 목표 (왜)
원본 AgentCodeGUI도 Claude Code도 **DB 없이 전부 파일 기반** 영속(원본 `maStore.ts`=JSON blob·`chats.ts`=per-chat fan-out / Claude Code=per-session JSONL). 우리만 better-sqlite3(ADR-006)로 분기 → 이 규모엔 과했고 네이티브 ABI 마찰(electron-rebuild·predev/prestart/pretest 훅)만 유발. **사용자 결정(이번 세션)**: 단일 대화 영속을 **JSON fan-out으로 통일, sqlite 완전 제거**(ADR-006 supersede).

## 2. 범위 (무엇)
**핵심 불변식: `ConversationStore` 인터페이스 계약(save/load/listRecent/delete/rename/close)과 `ConversationRecord` 타입은 그대로.** 본문만 sqlite → JSON fan-out으로 교체. 소비자(IPC 핸들러·renderer)는 인터페이스만 의존 → **IPC/renderer 무변경**(확인됨: `src/main/ipc/index.ts`는 `_store.save/load/listRecent/delete/rename`만 호출, sqlite 결합 0).

### IN
1. **`src/main/persistence/store.ts` 본문 재작성** — 원본 `chats.ts` 파일 fan-out 기법 미러:
   - 파일 레이아웃: `<dir>/<id>.json` = `{ ...ConversationRecord, custom_title: boolean }` (1 대화 = 1 파일), `<dir>/index.json` = `{ version: 1, ids: string[] }` (멤버십 + **생성 순서**, sqlite `rowid` 대체).
   - 팩토리 시그니처: `createConversationStore(dbPath)` → `createConversationStore(dir)`. (`:memory:` → 임시 디렉토리.)
   - **safeId 가드**: `/^[A-Za-z0-9._-]+$/` (path-traversal 차단, 원본 미러). save/load/delete/rename id 입력에 적용. 신규 id는 `randomUUID()`(가드 통과).
   - **변경 감지 캐시**: `Map<id, jsonString>` — 내용 동일하면 재기록 skip(원본 미러). index.json도 ids 불변이면 skip.
   - **정렬 동형성(B1 — 명문화)**: `index.json.ids`는 **rowid 동형 = 최초 생성순 고정**. ⇒ save 시 **신규 id면 `ids[]` 끝에 push, 기존 id(upsert)면 배열 위치 불변**(절대 MRU 재정렬 금지 — 재저장이 순서를 바꾸면 안 됨). `listRecent` 정렬 = `updatedAt DESC` 1차, **동률 시 `ids[] 인덱스 DESC`(후-생성 우선) 2차** = sqlite `ORDER BY updated_at DESC, rowid DESC` 동형. (동일 ms 다건 저장의 tie-break는 이 2차 키에만 의존 → 테스트로 고정.)
   - **손상 복구(S2)**: 개별 `<id>.json`/`index.json` 파싱 실패는 try-catch **graceful skip**(원본 chats.ts L44-46/L113-115 미러). 읽을 수 있는 대화는 복구, 크래시 0.
2. **custom_title 보존**(v2 동등): save 시 기존 파일 `custom_title===true`면 incoming title 무시(자동제목이 사용자제목 안 덮음). rename은 `custom_title=true` 설정 + updatedAt 갱신. 반환 record엔 `custom_title` 미노출(내부 필드).
3. **cwd 보존**(v3/ADR-020 동등): 매 save 덮어쓰기. 빈 문자열/누락 → `undefined`(graceful).
4. **createdAt 보존**: upsert 시 기존 파일 createdAt 유지(없으면 now). updatedAt = now.
   - **safeId 거부 반환 계약(S1 — 메서드별 확정, sqlite와 동일 의미)**: `load`(안전 id 아님)→`null` · `delete`/`rename`→`false` · `save`(악의적 명시 id)→**throw**(현 messages-비배열 throw와 정합; 신규는 항상 UUID라 도달 안 함). "graceful 아무거나" 아님 — 소비자(`ipc/index.ts`) 핸들러 계약(load=null·delete/rename=false·save=throw 전파)과 1:1.
   - **close() 의미(S2)**: JSON 구현은 동기 `writeFileSync`라 pending write 없음 → `close()`는 **no-op 안전**(flush 불필요). 인터페이스 유지 위해 메서드는 보존(소비자 `index.ts` before-quit 호출 무변경).
5. **소비자 동반(같은 커밋)**: `src/main/index.ts` L60 — `join(userData,'conversations.db')` → chats 디렉토리 경로(`join(userData,'chats')`), 에러 메시지에서 "better-sqlite3 ABI" 문구 제거.
6. **데이터 마이그레이션(1회·ephemeral·미커밋, S3)**: store.db→JSON은 **스크래치패드 임시 스크립트**(repo에 안 들어감 → grep 긴장 0). 구조:
   - `readSqliteRows(dbPath)`: better-sqlite3로 `conversations` 테이블 읽기(있고 읽히면). 얇은 I/O.
   - row→`{...ConversationRecord, custom_title}` 변환 → **새 JSON store의 `save()` 재사용**으로 기록(로직 중복 0).
   - 실행: **dev 스크래치 1회 best-effort.** DB 없으면 no-op(흔한 경우 — 배포 사용자 0). ABI: 실행 직전 `npm rebuild better-sqlite3`(node ABI). store.db는 **비파괴 읽기**(삭제 안 함, 롤백 안전). [근거: pre-release replica — 배포 사용자 0, store.db는 로컬 dev 스크래치뿐. 원본 LEGACY_BLOB→fan-out 1회 마이그레이션 동형.]
   - **repo 영구 산출물 = sqlite-free JSON store + 테스트뿐.** 마이그레이션 정확성은 JSON store의 실파일 save→close→reopen→load 라운드트립(영구 단위)으로 증명. sqlite-read 변환은 임시 스크립트로 M1 중 1회 검증(있으면).
7. **의존성 정리**(package.json + lock): `npm uninstall better-sqlite3 @types/better-sqlite3`(lock 동기화). `@electron/rebuild`는 유일 소비자가 rebuild 스크립트뿐임이 확정 → 함께 제거. 빌드 스크립트: `rebuild:native`/`rebuild:node` 삭제, `predev`/`prestart`/`pretest`의 rebuild 훅 제거. **`scripts/run-e2e.cjs` 단순화(B2)**: 2/4(electron ABI rebuild)·4/4(node ABI 복구) 단계 삭제 → `build → playwright`만 남김(듀얼 ABI 댄스 통째 소멸). e2e 헤더 주석(`core-loop`/`live-sdk`/`visual-viewer`의 "rebuild:native 전제") 정리.
8. **ADR-006 supersede 기록**(docs/ADR.md) — **메인 세션이 직접 적용**(Worker 위임 X, S4): 사용자 이 세션 명시 결정(WEAKNESS_BOOST.md L5-7 기록)의 실행. ADR-006에 supersede 노트(→ JSON fan-out 통일, M1) + 근거. 헌법 "ADR=사용자 단독통제"와 마찰 최소화 위해 *결정권자=사용자* 전제, 에이전트는 기록만.

### OUT (이 Phase 아님)
- 멀티 세션 영속(M3·`multiStore.ts`) — 별도 마일스톤.
- ConversationRecord 필드 추가/IPC 채널 변경 — 계약 불변.
- 원본 chats.ts의 blob(readChats/writeChats) **시그니처** 채택 — 우리는 record-CRUD 인터페이스 유지(소비자 보존). 원본에서 가져오는 건 *파일 레이아웃 + safeId + 변경캐시 + index 순서* **기법**뿐.

## 3. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| main-process | `src/main/persistence/store.ts`(재작성)·`src/main/index.ts`(경로 1줄)·`scripts/run-e2e.cjs`(ABI 단계 제거)·`package.json`+`package-lock.json`(npm uninstall). 마이그레이션은 스크래치패드(미커밋) | W |
| qa | `tests/main/store.test.ts`(임시디렉토리로 재작성·신규 케이스)·`tests/e2e/{core-loop,live-sdk,visual-viewer}.e2e.ts`(rebuild 전제 주석 정리)·e2e 재실행 | W |
| 메인 세션(사용자 결정 실행, S4) | `docs/ADR.md`(ADR-006 supersede 노트) — Worker 위임 X | W |
| 불변(확인) | `src/main/ipc/index.ts`·`src/shared/ipc-contract.ts`·renderer | **무변경** |

## 4. 의존성 순서
1. 실패 테스트 먼저(store.test.ts 임시디렉토리 재작성 + 신규 AC: 재기동 영속·safeId·정렬 tie-break·upsert 순서불변·index 무결성) → 2. store.ts JSON 재작성(정렬 동형성 B1 준수) → 3. index.ts 경로 동반 → 4. (선택) 스크래치패드 마이그레이션 1회 실행(store.db 있으면, node ABI 정렬 후·비파괴) → 5. `npm uninstall` + run-e2e.cjs 단순화 + 빌드훅 제거 + e2e 주석 정리 → 6. typecheck 양쪽 green → 단위 green → 7. reviewer(CRITICAL 0) → e2e 재실행 → **메인 세션이 ADR-006 supersede 노트 적용** → commit → 드라이버 트래커 갱신.

## 5. 측정가능 완료조건 (AC)
- [ ] **CRUD 회귀 0**: 기존 store.test.ts 전 케이스 통과(저장/load/upsert/신규id/null/listRecent 순서·limit·기본20/createdAt·updatedAt ISO/messages 배열검증/messages 비배열 throw).
- [ ] **custom_title 보존 회귀 0**: rename 후 자동제목 save → 사용자제목 유지. rename 안 한 대화는 save가 title 갱신.
- [ ] **cwd 라운드트립 회귀 0**: save(cwd)→load 일치 / 누락→undefined / 덮어쓰기 / 하위호환 / custom_title 동시보존.
- [ ] **신규: 재기동 영속**(`:memory:`엔 없던 능력) — `createConversationStore(dir)` save → close → 같은 dir로 새 store 생성 → load 동일 record(파일 실영속 증명).
- [ ] **신규: 정렬 동형성(B1)** — 동일 ms로 conv-1→2→3 순차 save → `listRecent()[0].id==='conv-3'`(후-생성 우선) **AND** conv-1을 upsert(재저장)해도 listRecent 순서 불변(rowid 동형, MRU 재정렬 안 함).
- [ ] **신규: safeId 거부(S1 — 메서드별 확정)** — `../evil`·`a/b`·`..`·빈문자열·비-string id: `load`→`null`, `delete`/`rename`→`false`, `save`(명시 악의 id)→throw. **dir 밖 파일 미생성**(traversal 0).
- [ ] **신규: 변경캐시** — 동일 내용 연속 save가 불필요 디스크 재기록 안 함(또는 idempotent 보장 — mtime/캐시 관찰).
- [ ] **신규: index.json 무결성 + 손상복구(S2)** — delete 후 index ids에서 제거 + `<id>.json` unlink, listRecent 삭제분 제외. 손상 index.json/개별 파일 픽스처 → 크래시 0, 읽히는 대화는 복구.
- [ ] **마이그레이션 round-trip**: JSON store 실파일 save→close→reopen→load 라운드트립 동일성(영구 단위). store.db 있으면 임시 스크립트로 1회 검증(없으면 no-op 문서화).
- [ ] **sqlite 제거 검증(B2 — 범위 확장)**: `grep -rn better-sqlite3` over **`src/` + `scripts/` + `tests/`** = **0**(마이그레이션은 스크래치패드 미커밋). `package.json`·`package-lock.json` deps에 better-sqlite3/@types/better-sqlite3/@electron/rebuild 없음. `import Database` 잔존 0.
- [ ] **빌드 무결**: `npm run typecheck`(main+renderer) green · `npm run test`(전체) green · `npm run build` 성공(네이티브 rebuild 훅 제거 후에도).
- [ ] **실 런타임 e2e**: 기존 `tests/e2e/core-loop.e2e.ts`(또는 신규 persist-reopen)로 앱 기동→persistence(JSON dir) 초기화→대화 저장/재로드 DOM 확인. ABI 에러 0.

## 6. 검증 3층
- **① 단위 TDD**: 위 store.test.ts (재작성 + 신규 7케이스). 실패 먼저(tdd-guard).
- **② 스모크**: store.ts는 순수 fs 모듈(electron import 0) → vite-node로 임시디렉토리 직접 구동, 재기동 영속·safeId·마이그레이션 라운드트립 실파일 관찰.
- **③ 실 런타임 e2e**: Playwright `_electron` — 앱 기동 후 JSON 영속 초기화 확인(콘솔 ABI 에러 0) + 대화 CRUD DOM(기존 core-loop 하네스 확장).

## 7. 리스크·롤백
- **영속 회귀**(chats sqlite→JSON이 CRUD/cwd/custom_title 깨면): 완화 = 기존 store.test.ts 전 케이스 보존 + 원본 chats.ts 기법 정밀 미러 + 재기동 영속 신규 테스트.
- **신뢰경계**(safeId 누락 시 path-traversal): 완화 = safeId 가드 + dir-밖-파일-미생성 테스트 + reviewer.
- **마이그레이션 손실**(store.db 데이터 유실): 완화 = 마이그레이션을 src 밖 1회 스크립트로 격리(원본 데이터 비파괴 읽기 전용), JSON 산출 후 store.db 보존(삭제 안 함).
- **빌드 훅 제거 부작용**(rebuild 훅 삭제가 타 네이티브모듈 깨면): 확인 = better-sqlite3가 유일 네이티브 의존인지 grep. typecheck+build green 게이트.
- **롤백**: store.ts 단일 파일 재작성이라 git revert 1커밋. 인터페이스 불변이라 소비자 영향 0.

## 8. ADR
- **ADR-006 supersede**(sqlite→JSON fan-out 통일). 사용자 이 세션 명시 결정. ADR.md에 supersede 노트 + 근거(원본·Claude Code 파일기반 / 규모 부적합 / ABI 마찰 제거).
