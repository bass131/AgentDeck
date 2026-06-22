# Milestone 13 — 충실도 F11: 모달 군 1 (Git·폴더전환·프롬프트·Ask) (Fidelity)

> REPLICA_GAP 웨이브 F11. 원본 GitModal·FolderSwitchDialog·PromptModal·AskModal를 시각 1:1. **디자인-우선**: 정적 샘플(git status/commits/changes), Ask는 샘플 스레드. git 백엔드=M3·ask 엔진=M4·실 폴더전환=M4. renderer-only, 새 IPC 0.

## 원본 구조
- **GitModal**(C:/Dev/AgentCodeGUI/.../GitModal.tsx L258~486): gitm-overlay>gitm-modal(resizable)>diff-head(gitm-ic IconGitBranch + gitm-name repo + gitm-br ⎇branch ↑ahead/↓behind + gitm-path + 당겨오기/푸시 gitm-btn + max/close) + gitm-body(gitm-nav[작업 트리: 변경 사항±+changeCount / 히스토리: 모든 커밋⏱+count / 브랜치 gitm-item static ⎇+current check / 원격 ☁ / 태그 ⌂→history+query] + **history 뷰**[gitm-list: gitm-filter 검색 + gitm-scroll 커밋 rows(레일·메시지·태그·해시·시간·작성자) / gitm-detail: gd-pad(gd-msg subject·gd-desc body·gd-meta[gd-av·gd-who·gd-hash 복사]) + 변경된 파일 FileRow] OR **changes 뷰**[gitm-list wide: gitm-day 변경된 파일+FileRow+gitm-hint / gitm-compose: subject input + body textarea + 「Claude에게 메시지 짓게 하기」 + 커밋]).
- **FolderSwitchDialog**(72L): set-dialog류 — 폴더 아이콘 + "작업 폴더를 변경할까요?" + 단일/멀티 메시지 + 취소/변경(danger). 백드롭·Esc 취소.
- **PromptModal**(123L): IconSpark + "프롬프트 설정" + 대상/범위 + textarea(maxLength 4000 + 문자 카운터) + Enter/Ctrl+Enter 저장·Esc 닫기 + 비우기/취소/저장.
- **AskModal**(306L): orb 헤더("빠른 질문"·"/ask" 배지·휘발성 pill·최소화 ⌄·닫기 ✕) + 본문(빈 "무엇이든 편하게 물어보세요"/MessageView 스레드/WorkingIndicator) + 컴포저(textarea·전송) + 풋노트. 최소화→우하단 q-mini 알약. Esc 최소화→Esc 닫기.

## 적응 (우리)
- 정적 샘플: `lib/gitSampleData.ts`(repo/branch/ahead/behind, commits[], changes[], commitDetail). AskModal 샘플 스레드(빈상태 기본).
- **트리거(자기완결 — 기존 F8/F9 계약 무파손, plan-auditor 🔴 반영)**:
  - GitModal ← 탐색기 git 버튼(추가) + **Shell open state**.
  - PromptModal ← 사이드바 세션 ctx-menu "프롬프트 설정" → **Sidebar 내부 로컬 state**(rename/삭제 다이얼로그 선례처럼). Sidebar props·Shell 무변경.
  - AskModal ← 컴포저 슬래시 `/ask` → Composer **optional `onSlashAsk?` prop**(미주입 시 기존 onChange 그대로 — 하위호환, composer-trays.test 무파손). 주입은 Conversation→Composer 경유, Shell open state.
  - FolderSwitchDialog ← **라이브 트리거 없음**(실 reopen 흐름 무변경). 컴포넌트 + **단위 전용 검증**(실 폴더전환 확인=M4).
- 기존 Modal/set-dialog 패턴 재사용 가능(PromptModal·FolderSwitch). GitModal·AskModal은 커스텀 셸. **새 IPC 0**: commit/push/pull/ask 전송=시각(샘플), 실동작=M3/M4.
- 아이콘: IconGitBranch·IconMax/IconRestore(있으면)·IconClaude(F7) 등 필요분.

## Phase 분해 (4)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | gitmodal | renderer | 없음 | F10 |
| 02 | prompt-folderswitch | renderer | 없음 | 01 |
| 03 | askmodal | renderer | 없음 | 02 |
| 04 | f11-visual | qa | 없음 | 03 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(GitModal 히스토리/변경 뷰·PromptModal·AskModal·FolderSwitch 스샷). 완료 시 REPLICA_GAP F11 ✅ + Iteration 로그.
