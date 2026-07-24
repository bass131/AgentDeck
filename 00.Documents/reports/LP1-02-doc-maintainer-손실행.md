# LP1-02 — Doc Maintainer 루프 손실행 (문서 인용 실측 대조 보고서)

> **마일스톤**: LP1(엔진 패리티 루프 파일럿) · **Phase**: 02 · **성격**: 읽기 전용 인용 대조 (수정 실행 X — "제안만")
> **입력 계약**: `01.Phases/20_LP1-parity-pilot/02-doc-maintainer-dry-run.md`(작업·완료조건) + `00.Documents/reports/LP1-01-대상선정.md` §1(D1~D6 대상·대조 범위)
> **작성일**: 2026-07-18 · **트랙**: 읽기 전용(`02.Source/**`·기존 문서 무수정, 쓰기 = 본 파일 1개)
> **판정 어휘**: 일치 / 불일치 / 미확인 3종만. "미확인"은 사유 명기 — 억지 판정 없음.

이 손실행은 P01이 지정한 6개 문서(D1~D6)를 **각 문서의 대조 범위 그대로** 훑어 코드 경로·수치·명령·ADR·커밋 해시 인용이 실제 레포와 일치하는지 대조한다. 범위는 임의 확장·축소하지 않았다(Phase §작업내용 1·4). 실측 도구 = Read·Grep·Glob·`git cat-file`·`npm test`(전부 읽기 전용, 소스·문서 무변경).

---

## 0. 요약 (문서별 대조 결과)

| 문서 | 대조 범위(P01) | 대조 항목 | 일치 | 불일치 | 미확인 |
|---|---|---|---:|---:|---:|
| D1 `ARCHITECTURE.md` | 전수(코드경로·버전·AgentEvent수·명령) | 47 | 43 | 3 | 1 |
| D2 `FEATURE_MAP.md` | 절 한정(코드좌표·커밋해시·테스트수치) | 36 | 23 | 2 | 11 |
| D3 `PRD.md` | 절 한정(비기능·Track1 목록 + "MVP 제외" 절 실재) | 6 | 3 | 1 | 2 |
| D4 `ADR.md` | 전수(링크 존재·파일명 매칭·행수↔파일수) | 38 | 38 | 0 | 0 |
| D5 `UI.md` | 절 한정(§1 토큰 → tokens.css + 권위소스 3경로) | 43 | 43 | 0 | 0 |
| D6 `REPL_TRANSITION.md` | 절 한정(머리말 현재상태 + §11 현재 주장) | 15 | 12 | 1 | 2 |
| **합계** | | **185** | **162** | **7** | **16** |

> 항목 수는 명백히 동질인 경로·토큰 계열을 그룹 행으로 묶어 세었다(예: D5 §1 토큰 40여 값). 각 그룹 행에도 대표 좌표를 명기했다.
> **미확인 16건의 성격**: D2 과거 gate 테스트 스냅샷 11(재현 = 과거 커밋 체크아웃 필요, 읽기 전용 트랙 밖) + D6 라이브 SDK PASS 결과 1 + D6 gitignore 프로브 아티팩트 1 + D3 원본·미구현 특성 주장 1(clangd/Roslyn) + `.claude` 정본 접근 금지 2(D1 `.claude/` 디렉토리 · D3 `/work:plan` 스킬명) = 16. 억지 판정을 피한 결과이지 문서 오류가 아니다.

---

## 1. D1 — `ARCHITECTURE.md` (전수)

