### ADR-027: 디렉토리 번호접두 컨벤션 (`NN_name`) — 큰 분류 시각적 순서화

**결정**: 일부 디렉토리의 *하위 폴더*에 `NN_<name>` 언더바 번호접두를 도입한다 (구분자=`_`, 번호=촘촘 `00,01,02…`, 정렬=**논리/데이터흐름 순**). 적용 범위:

| 범위 | 예시 (논리 순) |
|---|---|
| `src/renderer/src/components/` | `00_shell`·`01_conversation`·`02_file`·`03_viewer`·`04_git`·`05_agent`·`06_feedback` (+ `common` 무번호) |
| `src/main/` 내부 모듈 | `00_ipc`·`01_agents`·`02_fs`·`03_lsp`·`04_persistence`·`05_window` |
| `docs/` | `00_PRD`·`01_ARCHITECTURE`·`02_ADR`·`03_UI`·`04_FEATURE_MAP`·… (읽기 순) |

- **❌ 제외**: 최상위 `src/{main,preload,renderer,shared}` — electron-vite 진입점(`electron.vite.config.ts`)·`@shared`/`@renderer` alias 고정 + 헌법 "최상위 폴더 추가=ADR". 번호접두 대상 아님.
- **구분자 `_` 선택**: 점(`.`)은 일부 도구가 확장자로 오인할 여지, 하이픈(`-`)도 가능하나 언더바가 식별자 친화적 + import 경로 무탈.

**이유**: 파일시스템 알파벳 정렬은 *논리적 순서*(데이터 흐름·중요도)와 어긋남 → 번호접두로 "어디부터 보나"를 파일시스템이 답하게 함(온보딩·탐색 비용↓). 관련 파일을 도메인 카테고리로 묶어 응집도↑. 영호 요청(큰 분류 `00_`·`01_` 순서화).

**트레이드오프 / 불변**:
- (단점) rename 시 import 경로 churn 1회 + 카테고리 *삽입* 시 뒤 번호 재정렬(촘촘 선택의 비용). → `git mv`(히스토리 보존) + 일괄 갱신으로 흡수.
- (불변) agent R/W 글롭 `src/main/**`·`src/renderer/**`는 `/**`라 하위 rename에 **안 깨짐**. electron-vite alias·신뢰 경계(ADR 신뢰경계)·IPC 계약 단일정의 불변.
- (⚠️ 주의 — 글롭 ≠ 리터럴) `scripts/hooks/risk-detector.sh`의 `*src/main/ipc/*` 같은 **리터럴**은 rename 시 깨져 trust-boundary 검출이 침묵 → 해당 Phase(RF1 P07)에서 hook 패턴 동반 갱신(`scripts/hooks/**`=영호 단독 확정). 같은 함정: shared-contract `*src/shared/ipc-contract*`(P09).

**위험도**: [M] — 구조 컨벤션(행동 변경 동반, 기존 결정 불변).

**현황(2026-06-27)**: ✅ **결정 확정(영호 GO)** — 구분자 `_`·촘촘·논리순. 구현은 RF1-cleanup 트랙 B(P05 매핑 → P06 components → P07 src/main → P08 docs). 미구현(컨벤션만 박제).

---

### 개정 1 (2026-07-26, NC 마일스톤 유지보수 창 1 — 영호): `docs/` 행의 미이행 정정 + 범위를 폴더 층으로 확정

**무엇이 문제였나**: 위 표의 `docs/` 행은 `00_PRD.md`·`01_ARCHITECTURE.md` 처럼 **파일에 번호를 붙이는** 것을 의도했고, 그 구현이 `01_Phases/00_RF1-cleanup/08-docs-prefix-renumber.md` 에 배정됐다. 그런데 그 Phase 문서는 **frontmatter `status: done` ↔ 본문 「상태: pending」 ↔ 체크박스 전부 미체크 ↔ 실제 구현 0건**이라는 네 겹 모순 상태로 종결 처리됐다. 즉 **규칙이 없었던 게 아니라, 이행되지 않은 규칙이 "완료"로 기록**돼 있었다.

**정정**: `docs/` 행의 실행 범위를 **파일 번호접두 → 폴더 번호접두**로 이관한다.

- **`00_Documents/` 루트 `.md` 7개에는 번호를 붙이지 않는다**(영호 결정 2026-07-26). 이 파일들은 `CLAUDE.md` 「문서 지도」가 이미 **읽는 순서를 문장으로 소유**하고 있어 번호가 중복 정보이며, 헌법·정책·훅 다수가 `00_Documents/ARCHITECTURE.md` 같은 **경로 리터럴**로 이들을 가리켜 개명 파장이 이득보다 크다.
- 대신 **`00_Documents/` 하위 폴더**에 `NN_PascalCase` 를 적용한다 — `00_Harness`·`01_Adr`·`02_Reports`·`03_Reviews`·`04_Artifacts`·`05_Assets`. 실행 = NC 마일스톤 Phase 05.
- ⚠️ **`02_Source/{main,preload,renderer,shared}` 명시 제외는 그대로 유효**하다(위 「❌ 제외」). electron-vite 진입점·`@shared`/`@renderer` alias 고정이 근거이며, 개정 1은 이 제외를 건드리지 않는다.
- `01_Phases/00_RF1-cleanup/08-docs-prefix-renumber.md` 의 `status` 를 사실(`superseded`)로 고치고, 이 결정이 NC 마일스톤으로 이월됐음을 본문에 남긴다.

**파일명 층은 이 ADR이 소유하지 않는다** — "어떤 폴더가 어떤 파일 명명 계약을 갖는가"는 **ADR-039**가 정본이다. 본 ADR은 이제 **폴더 이름 층만** 소유한다. 두 ADR의 경계를 이렇게 자른 이유는 실측이다: 파일 층은 폴더마다 **이미 일관**했고 혼재는 폴더 이름에서만 일어났다.

> 📌 **표의 `src/…` 경로 표기는 stale**이다 — ADR-028이 `02_Source/` 로 재편했다. 경로 리터럴을 고치는 것이 아니라 **어느 ADR이 최신인지**를 여기 적어 두는 편이 안전하다(본문 치환은 결정 이력을 사후 변조한다). 현행 경로 = `02_Source/renderer/src/components/`·`02_Source/main/`.

**위험도**: [M] — 컨벤션 범위 재확정(행동 변경 동반).

**관련**: ADR-039(명명 규범 정본 — 파일 계약 소유) · ADR-028(루트 재편) · `01_Phases/22_NC-naming-placement/`(이행 마일스톤).

---

