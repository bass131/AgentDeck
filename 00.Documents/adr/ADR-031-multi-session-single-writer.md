### ADR-031: 멀티세션 영속 동시성 — renderer 분산 RMW 폐기, main 명령 기반 이관 (lost-update 구조적 제거) ⭐

**결정**: `multi-agent.json`(멀티세션 단일 blob, `02.Source/main/multiStore.ts`)에 대한 read-modify-write를 renderer에서 **전면 폐기**하고 병합 책임을 main으로 이관한다. renderer는 blob 통짜 `MULTI_SESSION_SAVE` 대신 **의도 명령**(upsert[활성 세션 스냅샷]·create·delete·rename·select)을 IPC로 보내고, main 핸들러가 read→merge→write를 **동기(run-to-completion) 원자 블록**으로 실행한다. blob 통짜 SAVE 채널은 제거(**단일 기록자 = main**). `MULTI_SESSION_LOAD`는 읽기 전용 복원용으로 유지. 명령 응답은 병합 후 권위 상태를 돌려줘 renderer Zustand는 **미러**로 동기화한다. 디스크 포맷(version 2)은 불변 — 스키마 마이그레이션 없음.

**근본 문제(BF3 P05 reviewer 🟡 → 별도 건 확정, 실측 2026-07-03)**: renderer 다중 주체가 각자 `LOAD(IPC) → 메모리 수정 → SAVE(IPC)`를 돌리는 **분산 RMW** — read와 write 사이 IPC 왕복 간극에 다른 주체의 SAVE가 끼면 그 변경이 통째로 소실된다(last-write-wins). 경합 4갈래 실측: ① `useMultiPersist.performRmwSave`(debounce 500ms 자동저장) × 언마운트 flush 교차 ② autosave × `multiSession.ts` CRUD 5액션(new/select/delete/rename/load — 전부 동일 RMW 패턴) ③ CRUD 연쇄 발화 ④ 다중 패널 동시 실행 저장 폭주. main `writeMulti()`(multiStore.ts:64)는 무조건 덮어쓰기 — 버전 비교·직렬화 전무. BF3 P05(256ed30)는 오염 방향(남의 스냅샷 상속)만 봉합했고, 소실 방향이 본 건.

**이유**:
1. **원자성이 공짜** — Electron main의 IPC 핸들러는 단일 스레드 run-to-completion(시작한 콜백은 끝까지 실행). RMW를 main 동기 블록 안으로 넣으면 인터리브가 원천 불가 — BF3-DONE §교훈 "run-to-completion 활용"의 정확한 적용처. 대화 저장소(`04_persistence/store.ts` save)가 이미 같은 구조로 무사고(대조군).
2. **감지가 아니라 제거** — CAS(compare-and-swap)는 충돌을 감지하고 재시도할 뿐, "재시도 시 어떻게 병합하나"가 renderer 6개 호출처에 그대로 남는다. 명령 이관은 그 병합 질문 자체를 소멸시킨다.
3. **신뢰 경계 정합** — "영속 의미론은 main이 소유"가 헌법 신뢰 경계 원칙(renderer untrusted)과 방향 일치.

**트레이드오프**:
- **공사 크기** — shared 채널·타입 신설/제거(shared-contract 깃발) + preload 화이트리스트 + main 핸들러 의미론 + renderer 6개 호출처 재작성. CAS(필드 1개 추가) 대비 큼. 대신 완료 후 renderer는 단발 명령으로 단순해지고 재시도 로직 0.
- **원본 maStore 미러 이탈** — 원본도 동일 구조(동일 결함 내재). ADR-029(a)·ADR-030 선례를 따르는 명문화된 waiver — **결함의 비복제** 결정.
- **main 도메인 로직 유입** — upsert 의미론·삭제 후 active 재계산 등이 main으로 이동. 단 이는 "영속 일관성 규칙"이지 UI 로직이 아님 — 경계 침범이 아니라 제자리 찾기.
- **기각 대안**: ⓐ **A안 CAS/세대 토큰**(감지형 — 거부·재시도·병합 복잡성이 renderer 호출처 전부에 잔존, autosave 폭주 시 재시도 폭풍 위험) ⓑ **main 쓰기 직렬화만**(간극이 renderer LOAD↔SAVE 사이에 있어 무효) ⓒ **세션별 파일 분리**(세션 목록·activeSessionId 인덱스 파일에 RMW 잔존 + 디스크 스키마 마이그레이션[그 자체가 비가역 게이트] 유발 — 이득 대비 과함).

**완료조건(측정가능)**: ① TDD — 경합 재현 테스트(bf3-p05 방식 deferred-promise 인터리브: autosave×flush / autosave×CRUD / CRUD 연쇄)가 구 구조에서 유실을 재현하고 신 구조에서 유실 0. ② blob 통짜 SAVE 채널 제거로 renderer 측 RMW 잔존 0(컴파일 타임 강제 + grep 확인). ③ typecheck(main+renderer)·test·lint green + reviewer(shared-contract 깃발 무조건) CRITICAL 0. ④ 멀티패널 e2e 회귀 green.

**위험도**: [M] — IPC 계약 행동 변경 + 영속 쓰기 경로 전면 재배선. 디스크 포맷 불변으로 마이그레이션 리스크 0.

**현황(2026-07-03)**: 영호 채택(설계 논의에서 A안 CAS 대비 B안 확정) → **같은 날 RMW1-single-writer 마일스톤으로 구현 완료**(P01 경합 재현 → P02 계약 → P03 main 병합 의미론 → P04 renderer 이관[P01 3계열 GREEN] → P05 SAVE 채널 제거). 게이트 확정 1건: 미지 id upsert = no-op+ok:false(stale upsert 부활 차단). 완료조건 ④(멀티패널 e2e 라이브 회귀)는 "라이브 e2e 일괄" 건으로 이월 → **같은 날 라이브 일괄에서 완료**(m3-multi-restore 5 · lr3-p07-multipanel-continuity 1 · switch-continuity-seamless 2 — 실 SDK 전부 PASS). 상세 `01.Phases/RMW1-single-writer/RMW1-DONE.md`.

---