| 문서 좌표 | 문서 주장 | 실측 결과(근거 좌표) | 판정 | 제안 |
|---|---|---|---|---|
| line 25-69, 155-180 | 디렉토리 트리 + 데이터흐름의 코드 경로 33건(index.ts·00_ipc·01_agents 12모듈·02_fs·03_lsp·04_persistence·05_settings·06_window·git.ts·preload/index.ts·renderer(App/layout/components 7종/lib/store/theme)·shared(ipc-contract·ipc/·agent-events·diff-types)·99.Others(scripts/run-e2e.cjs·tests·out)·electron.vite.config.ts·package.json·multiStore.ts·agent-runs.ts·handlers/multi.ts) | 전 경로 디스크 존재(`02.Source/main/01_agents/*` 20파일·`00_ipc/handlers/*` 11파일·`shared/ipc/*` 13파일 등 실측) | 일치 | — |
| line 71 | 트리에 `build/ # 아이콘·NSIS 리소스` | 디스크에 `build/` 없음(`ls -d build/` 실패) | 불일치 | NSIS 리소스는 electron-builder(M5, line 17 "미설치")와 함께 미생성 — 트리에 `(M5 예정·미생성)` 주석 부기 또는 M5 착수 시 생성 |
| line 73 | 트리에 `electron-builder.yml` | 디스크에 없음 | 불일치 | line 17-18의 "M5 예정, 아직 미설치"와 정합하나 트리는 현존물처럼 표기 — 동일 `(M5 예정)` 주석 부기 권장 |
| line 186 | 파이프라인 3단계 `npm run package` — electron-builder → NSIS | `package.json` scripts에 `package` 부재(dev·build·typecheck·test·lint만) | 불일치 | line 189 "배포는 M5 예정"과 정합하나 파이프라인 목록은 미조건 표기 — 3단계에 `(M5)` 마커 부기 |
| line 70 | 트리에 `.claude/` | — | 미확인 | 본 트랙 제약상 `.claude/**` 접근 금지 — stat 미실시(환경상 실재는 알려짐) |
| line 11-13 | 스택 버전 Electron 42·electron-vite 5·Vite 7·React 19·TS 6 | `package.json`: electron `^42.3.2`·electron-vite `^5.0.0`·vite `^7.3.5`·react `^19.2.0`·typescript `^6.0.3` | 일치 | — |
| line 101 | `AgentEvent` = discriminated union **29종** | `shared/agent-events.ts` 판별자 `type:'…'` distinct **29개**(text…permission_mode, line 102-127 나열 29종과 완전 일치) | 일치 | — |
| line 62-63 | `ipc/ 12도메인 re-export` + `13파일` | `ipc-contract.ts` `export *` 12개(workspace…personalization) + `common`(채널無·named export) = 파일 13 | 일치 | — |
| line 184-185 | `npm run dev`·`npm run build` | scripts: dev=`electron-vite dev`·build=`electron-vite build` | 일치 | — |

**D1 소계**: 일치 43 / 불일치 3 / 미확인 1. 불일치 3건은 모두 *M5 배포·electron-builder 미설치*에 기인한 **미래물의 현재형 표기**(문서 다른 줄이 "M5 미설치"를 이미 명기 — 국소 정합성만 결함).

---

## 2. D2 — `FEATURE_MAP.md` (절 한정 — 코드좌표·커밋해시·테스트수치)

