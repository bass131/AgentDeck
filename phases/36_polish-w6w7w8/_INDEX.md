# Phase 36 — M8: 코드뷰어 호버/검색/선택 + bash/time/Typewriter + --gold (W6+W7+W8)

> 드라이버: `docs/WEAKNESS_BOOST.md` M8. 마지막 폴리시 묶음 3약점. 독립적 → 3 서브태스크(W8 trivial→W7 medium→W6 large), 분리 커밋 가능.
> 등급: **복잡(renderer 교차)**. renderer + theme. W7 time은 reducer/panelReducer 교차 동반.

## 0. 현황 (Explore 매핑)
- **W6**: CodeViewer는 CodeMirror6 + **LSP 호버(basic pre)·F12·시맨틱** 있음. **없음**: FindBar(파일내 검색)·SelectionAskBar(선택질문)·고급 HoverContent(parseHover 구조화 카드).
- **W7**: bash 결과는 ToolCard 텍스트(고스트/자동펼침/error틴트/복사 **없음**). ThreadItem **time 없음**(cmdresult만 M6). Typewriter **없음**(스트림 커서만).
- **W8**: tokens.css에 `--gold` **없음**.

## 1. 서브태스크 (독립·순서 W8→W7→W6)

### W8 — --gold 토큰 (trivial)
- `src/renderer/src/theme/tokens.css`: 라이트 `--gold: oklch(0.67 0.15 68)` · 다크 `--gold: oklch(0.81 0.12 75)`(원본 styles.css L37/L116 미러).
- Fable 모델 도트/아이콘 색을 `var(--gold)`로(model picker/표시부 — 현 Fable 색 확인 후 교체).
- AC: 라이트/다크 --gold 정의 · Fable 도트 --gold 참조 DOM.

### W7 — bash 출력카드 + time (medium·교차) 〔Typewriter OUT〕
1. **time 확산(교차·B2 출처 확정)**: ThreadItem(msg/toolgroup/notice)에 `time?: string`(optional — 기존 fixture 무파손). **출처(B2)**: user msg/cmdresult = 액션 time(M6 패턴). **assistant/toolgroup/notice = renderer AGENT_EVENT 구독부에서 stamp** — appStore/panelSession이 IPC 이벤트 수신 시 `nowTime()`을 payload/액션에 실어 reducer에 전달(nowTime은 **구독 레이어=impure 허용**, **reducer는 event/action time만 읽음=순수 유지**). reducer/panelReducer가 `nowTime()` 직접 호출 **0**(grep 가드). **panelReducer 동반**. MessageBubble/ToolGroup/NoticeItem이 time 렌더(자리 이미 `time &&` 조건부 준비됨).
   - **S1(비영속)**: time은 **M3 PersistedMsg/snapshot 미포함**(표시용 휘발 — 복원 msg는 id 재발급된 완료상태라 과거시각 무의미, cmdresult time 미영속과 동일). snapshotForPersist msg-only가 자동 제외 또는 명시 strip.
2. **BashOutput 카드**(원본 Chat.tsx L198-248): Bash 도구 결과 → 고스트(접힘: **마지막 비공백 줄**+"— n줄", 원본 `reverse().find(l=>l.trim())`)·자동펼침(**failed=status error일 때만**)·**error 틴트는 failed일 때만**(성공출력 무채색)·error regex `/(^|\s)(error|err!|fatal|exception|failed)\b/i`(원본 L220 정밀)·복사("복사됨" 1.2s). **ToolCard 타입/toolgroup 구조 불변**(표시 레이어만, S5). bash 분기는 ToolCallCard.
- AC: time 단위(액션/구독 stamp·렌더·**reducer nowTime 호출0 grep**·panelReducer 동반·비영속) · bash 고스트(비공백 마지막줄)/자동펼침(failed)/error틴트(failed만)/복사 단위·DOM · toolgroup 인터리브 불변 회귀가드 · 회귀 0.

> **Typewriter 스코프아웃(B1 확정)**: 구현 **안 함**. 사유 — 원본도 assistant 답변엔 Typewriter 미적용(user/error만, session.ts L224-251·Chat.tsx L464-471). 우리는 M5 includePartialMessages:true라 assistant text 전량 델타 경로 + SmoothMarkdown이 이미 점진 reveal → Typewriter 추가 시 **이중 애니/깜빡임**. 적용 대상 사실상 0건.

