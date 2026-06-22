# Milestone 11 — 충실도 F9: 컴포저 리치 트레이 (Fidelity)

> REPLICA_GAP 웨이브 F9. 원본 Composer(C:/Dev/AgentCodeGUI/src/renderer/src/components/Chat.tsx, L1358~1965 + SLASH_COMMANDS L136)의 **슬래시 메뉴·@멘션 팔레트·이미지 첨부 트레이·드롭 힌트·예약 큐 스트립·busy placeholder**를 시각 1:1. **디자인-우선**: 정적 샘플(슬래시 커맨드/샘플 스킬/샘플 파일트리/샘플 썸네일), 실행/해석/저장/큐드레인 = **M4**. renderer-only, 새 IPC 0.

## 원본 구조 (Chat.tsx)
- **SLASH_COMMANDS**(L136): ask(임시 질문)·init(CLAUDE.md 생성)·clear(초기화)·compact(요약)·review(코드 리뷰)·security-review(보안 검토) {name,desc,icon}.
- **slash-menu**(L1759, role=listbox): slash-sec "명령어" + slash-opt(slash-ic + slash-name + slash-desc, .on 활성) + slash-sec "스킬" + 스킬 opt(slash-ic.skill IconBook). value '/' 시작+공백 전이면 열림. ↑↓/Enter/Tab/Esc.
- **mention palette**(L1811, .slash-menu 재사용): slash-sec.mention-loc(검색 IconSearch/폴더 IconFolder + 위치) + slash-opt(dir: slash-ic.folder + name + slash-desc.into IconChevRight / file: slash-ic.ft FileBadge + slash-name.path + dir). @token at caret.
- **img-tray**(L1867): img-thumb(img-thumb-open img + img-thumb-x IconX2 제거).
- **drop-hint**(L1753, dragOver): IconImage + "이미지를 여기에 놓으세요". composer .drag 클래스.
- **sched 큐**(L1700, queued>0): sched-head(sched-title IconClock "예약된 메시지 N" + sched-hint) + sched-list(sched-item: sched-num + sched-text + sched-img + sched-x 취소).
- **textarea placeholder** 상태별: busy "다음 메시지를 예약하세요…"·started "메세지를 입력하세요."·신규 "오늘 어떤 도움을 드릴까요?".

## 적응 (우리)
- 우리 현재 Composer.tsx(F3): textarea + composer-bar(attach no-op + 3 Pick + send/stop) + ContextStrip(정적). 여기에 위 트레이/오버레이 추가.
- 정적 샘플: `lib/composerSampleData.ts`(SLASH_COMMANDS + SAMPLE_SKILLS 2~3 + SAMPLE_MENTION_TREE 폴더/파일). 첨부=로컬 샘플 썸네일(data URL placeholder). 큐=Composer optional `queued` prop(기본 [], 실큐=M4; 단위테스트서 샘플 주입 검증).
- **새 IPC/store 0.** 슬래시 선택/멘션 삽입=textarea 값 조작(로컬). 첨부=로컬 state. 실행/해석/저장/드레인=M4.
- 아이콘 추가: IconClock·IconFileText·IconCompress·IconShieldChk·IconTerminal(필요분). IconBolt/Eye/Refresh/Book/Image/Folder/ChevRight/Search/X 기존.

## Phase 분해 (3)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | slash-mention | renderer | 없음 | F8 |
| 02 | attach-queue-placeholder | renderer | 없음 | 01 |
| 03 | f9-visual | qa | 없음 | 02 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(슬래시 메뉴·멘션 팔레트·첨부 트레이·큐 스트립 스샷, 원본 대조). 완료 시 REPLICA_GAP F9 ✅ + Iteration 로그.