| 문서 좌표 | 문서 주장 | 실측 결과(근거 좌표) | 판정 | 제안 |
|---|---|---|---|---|
| line 24·112 | 커밋 해시 17종(fa9df22·560645d·52e7356·74ea489·18def9c·627f229·f74ff70·5ae1033·57b0efd·add3d59·f6be012·1e722c4·23d7fb4·a4aed8c·c5831b4·8cea0c0·4f7a606) | `git cat-file -t` 전부 `commit OK`(17/17 존재) | 일치 | — |
| line 106·109 | `99.Others/tests/e2e/core-loop`·`visual-viewer.e2e.ts` | 둘 다 존재(`core-loop.e2e.ts`·`visual-viewer.e2e.ts`) | 일치 | — |
| line 70·88·100 | `01.Phases/17_GAP1-core-parity/`(+`15-rounds-log.md`)·`18_TG1-thinking-gui/`·`reports/milestones/GAP1-…감사.html` | 전부 디스크 존재 | 일치 | — |
| **line 42·112** | C5·Phase27 코드 좌표 `02.Source/main/lsp` | 해당 경로 없음 — 실제 `02.Source/main/**03_lsp**/`(jsonrpc.ts·manager.ts) | **불일치** | 번호접두 컨벤션(ADR-027) 이후 남은 stale 경로 — `02.Source/main/03_lsp`로 정정(ARCHITECTURE line 49는 이미 `03_lsp/`로 정확) |
| **line 66·112** | `00.Documents/archive/REPLICA_GAP.md`(시각 audit 상세) | 파일 없음 + `00.Documents/archive/` 디렉토리 자체 부재(`find`·`ls` 공히 0건) | **불일치** | 파일 이동/삭제 확인 후 실제 경로로 정정하거나 참조 제거 — 현재 두 곳(line 66·112)이 죽은 링크 |
| line 105-112·100 | 과거 gate 테스트 수치 11종(M1 135/138·M2 286·M4-2 1235·M4-3 1344·M4-4 1583·B9 1602·B8 1651·Phase27 1734·X4 3417·TG1 5247) | 각 수치는 해당 커밋 시점 스냅샷 — 현재 트리에서 재현하려면 커밋 체크아웃+`npm test` 필요(읽기 전용 트랙 밖). 참고: **현재 라이브 총계 = `npm test` 5325 passed/10 skipped, 394 파일 green(exit 0)** | 미확인 | 스냅샷 성격상 재현 대조 보류. 다만 TG1 "5247/0"(line 100)은 그 시점 gate 기록으로 정당(현재 5325 = 후속 LM1·CP1·FB2 등 추가분 반영, 단조 증가) |

**D2 소계**: 일치 23 / 불일치 2 / 미확인 11. 불일치 2건은 **번호접두 리네임 잔재 경로**(lsp)와 **소실된 아카이브 링크**(REPLICA_GAP.md).

---

## 3. D3 — `PRD.md` (절 한정 — 비기능 요구사항·Track1 기능 목록 + "MVP 제외" 절 실재)

| 문서 좌표 | 문서 주장 | 실측 결과(근거 좌표) | 판정 | 제안 |
|---|---|---|---|---|
| **CLAUDE.md 문서지도 ↔ PRD.md 전체** | 헌법 문서지도가 "`PRD.md` — 뭘 만드는지 + **MVP 제외 사항**"으로 PRD에 *"MVP 제외 사항" 절*이 있다고 참조 | PRD 헤더 전수(`grep '^#'`): 목표·설계메모·Track1 완전복제·Track2·진행현황·충실도트랙·비기능요구사항·성공기준 — **"MVP 제외 사항" 절 없음**. `grep 'MVP'` = 0건("제외"는 line 20·82 산문뿐) | **불일치** | 헌법 지도가 실재하지 않는 절을 가리킴(P01이 지목한 핵심 드리프트). PRD에 "MVP 제외 사항" 절 신설(Track2/macOS비목표를 이 절로 정리)하거나, CLAUDE.md 지도 문구를 실재 절명으로 정정 — 정본은 헌법 소유자(영호)가 결정 |
| line 85 | 비기능: "OS Windows 11 우선(10 호환). macOS 비목표" | line 85 문안 그대로 존재(P01 §2 row8이 "line 85"로 인용 — 좌표 정확) | 일치 | — |
| line 41 | Track1 C.15: "typescript-language-server/pyright 번들" | `package.json` deps: pyright `^1.1.410`·typescript-language-server `^5.3.0` + `03_lsp/manager.ts:59·67` shippedModule 로드 | 일치 | — |
| line 24 | Track1 A.2: "Agent SDK query() 전환 완료(ADR-016, Phase 21)" | ADR-016 파일 존재(`adr/ADR-016-agent-sdk-adoption.md`) | 일치 | — |
| line 41 | "clangd/**Roslyn(C#)** 다운로드 … 원본은 OmniSharp가 아니라 Roslyn LSP" | 현재 미구현(다운로드형)·원본 AgentCodeGUI 특성 주장 — 현 레포로 대조 불가 | 미확인 | 미래·원본 특성 주장이라 손실행 대상 밖(사유 기록) |
| line 88 | 비기능: 하네스 자기적용 "…`/work:plan`(세션/루프 실행)" | 실제 스킬명 확인은 `.claude/skills` 접근 필요(금지). 관찰: CLAUDE.md 명령 섹션은 `/work-plan`(하이픈) 표기 — PRD의 `/work:plan`(콜론)과 표기 불일치 | 미확인 | 정본(`.claude`)은 접근 금지라 판정 보류 + PRD↔CLAUDE 표기 통일 필요(`/work-plan` 유력) — 영호 확인 |