### W6 — 코드뷰어 호버/검색/선택 (large) 〔3분할·S2〕
**W6a — FindBar**(원본 FileModal L791-931): 파일내 검색 — CSS Custom Highlight API(`CSS.highlights`/`globalThis.Highlight`, **옵셔널 접근 `?.` graceful**·DOM 미변경)로 텍스트노드 스캔→Range[]→하이라이트, 현재매치 강조, 이전/다음 네비. CodeViewer 통합. **S3**: Electron 42 Chromium CSS.highlights 지원 e2e 1회 확인 + 미지원 graceful(하이라이트 없음). 빈 매치(query 0/0건)→total=0 no-op.
**W6b — SelectionAskBar**(원본 L614-790): 선택 영역 부동 툴바 — 줄범위(lineOf) 추출 → "질문" → composer 주입(renderer 내 콜백 체인 CodeViewer→Shell→Conversation injectedInput, **신규 IPC 불요**). 복사(Ctrl+C). **빈 선택/본문 밖 → 바 미표시**(inBody 가드).
**W6c — 고급 HoverContent(parseHover)** — **STRETCH**(가능 범위만): 시그니처 파싱(종류칩·이름·파라미터·반환형)·@param/@return 구조화 카드. **현 basic LSP 호버(pre, CodeViewer L246-258)는 폴백 유지**(언어별 정규식 복잡 — 부분 OK·LSP 응답 형식 의존). 시간 부족 시 W6c는 후속.
- 각 분리 커밋. AC: W6a FindBar 매치수/네비/빈매치 단위·DOM · W6b SelectionAsk 줄범위/빈선택 단위·DOM · W6c(가능시) parseHover 단위 · 기존 호버/F12/시맨틱 회귀 0.

## 2. 도메인 R/W
| 도메인 | 파일 | R/W |
|---|---|---|
| theme | `theme/tokens.css`(--gold) | W |
| renderer | `threadTypes.ts`·`reducer.ts`·`panelSession.ts`(time)·`Conversation.tsx`(time 렌더·Typewriter)·`MessageBubble.tsx`·`ToolGroup.tsx`/`ToolCallCard`(bash·time)·`CodeViewer.tsx`/`FileModal.tsx`(FindBar·SelectionAskBar·hover)·`lib/`(parseHover 등)·CSS | W |
| qa | `tests/**` | W |
| 불변(확인) | shared/main(W6 LSP hover IPC 기존 재사용·신규 IPC 최소)·인터리브 | 검증 |

## 3. 의존성 순서
W8(독립·즉시) → W7(time 교차 먼저: threadTypes→reducer→panelReducer→렌더, 이후 bash·Typewriter) → W6(FindBar→SelectionAskBar→고급호버). 각 서브태스크: 실패 테스트 먼저 → 구현 → typecheck → 단위 → (W6/W7 DOM e2e) → reviewer.

## 4. 측정가능 완료조건 (AC) — 종합
- [ ] **W8**: 라이트/다크 --gold oklch 정의 · Fable 도트 --gold DOM.
- [ ] **W7-time**: msg/toolgroup/notice time 부여(액션/이벤트 경유·reducer 순수)·렌더 · panelReducer ADD_USER_MESSAGE time 동반 · M3 snapshot 일관 · 기존 인터리브/thread 회귀 0.
- [ ] **W7-bash**: 고스트(마지막줄+n줄)·자동펼침(failed)·error 틴트·복사 단위+DOM.
- [ ] **W7-Typewriter**: 비스트림 짧은답변 타이핑(또는 M5 스트림 중복으로 스코프아웃 근거 문서).
- [ ] **W6-FindBar**: CSS Highlight 매치수·이전/다음 네비·DOM 미변경 단위+DOM.
- [ ] **W6-SelectionAsk**: 줄범위 lineOf·선택질문 컨텍스트 전달 단위+DOM.
- [ ] **W6-hover(stretch)**: parseHover 구조화(가능시) 단위 · 기존 LSP 호버/F12/시맨틱 회귀 0.
- [ ] **종합**: typecheck 양쪽 green · `npm run test` green · m4-4-* 2건 증가 0 · 핵심 DOM e2e(검색·선택·bash·gold).

## 5. 검증 3층
- ① 단위: time 부여·bash 카드·FindBar 매치·SelectionAsk 줄범위·parseHover.
- ② 스모크: (해당 약함 — UI 위주).
- ③ 실 런타임 e2e: FindBar 검색·SelectionAsk·bash 카드·--gold Fable 도트 DOM.

## 6. 리스크·롤백
- **W7 time 교차(CRITICAL)**: time 필수화가 모든 생성경로·테스트 fixture·M3 snapshot 깨면. 완화 = **optional time** + 생성부만 부여 + 순수성(액션/이벤트 경유) + panelReducer 동반 + 인터리브 회귀가드.
- **W7 Typewriter vs M5 스트림 충돌**: 스트리밍 메시지에 Typewriter 이중 적용 시 깜빡임. 완화 = 비스트림 완성 메시지만 또는 스코프아웃(M5가 이미 점진).
- **W6 FindBar 호환**: CSS Custom Highlight API(Electron Chromium 신식) 경계계산 실패. 완화 = Electron 42 Chromium 지원 확인 + 실패 graceful(하이라이트 없음).
- **W6 고급호버 언어차**: parseHover 정규식 언어별 깨짐. 완화 = STRETCH·부분 OK·basic 폴백 유지.
- **롤백**: 각 서브태스크 독립 커밋 → 부분 revert 가능. time optional이라 미부여 graceful.

## 7. ADR
- 불요. renderer/theme 충실도 복원. W6 선택질문이 신규 IPC면 shared 단일정의(최소). _INDEX 흔적 + reviewer.
