# P15 라이브 버그 헌팅 — 라운드 원장

> **목적**: P15 종결 판정의 기계 증적 — 연속 2라운드 신규 결함 0이면 종결.

## 라운드 1 (2026-07-14)

### 통주 배터리
6 spec 34 tests 전건 green:
- gap1-dogfood-live (8)
- gap1-dogfood-live2 (2)
- p13-live-mode-switch (1)
- p14-splitview-shots (5)
- visual-shots (16)
- **신규** gap1-p15-hunt-r1 (2: 연속 인터럽트 H1 · 다중 세션 병행 H2, GAP1HUNT1 게이트)

### 신규 티켓 3
| 티켓 | 내용 | 처리 |
|---|---|---|
| R1-T1 | interrupt() Promise reject unhandled (라이브 확정, 인터럽트당 2건 + teardown 경로) | **봉합** (S1 동근원) |
| R1-T2 | H1 좀비 판정 flake (테스트 측 — SmoothMarkdown reveal 잔여 표출 오판) | **해소** (구조 신호로 판정 교체) |
| R1-T3 | 인터럽트로 잘린 턴이 즉시 버블 확정 안 됨 (post-interrupt done 지연/유실 의심, soft-terminal/타임아웃 설계 필요) | **R2 승계** |

### 시드 처리 상태 (전 항목)
- plan Write 밖 경로 인디케이터 소음 → **봉합** (S5 fileChangeTracker 컨테인먼트 — root 보유 시 밖 경로 무방출, root 미지정 기존 유지)
- planFilePath 전체경로 → **봉합** (S2 basename + title 전체경로 유지)
- interrupt() unhandled 하드닝 :615/:721 → **봉합** (S1 reject 흡수 2지점)
- 인터럽트 "중단됨" 마커 → **봉합** (S3 interrupted additive 필드 + `[data-interrupted]` muted pill — 휘발 관례, 영속 스키마 무접촉 reviewer 확인)
- goal 정지 어포던스 → **봉합** (S4 `.loop-goal-stop`, props 계약 변경 0)
- P08 클릭→라인 스크롤 → **R2 승계(봉합 방향)** — 라이브 실사용 불편 확인(SearchResultView.tsx:45-48 m.line 미전달), RED 미박제라 R1 봉합 불가(재현 없는 봉합 금지)
- P08 🟡 3건:
  - (a) 다중 블록 귀속 골든 → **GREEN 안전망 편입**
  - (b) Grep -n 오파싱 → **봉합** (S6b filenames 대조 드롭)
  - (c) React key → **비결함 판정** (key 유일성 4중 근거 실측)
- P09 🟡 4건:
  - 추출 경로 컨테인먼트 → **명시 보류** (4중 방어 실측 + 정품 .output은 워크스페이스 밖 SDK 임시 디렉토리라 컨테인먼트 강제 시 정상 tail 전멸 — 백로그 귀속)
  - TERMINAL shared 승격 → **명시 보류** (위생 리팩토링, 실사용 결함 아님 — 백로그)
  - outputTruncated 이중 의미 → **잠정 보류** (R1 라이브 오표시 미관측 — R2 재확인 후 확정)
  - notification 유실 문서화 → **명시 보류** (P15 문서 수정 금지 제약 — M5 전 문서 스윕 귀속)

### reviewer
통과 (위반 0 · 🟡2) — 🟡1 헤더 주석은 즉시 해소, 🟡2 S6b 라이브 정합 실측은 R2 배터리 편입.

### 게이트 (실측)
- `npm run typecheck`: green (node+web 에러 0)
- `npm run test`: green — 372 files passed / 5 skipped, **5135 tests passed / 8 skipped / 0 failed**. 1차 실행에서 `store.test.ts` B1 정렬 동형성 1건 flake(시간 기반 정렬) — 파일 단독 재실행 64/64 green, 전체 재실행 5135/0 green으로 flake 확정(P15 무관 기존 테스트).
- `npm run lint`: green (경고·에러 0)

## 라운드 2 (2026-07-15)

### 통주 배터리
7 spec:
- gap1-dogfood-live **6/8** — ③=R2-T1 교차재현 · ⑦=③실패→워커 재시작 커플링(신규 결함 아님)
- gap1-dogfood-live2 2/2
- p13-live-mode-switch 1/1
- p14-splitview-shots 5/5
- visual-shots 16/16
- gap1-p15-hunt-r1 2/2 — **V2: 인터럽트 rejection 0건 확증 — R1 봉합 유효**
- **신규** gap1-p15-hunt-r2 **4/5** — L1은 V1 의도 표지 soft RED만, L2 대형파일·L3·L4·L5 장시간 11턴 PASS

