# Phase 01: sidebar-mode-list

## 목표
사이드바에 **단일/멀티 토글(sb-mode)** + **새 대화 활성** + **세션 목록 행(sb-item)** + **검색 필터** + **프로필 풋=설정 트리거**. 정적 샘플 세션.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F7(완료).

## 위험 깃발
없음 (renderer. 새 IPC/store 변경 0. 정적 샘플 + 로컬 state).

## ⚠️ 핵심 설계 제약 (plan-auditor 🔴)
- **Sidebar props 시그니처 변경 금지**: 기존 `{ onCollapse, onOpenSettings }` 그대로 유지. 샘플 세션·유저·모드·검색은 **전부 Sidebar 내부 로컬 state**(sidebarSampleData 직접 소비) — 원본처럼 App/Shell로 끌어올리지 **않는다**. → `Shell.tsx` 호출부(`<Sidebar onCollapse onOpenSettings />`) **무변경**, typecheck 안전. (M4에서 store/props로 승격 — 그건 M4 범위.)
- **기존 onCollapse 접기 단언 보존**: shell-chrome.test의 "접기 버튼이 onCollapse 호출"(현 L126~132)은 유지. 갱신은 새대화/세션/풋/모드 블록만.

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/icons.tsx` — IconSquare·IconGrid·IconMore 추가(벡터). (IconDots를 More로 재사용 가능하면 재사용.)
- `src/renderer/src/lib/sidebarSampleData.ts` (신규) — SAMPLE_SESSIONS({id,title,status:'idle'|'running'|'done'|'error',hasPrompt?})[] 4~6개(running 1·done 1·idle 나머지, hasPrompt 1) + SAMPLE_USER({name,avatarText,avatarColor}). **window.api/store 호출 0.**
- `src/renderer/src/components/Sidebar.tsx` — sb-mode 토글(role=tablist, 로컬 mode state, IconSquare/IconGrid, .on) + sb-new 활성화(disabled 제거, IconPlus+라벨+kbd) + sb-search 필터(로컬 sessions 제목 부분일치) + sb-list에 세션 행(sb-item: dot 상태색 + txt[t1 제목 + hasPrompt pr-mark + t2 상태부텍스트] + more 버튼[이 Phase는 클릭 no-op 또는 빈 핸들러]) + 빈상태(아직 채팅이 없어요/검색 결과가 없어요) + sb-foot=설정 트리거(ava avatarColor+avatarText, name, onClick onOpenSettings). 기존 onCollapse/onOpenSettings props 유지.
- `src/renderer/src/components/Sidebar.css` — sb-mode/sb-mode-btn(.on)·sb-item(dot 상태색/txt/t1/t1-text/t2/pr-mark/more)·활성 sb-new. 색 토큰(상태 dot=green/yellow/red/muted). avatarColor는 인라인 동적색 허용(샘플 고정값).
- `tests/renderer/shell-chrome.test.tsx` — **회귀 가드 동반 갱신**: Sidebar 블록을 새 구조로(새대화 활성·세션 행 존재·검색·sb-foot=설정 트리거). 기존 disabled/sb-empty 단언 교체.

## 작업 단계
1. 아이콘 추가.
2. sidebarSampleData.ts.
3. Sidebar: mode 로컬 state + sb-mode 토글. **모드 전환 = listLabel/searchLabel 라벨 시각 전환(로컬); 목록 내용은 동일 샘플 유지(per-mode 실세트=M4)**. sb-new 활성. 세션 목록(샘플, 로컬 state) + 검색 필터(useMemo). sb-foot 설정 버튼화.
4. CSS. 인라인 색 0 — **단 sb-foot avatarColor만 인라인 동적색 허용(샘플 유저 데이터 예외, 헌법 안티슬롭 비위반: 사용자별 동적 색은 토큰 부적합). 주석 명시.**
5. shell-chrome.test 갱신(새대화 활성·세션 행·검색·sb-foot=설정; **onCollapse 접기 단언은 보존**).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: sb-mode 2버튼(단일/멀티, 클릭 시 aria-selected 전환) · sb-new 활성(disabled 아님) · 세션 행 N개 렌더(dot+제목) · 검색 입력 시 필터 · sb-foot 클릭 onOpenSettings. PASS.
- [ ] scope grep: Sidebar에서 window.api/store 세션 호출 0(정적).
- [ ] `npm run test`(전체)·`test:e2e` 회귀 0(shell-chrome 갱신 포함).

## 참조
원본 Sidebar.tsx L320~403(셸·sb-mode·sb-new·sb-foot)·L118~170(RecentChats 행) · REPLICA_GAP F8.
