# Phase 02: whatsnew-updatenotes

## 목표
**WhatsNew**(6슬라이드 온보딩 데크) + **UpdateNotes**(메탈 그라디언트+키워드 마퀴+번호 리스트) 시각 1:1. 라이프사이클(라이브 트리거 없음, 단위 검증).

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F12-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. 첫설치/버전업 실트리거=M5. open prop + Shell state default off).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/lib/whatsNewSampleData.ts`+`updateNotesSampleData.ts`(신규) — WN_SLIDES(6: {eyebrow,title,accent,desc}) + UN_ITEMS(번호 항목 {n,lead,desc}) + UN_KEYWORDS(마퀴). window.api 0.
- `src/renderer/src/components/WhatsNew.tsx`+CSS(신규) — wn-scrim + wn-hero(wn-eyebrow·wn-titlewrap[wn-title·wn-accent]·wn-desc·wn-logo) + wn-dock(wn-nav 칩 네비) + 건너뛰기/CTA(둘러보기/다음/시작하기). 슬라이드 인덱스 state. Esc/←→. props{open,onClose}.
- `src/renderer/src/components/UpdateNotes.tsx`+CSS(신규) — un-hero(un-eyebrow·un-name[un-char 글자 reveal]·메탈 그라디언트) + un-marquee(un-marquee-track/group/item) + un-list(un-item: 번호 + un-lead/un-desc) + un-cta "시작하기" + un-foot. Esc. props{open,onClose}.
- `src/renderer/src/layout/Shell.tsx` — whatsNewOpen/updateNotesOpen state(default false, **자동 표시 안 함** — 기존 e2e/UX 무영향) + 렌더. (라이브 트리거 없음 — M5.)

## 작업 단계
1. 샘플 데이터.
2. WhatsNew(슬라이드 네비) + UpdateNotes(마퀴·번호 리스트).
3. CSS(메탈 그라디언트=토큰 조합·마퀴 애니메이션). 인라인 색 0.
4. 단위 테스트(open 렌더 + 슬라이드 네비 + Esc).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: WhatsNew open → wn-hero(슬라이드 1) + wn-dock 칩 + → 다음 슬라이드 + 건너뛰기/Esc 닫기 · UpdateNotes open → un-hero + un-list 번호 항목 + un-cta + Esc. 닫힘 시 미렌더. PASS.
- [ ] **자동 표시 안 함**: Shell 기본 whatsNewOpen=false → 기존 e2e 회귀 0(런치 시 스플래시 미표시).
- [ ] scope grep: window.api 0.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 WhatsNew.tsx·UpdateNotes.tsx · REPLICA_GAP F12.