### 신규 티켓 4
| 티켓 | 내용 | 처리 |
|---|---|---|
| R2-T1 🔴 | (agent-backend) S6b 실SDK 회귀 — 실 SDK content 모드 filenames=[] → R1 대조가 유효 매치 전량 오드롭, P08 카드 라이브 소멸 3/3 | **봉합** (claude-stream.ts 빈 배열 대조 생략, 골든 6/6) |
| R2-T2 | (테스트 측) 성장 신호 조기 발화 | **해소** (hunt-r2 AI 버블 신호 + hunt-r1 동수리) |
| R2-T3 🟡 | (renderer) 컨텍스트 게이지 캐시 미합산 — REPL 턴3+ 0% 고정 | **봉합** (gaugeCalc 4항 합산) |
| R2-T4 | dogfood ③실패 후 teardown 60s 초과 1회 | **관찰 보류** (단독 1회, live-repro-stop-rule — R3 관찰 항목) |

### R1 승계 처리
- P08 클릭→라인 스크롤 → **봉합** (openFile 3rd arg additive · openedLine · CodeViewer scrollIntoView — fsRead IPC 불변)
- R1-T3 (post-interrupt done 지연/유실 의심) → **미재현 종결** (t_done 61ms/3.4s, done 유실 0 — R1 관측은 reveal 지연 혼동 추정, hunt-r2 프로브 상주로 관찰 지속)
- outputTruncated 이중 의미 → **보류 확정** (2라운드 연속 미관측)

### 부수
- store.test.ts B1 시간 기반 정렬 flake 결정론화 (fake Date)
- 옛 골든 2건 정본 정합 (claude-file-changed 헤더는 R1분 · gap1-p08-search-result-render:215 3인자)

### 비결함 성능 기록
6,000줄/440KB — 뷰어 90ms · diff 976ms · 프리즈 0 · 11턴 힙 증가 0.

### reviewer
R2 reviewer 별도 실행 (결과는 coordinator 최종 보고에 통합).

### 게이트 (실측)
- `npm run typecheck`: green (node+web 에러 0)
- `npm run test`: green — 375 files passed / 5 skipped, **5153 tests passed / 8 skipped / 0 failed**
- `npm run lint`: green (경고·에러 0)

### 판정
**신규 결함 계수: R2 = 2건 (R2-T1 · R2-T3) → 수렴 미충족, R3 진행.**

## 라운드 3 (2026-07-15)

### 통주 배터리
8 spec **42 tests 전건 GREEN** (9.7분, EXIT=0):
- gap1-dogfood-live 8/8 — R2의 ③⑦ 회복
- gap1-dogfood-live2 2/2
- p13-live-mode-switch 1/1
- p14-splitview-shots 5/5
- visual-shots 16/16
- gap1-p15-hunt-r1 2/2
- gap1-p15-hunt-r2 **5/5** — L1 soft RED 소멸, R2-T1 봉합 확증
- **신규** gap1-p15-hunt-r3 3/3 — L1 재시작 복원 이어가기 · L2 권한 거부 후 연속 · L3 R2 봉합 하드 확증

### 검증 W1~W5 (전건 확증)
- W1: 검색 카드 구조화 렌더 복원 (3중 채증)
- W2: 매치 클릭→라인 중앙 스크롤 (scrollTop 5904px · 중심비 0.501)
- W3: 게이지 캐시 실점유 (25~26K/1M — 0% 고정 소멸)
- W4: R2-T4 미재발 (close 164/324/349ms — 관찰 지속)
- W5: 인터럽트 rejection 0 · done 즉시성 (t_done 41ms · 간극 8ms)

### 신규 티켓
**0건** (flake 0 — 전건 1차 통주 GREEN)

### reviewer
봉합 0건이라 이번 라운드 reviewer 해당 없음 (R1·R2 봉합 누적분 reviewer 완료).

### 게이트 (실측)
- `npm run typecheck`: green (node+web 에러 0)
- `npm run test`: green — 375 files passed / 5 skipped (380), **5153 tests passed / 8 skipped / 0 failed**
- `npm run lint`: green (경고·에러 0)

### 판정
**신규 결함 계수: R3 = 0건 → 수렴 1/2** (R2=2건이라 R3이 첫 0라운드. R4가 0건이면 연속 2라운드 0 성립·종결).