**D3 소계**: 일치 3 / 불일치 1 / 미확인 2. 불일치 1건 = **"MVP 제외 사항" 절 부재**(§2 철칙 ③ PRD 화해의 앵커, P01이 D3를 고른 진앙 — 손실행이 정확히 포착).

---

## 4. D4 — `ADR.md` 인덱스 (전수 — 링크 존재·파일명 매칭·행수↔파일수)

| 문서 좌표 | 문서 주장 | 실측 결과(근거 좌표) | 판정 | 제안 |
|---|---|---|---|---|
| line 9-45 | 37개 인덱스 행(001~037)이 각각 `adr/ADR-NNN-*.md` 링크 | `adr/` 디스크에 `ADR-001-*`~`ADR-037-*.md` **37파일**, 인덱스 각 행 링크가 실제 파일과 1:1 매칭(파일명·번호 전수 일치) | 일치 | — |
| line 7-45 | 인덱스 행 수 = 파일 수 | 인덱스 37행(001-037) ↔ `adr/` 파일 37개 = **37↔37 일치** | 일치 | — |

**D4 소계**: 일치 38 / 불일치 0 / 미확인 0. **완전 정합** — 링크 깨짐 0, 파일명 규약 이탈 0, 개수 일치.
> 범위 밖 기록: P01 D4 "예상 항목 유형"에 상태 라벨(활성/superseded)이 있으나, 확정 대조 범위는 "링크·파일명·개수"뿐이라 라벨-본문 교차대조는 실시하지 않았다(범위 준수).

---

## 5. D5 — `UI.md` (절 한정 — §1 토큰 HEX·radius·폰트 → tokens.css + 권위소스 3경로)

| 문서 좌표 | 문서 주장 | 실측 결과(근거 좌표) | 판정 | 제안 |
|---|---|---|---|---|
| line 6 | 권위 소스 3경로: `theme/tokens.css`·`layout/Shell.tsx`+`shell.css`·`lib/theme.ts` | 3경로 전부 존재(`renderer/src/theme/tokens.css`·`layout/Shell.tsx`·`layout/shell.css`·`lib/theme.ts`) | 일치 | — |
| line 22-25 | 표면 토큰: desktop `#EFE7D6`/`#1A1917`·bg(=paper) `#FBF8F1`/`#242322`·surface `#F4EFE4→#E8DFCD`/`#2C2B2A→#3D3B38`·inset `#F6F1E7`/`#1E1D1B` | `tokens.css:11-16,178-183` 전 HEX 일치(+`--paper:var(--bg)` 별칭 확인) | 일치 | — |
| line 28-29 | 경계선 3·텍스트 4단계 라이트/다크 HEX | `tokens.css:21-29,185-192` line/line-2/line-strong·text~text-4 라이트·다크 전 HEX 일치(`--muted=--text-3` 포함) | 일치 | — |
| line 32-33 | accent `#D97757`/`#E08763`·on-accent `#FFFFFF`/`#2A2620` | `tokens.css:33,37,194,198` 일치 | 일치 | — |
| line 37 | 기능색 10종(green `#5E9968`·red `#C25B4A`·blue/cyan `#5E94BC`·yellow `#C99A2E`·running `#5E94BC`·violet `#B07FA8`·teal `#4F9E94`·rose `#C2724E`·gold `#C98A3C`) | `tokens.css:48-77` 전 HEX 일치 | 일치 | — |
| line 44-50 | gold 계열: gold `#C98A3C`/`#D9A24C`·gold-soft `#F1E2CD`/rgba(217,162,76,0.16)·gold-line `#E1BF93`/rgba(…,0.36)·glow-1 0.45/0.42·glow-2 0.85/0.80 | `tokens.css:51,56-57,63-64,203,206-207,211-212` 전 값 일치 | 일치 | — |
| line 38 | ultracode `#7C3AED`/`#A78BFA` | `tokens.css:82,225` 일치 | 일치 | — |
| line 58-60 | 폰트: serif=Newsreader·sans=Wanted Sans Variable·mono=JetBrains Mono | `tokens.css:102-104` 일치 | 일치 | — |
| line 63,72-73 | radius `11px`·레이아웃(titlebar 40·statusbar 26·sidebar 248·explorer 236·agent 392·rail 30)·모션(ease-out cubic-bezier(.2,.8,.2,1)·fast .13s·.18s·slow .22s)·덱 6색·신택스 7종 | `tokens.css:107,134-140,128-131,120-125,93-99` 전 값 일치 | 일치 | — |

