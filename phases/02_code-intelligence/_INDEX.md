# Milestone 02 — 코드 인텔리전스 (Track 1 복제)

> 목표: AgentCodeGUI의 코드 뷰어·하이라이팅·마크다운·이미지·레퍼런스 폴더를 **1:1 복제**. 스택은 AgentCodeGUI와 동일하게 맞춘다.

## 스택 결정 (AgentCodeGUI 일치 — 충실 복제)
| 영역 | 라이브러리 | 근거 |
|---|---|---|
| 코드 에디터/뷰어 | **CodeMirror 6** (`@codemirror/state·view·language·commands·search`) | AgentCodeGUI package.json 일치 |
| 마크다운 | **react-markdown** + **remark-gfm** | 동일 |
| 코드블록 하이라이팅(마크다운 내) | **highlight.js** | 동일 |
| LSP(분리) | typescript-language-server + pyright | 동일 (별도 마일스톤) |

> ⚠️ **ADR 후보**: 위 라이브러리 채택은 ADR로 승격 권장(현재 `docs/ADR.md`는 에이전트 잠금 → 사용자 승격). M1 스택(React18/Electron31)은 유지 — 라이브러리만 추가.

## 페이스 (사용자 결정: 뷰어/렌더링 먼저, LSP 분리)
이 마일스톤(M2) = **LSP 없는** 코드 인텔리전스. LSP(호버/정의이동/시맨틱 토큰)는 **다음 마일스톤(M2-LSP)** 으로 분리.

## Phase 분해 (4개 — 의존성 순서)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | code-viewer | shared-ipc + main-process + renderer | trust-boundary(fs.read 경로) | M1 |
| 02 | markdown-and-image | shared-ipc + main-process + renderer | trust-boundary(바이너리 읽기) | 01 |
| 03 | reference-folder | shared-ipc + main-process + renderer | trust-boundary(추가 루트) | 01 |
| 04 | integration + e2e | 통합 + qa | 없음 | 01,02,03 |

## FEATURE_MAP 커버리지 (이 마일스톤)
- C2(코드뷰어 — *구문* 하이라이팅. 시맨틱 토큰은 LSP 마일스톤) · C3(이미지 프리뷰) · C6(레퍼런스 폴더) · C7(마크다운) · C8(JetBrains 컬러 스킴 — 다크 Darcula풍).
- **분리(다음)**: C5(LSP 호버/정의이동) + C2의 시맨틱 토큰.

## 실행
수동: Phase별 coordinator/Worker 위임. 자동: `python scripts/execute.py 02_code-intelligence`.
검증: 단위·통합(Vitest) + e2e(`npm run test:e2e` — CodeMirror 뷰어 렌더/하이라이팅 확인).

## M2에서 안 하는 것 (영구 제외 아님)
- LSP(호버/정의이동/시맨틱) → 다음 마일스톤. · Git 패널 → M3. · 멀티에이전트 → M4. · 라이트테마 → M5.
