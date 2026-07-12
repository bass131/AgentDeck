### ADR-028: 루트 디렉토리 재구성 — 번호접두 *최상위* 카테고리 (`00.Documents`·`01.Phases`·`02.Source`·`99.Others`)

**결정**: 레포 루트의 콘텐츠 폴더를 번호접두 카테고리 4개로 묶는다 (ADR-027의 "번호접두 시각순서" 철학을 *최상위*로 확장). 구분자=`.`(점), 정렬=논리/중요도 순.

| 옛 경로 | 새 경로 | 비고 |
|---|---|---|
| `docs/` | `00.Documents/` | 하네스 brain (PRD·ARCHITECTURE·ADR·UI…) |
| `phases/` | `01.Phases/` | `/work:plan` Phase 정의 |
| `src/` | `02.Source/` | 앱 소스 (`main`·`preload`·`renderer`·`shared` 내부 이름 불변) |
| `tests/` · `scripts/` · `out/` | `99.Others/{tests,scripts,out}/` | 테스트·빌드보조·산출물 |

- **ADR-027 제외규칙의 *상위 적용***: ADR-027은 "최상위 `src/{main,preload,renderer,shared}`는 번호접두 *제외*"라 했다. 본 ADR은 그 상위인 `src/` 컨테이너 자체를 `02.Source/`로 옮길 뿐, 내부 4폴더 이름은 불변. electron-vite 진입점·`@shared`/`@renderer` alias는 *타깃 경로*만 갱신(`src/`→`02.Source/`).
- **구분자 `.`(점) 선택**: ADR-027 하위폴더는 `_`(언더바)였으나 최상위는 `.`으로 시각 구분 강화(영호 선택). 경로 세그먼트 *중간*의 점은 확장자가 아니므로 모듈 해석 무탈.

**이유**: 루트를 열었을 때 "문서 → Phase → 소스 → 기타" 순으로 파일시스템이 답하게 함(탐색·온보딩 비용↓). 영호 직접 폴더 정리.

**트레이드오프 / 불변**:
- (⚠️ 큰 단점 — 생태계 마찰) `src/`는 JS/Electron 사실상 표준 관례. `02.Source/`는 모든 도구·예제·신규 기여자의 기본 가정과 *영구적으로* 어긋난다(신규 도구 도입·온보딩 시 반복 마찰). 정리정돈의 시각적 명료성 ↔ 도구 생태계 영구 마찰의 교환 — 영호 단독 결정으로 수용.
- (이동 비용) 테스트→소스 상대 import **1192곳** 깊이보정(`../../src`→`../../../02.Source`) + cwd기준 소스-읽기 10곳 + config 8개(electron.vite·tsconfig[node/web]·vitest·playwright·package.json·eslint·gitignore) 배선.
- (⚠️ hook 리터럴 함정 — ADR-027 재확인) `risk-detector`·`tdd-guard`·`convention-size-guard`·`reviewer-auto-trigger`의 `*src/*` glob·`$PROJ/tests` lookup은 rename에 안 안전 → 동반 갱신(`.claude/hooks/**`=영호 단독, 수동 승인 하 적용). `tdd-guard` 테스트 lookup·`reviewer-auto-trigger` 경계glob 2건은 에이전트 자동매핑이 놓쳐 직접 정독으로 포착.
- (불변) `@shared`/`@renderer` alias = *타깃 경로*만 갱신, 별칭명 불변 → 소스 내부 import 무변경. 신뢰 경계·IPC 단일정의·엔진 추상화(ADR-003) 불변. 빌드 산출물 `out/`은 루트 유지(electron-vite 기본값 — gitignore 재생성물이라 카테고리화 실익 < 도구 마찰).

**위험도**: [M] — 구조 재배치(빌드·하네스 경로 동반, 기존 결정/거동 불변).

**현황(2026-06-30)**: ✅ **영호 직접 폴더 이동 + AI 배선**. 브랜치 `feature/rf1-trackC`. 검증: typecheck green / vitest **3619 통과(거동 불변, 기준선 일치)** / electron-vite build 3타깃 green. 분할 커밋(빌드배선 → hook기능 → 하네스docs → 본 ADR). 역사적 기록(기존 ADR 항목·`.claude/CHANGELOG.md`)은 옛 `src/`/`docs/` 경로를 *그대로 보존* — 본 ADR이 옛→새 매핑을 제공.

---