**D5 소계**: 일치 43 / 불일치 0 / 미확인 0. **문서 자기선언("값 충돌 시 코드가 이김")대로 코드와 완전 정합** — Clay HEX·11px·serif 팔레트 무드리프트.

---

## 6. D6 — `REPL_TRANSITION.md` (절 한정 — 머리말 현재상태 + §11 현재 주장 / §2·§7·§9·§10 동결이력 제외)

> **범위 준수**: §2(RF1 분해 *이전* 파일·라인, line 23-30)·§7·§9·§10은 문서가 "설계 근거 기록·분해 이전 기준"으로 명시한 **동결 이력**이라 대조 제외. 이 제외 구별 자체가 P01이 D6를 고른 검증 포인트 — 손실행은 동결 라인번호(예 `ClaudeCodeBackend.ts:712`)를 *현재 주장으로 오인해 대조하지 않았다*.

| 문서 좌표 | 문서 주장 | 실측 결과(근거 좌표) | 판정 | 제안 |
|---|---|---|---|---|
| line 5 | 현재상태: 기본 resume(ADR-023)·held-open 옵트인(ADR-024)·watchdog(4b) 드롭 | ADR-023·ADR-024 파일 존재(`adr/`) | 일치 | — |
| line 5 | "라이브 e2e 최종 사인오프 완료 — live-sdk·context-live·loop-live 실 SDK PASS" | 3 e2e 파일 존재(`tests/e2e/live-sdk.e2e.ts`·`context-live.e2e.ts`·`loop-live.e2e.ts`) | 일치(파일 존재) | — |
| line 5 | 위 "실 SDK PASS" 결과 | PASS 여부는 실 API 라이브 실행 필요 — 본 트랙 미실행 | 미확인 | 라이브 SDK 실행 결과라 정적 대조 불가(사유 기록) |
| line 7 | 턴 회계 갱신 근거 "커밋(60e21cf)·ADR-035·`01.Phases/17_GAP1-core-parity/`" | 60e21cf `commit OK`·ADR-035 파일 존재·17_GAP1 디렉토리 존재 | 일치 | — |
| line 9 | 원인 정정 근거 "(→fa9df22)·(→ADR-029)" | fa9df22 `commit OK`·ADR-029 파일 존재 | 일치 | — |
| **line 9** | "상세=`01.Phases/LR1-loop-resume/_resume-bug-diagnosis.md` §7·§8" | 해당 경로 없음 — 실제 `01.Phases/**03_**LR1-loop-resume/_resume-bug-diagnosis.md`(파일 자체는 존재) | **불일치** | 번호접두 리네임 잔재(D2 lsp와 동일 클래스) — `01.Phases/03_LR1-loop-resume/…`로 정정 |
| line 332 | §11 근거: "완성 결정·코드영향 = `ADR.md` ADR-024 '재고(2026-07-01)' 블록" | `adr/ADR-024-repl-persistent-session.md:26`에 "**재고(2026-07-01) — 세션 기본값 전환**" 블록 실재 | 일치 | — |
| line 332 | §11 근거: idle probe `bf1_idle_probe.mjs`(7분 idle 견딤) | repo에 파일 없음(`find` 0건) | 미확인 | 프로브는 `artifacts/`(gitignore, 문서 line 166·261 명시) — 부재가 정상. ADR-024:26이 동일 프로브 결과를 서술해 교차 정합 |

