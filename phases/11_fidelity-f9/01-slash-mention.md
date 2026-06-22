# Phase 01: slash-mention

## 목표
컴포저 **슬래시 커맨드 메뉴**(/) + **@멘션 팔레트**(@). 정적 샘플 커맨드/스킬/파일트리. 키보드 네비.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F8(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. 슬래시 실행·멘션 해석=M4. textarea 값 조작/로컬만).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/icons.tsx` — IconClock·IconFileText·IconCompress·IconShieldChk 추가(필요분, 벡터). (IconTerminal는 cmd-result용 — F9는 슬래시 아이콘만.)
- `src/renderer/src/lib/composerSampleData.ts` (신규) — SLASH_COMMANDS[{name,desc,icon}] 6(ask/init/clear/compact/review/security-review) + SAMPLE_SKILLS[{name,description}] 2~3 + SAMPLE_MENTION_TREE(폴더/파일 목록 {kind:'dir'|'file',name,full,dir?}). window.api 0.
- `src/renderer/src/components/Composer.tsx` — slash 상태(value '/' 시작+공백 전 → slashQuery, 커맨드+스킬 필터, slashIdx, dismissed) + slash-menu(role=listbox, slash-sec 명령어/스킬 + slash-opt slash-ic/name/desc, .on) + mention 상태(@token at caret → mentionTok, 샘플트리 필터, dir 드릴/file 확정) + mention 팔레트(.slash-menu 재사용, slash-sec.mention-loc + dir/file opt). ↑↓ 이동/Enter·Tab 선택/Esc 닫기. 선택 시 textarea 값 갱신(슬래시=치환 또는 no-op, 멘션=@path 삽입). **실행/해석 X(M4).**
- `src/renderer/src/components/Composer.css`(또는 신규 슬래시 CSS) — slash-menu(scroll, 위로 띄움)·slash-sec(.mention-loc)·slash-opt(.on)/slash-ic(.skill/.folder/.ft)/slash-name(.path)/slash-desc(.into). 색 토큰.

## 작업 단계
1. 아이콘 + composerSampleData.ts.
2. slash: value.startsWith('/')&&!/\s/ → slashQuery. cmdHits+skillHits 필터. slash-menu 렌더(명령어/스킬 섹션). ↑↓/Enter/Tab/Esc. 선택 → 값 갱신(시각).
3. mention: caret 위치 @token 파싱(간단판 — @뒤 단어경계). 샘플트리 필터. dir 선택=@dir/ 드릴, file 선택=@path 삽입. **드릴 후 caret @토큰 편집(Backspace 등) 시 트리 위치 재계산 — 상위 복귀 포함**(편도 금지). mention-loc 헤더(현재 위치 표시).
4. CSS. 인라인 색 0, 벡터 아이콘.
5. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: '/' 입력 → slash-menu(ask/init/.../security-review + 스킬 섹션) · ↑↓로 .on 이동 · Enter 선택 시 메뉴 닫힘 · Esc 닫힘. '@' 입력 → mention 팔레트(샘플 파일/폴더) · dir 선택 드릴 · file 선택 @path 삽입. PASS.
- [ ] scope grep: Composer에서 window.api/store 슬래시·멘션 호출 0(로컬).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 Chat.tsx SLASH_COMMANDS L136 · slash-menu L1759~1809 · mention L1811~1866 · REPLICA_GAP F9.