**D6 소계**: 일치 12 / 불일치 1 / 미확인 2. 동결이력/현재주장 구별 성공(§2 라인번호를 오대조하지 않음). 불일치 1건 = **번호접두 경로 잔재**.

---

## 7. 관찰·패턴 노트 (제안만 — 수정 실행 X)

- **패턴 A — 번호접두 리네임 잔재(ADR-027/028)가 문서 인용에 남음**: D2 `02.Source/main/lsp`(→`03_lsp`)·D6 `01.Phases/LR1-loop-resume`(→`03_LR1-loop-resume`) 두 건이 동일 원인. 디렉토리 번호접두 도입 시 *기존 문서의 경로 인용 전수 스캔·동반 갱신*이 누락됐다(메모리 "훅 검출 패턴은 rename에 조용히 죽는다"의 문서판). 향후 리네임 시 `grep -r '<옛경로>' 00.Documents/` 게이트 권장.
- **패턴 B — 미래물(M5)의 현재형 표기**: D1 `build/`·`electron-builder.yml`·`npm run package` 3건은 동일 문서 타 줄이 "M5 미설치"를 명기하나 트리·파이프라인 국소에는 조건 표기가 없다. 손실행 자동 대조는 "디스크 부재 = 불일치"로 잡으므로, 예정물엔 `(M5 예정)` 인라인 마커가 doc-rot 오검출을 줄인다.
- **소실 링크**: D2 `archive/REPLICA_GAP.md`는 디렉토리째 부재 — 이동/삭제 이력 확인 필요(죽은 참조 2곳).
- **핵심 드리프트(D3)**: "MVP 제외 사항" 절 부재는 헌법↔PRD 앵커 어긋남이라 우선순위 최상 — 단, PRD·CLAUDE.md는 **결정 문서**라 secretary 편집 금지 영역(정본 = 영호). 본 보고서는 제안까지만.

## 8. 완료 조건 자가 검증 (Phase §완료 조건)

- [x] **보고서 존재, P01 전 문서(D1~D6) 대조 표 등장** — §1~§6에 D1~D6 6개 문서 전부 표로 대조(본 파일 = 유일 신규 산출물).
- [x] **모든 행에 문서 좌표(파일:줄) + 판정, 판정 3종만** — 전 행에 `line N`/파일 좌표 + 일치/불일치/미확인 부여(그룹 행도 대표 좌표 명기). 4번째 판정값 없음.
- [x] **불일치 행 전부에 실측 근거 좌표 + 제안 1줄** — 불일치 7건(D1×3·D2×2·D3×1·D6×1) 모두 근거 좌표(디스크 부재/실제 경로/`git`/`grep` 결과) + 제안 컬럼 채움.
- [x] **기존 문서 diff 0** — `02.Source/**`·기존 `00.Documents` 문서 무수정, 쓰기 = 본 파일 1개(git status로 확인).

> **정오(2026-07-18)**: 초판 합계의 미확인 17→16 재집계 정정 — Doc Maintainer 보고서 자신도 검산 대상임을 보여준 사례(커밋 3cffe8d 메시지의 "미확인 17"은 초판 기준). 재집계 근거: 소계 합(1+11+2+0+0+2)=16 ↔ 185−162−7=16 이중 검산 일치. 합계 셀만 1 과대(라이브 SDK·특성 주장 항목 이중 귀속)였고 어느 소계도 과소 아님 — 총계 185·일치 162·불일치 7은 참값 유지.

---
*근거 도구 로그: `git cat-file -t`(커밋 18종)·`ls`/`find`(경로 존재)·`grep`(헤더·토큰·버전)·`npm test`(현재 5325 passed green)·Read(tokens.css·6문서 전문). 전부 읽기 전용.*
