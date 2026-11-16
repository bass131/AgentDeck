# 도구 조사 — AgentDeck 코드 구조 계층 그래프

조사일: 2026-11-16. 목적: 프로세스 → 도메인 → 파일 → 선언 → 멤버를 한 단계씩 펼쳐 보며, 클래스·멤버 설계와 이름 규칙을 읽는 HTML 한 장.

## 구조 추출 후보

| 도구 | URL | 하는 일 | 이 용도 적합도 |
|---|---|---|---|
| TypeScript Compiler API | https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API | `ts.createSourceFile`로 AST(구문 트리)를 얻는다. 접근 제한자·static·readonly·JSDoc·타입 표기까지 원문 그대로 읽힌다. | **높음.** 저장소에 이미 `typescript@6.0.3`이 있어 설치가 필요 없다. 필요한 필드를 마음대로 고를 수 있다. |
| ts-morph | https://ts-morph.com/ | Compiler API를 감싼 편의 래퍼. `getClasses()`, `getMethods()` 같은 API. | 중간. 코드는 짧아지지만 별도 설치가 필요하고, 이번 범위(구문만 읽기)는 Compiler API로 충분하다. |
| TypeDoc (`--json`) | https://typedoc.org/options/output | 문서 생성기. `--json`으로 전체 reflection(선언 모델)을 JSON으로 내보낸다. | 중간. export된 공개 API 위주라 내부(비 export) 선언·private 표기 통계·폴더 계층을 따로 다시 짜야 한다. |
| dependency-cruiser | https://github.com/sverweij/dependency-cruiser | 파일 간 import 그래프, 규칙 검사, `-T html` 리포트. | 의존 보기에는 좋지만 클래스·멤버는 다루지 않는다. 별도 설치 필요. |
| madge | https://github.com/pahen/madge | import 그래프·순환 탐지, Graphviz로 DOT/SVG 출력. | 낮음. Graphviz가 필요하고 선언 수준 정보가 없다. |
| tsuml2 | https://github.com/demike/tsuml2 | TS 소스 → UML 클래스 다이어그램(SVG/Mermaid/nomnoml). | 낮음. 정적 그림이라 펼치기·검색이 안 된다. 287개 파일을 한 그림에 담으면 읽기 어렵다. |
| tplant | https://github.com/bafolts/tplant | TS → PlantUML 클래스 다이어그램. | 낮음. PlantUML/Graphviz 렌더러가 필요하고 정적이다. |

## 시각화 후보

| 도구 | URL | 하는 일 | 이 용도 적합도 |
|---|---|---|---|
| D3 Collapsible tree | https://observablehq.com/@d3/collapsible-tree | 노드를 눌러 펼치는 수평 트리. | 모양은 딱 맞다. 다만 형제 노드가 수백 개(멤버)일 때 세로로 길어지고, D3 번들을 내려받아 인라인해야 한다. |
| D3 icicle / sunburst | https://observablehq.com/@d3/zoomable-icicle | 크기 비례 계층(줄 수 비중 보기). | 보조용. 이름·멤버 표를 읽는 데는 약하다. |
| ECharts tree / treemap | https://echarts.apache.org/examples/en/editor.html?c=tree-basic | `collapsed` 속성으로 펼치기 지원. | 중간. 1MB급 번들, 상세 패널·검색은 직접 짜야 한다. |
| Cytoscape.js | https://js.cytoscape.org/ | 일반 그래프(네트워크) 렌더러. | 도메인 의존 그래프용으로는 좋지만 계층 펼치기는 확장이 필요. |
| Mermaid classDiagram | https://mermaid.js.org/syntax/classDiagram.html | 텍스트 → 클래스 다이어그램. | 파일 하나 단위 그림에는 좋지만 전체 탐색 UI가 아니다. |
| vis-network | https://visjs.github.io/vis-network/docs/network/ | 물리 기반 네트워크 그래프, 클러스터 접기. | 낮음. 계층을 차근차근 펼치는 모양과 다르다. |

## 결론

「기존 도구 그대로」로는 목적을 채우지 못한다. UML 생성기(tsuml2·tplant)는 정적 그림이라 펼치기·검색이 없고, dependency-cruiser·madge는 파일 의존만 보고 클래스·멤버를 다루지 않으며, TypeDoc은 export 위주라 private 표기·이름 규칙 통계를 따로 만들어야 한다.

그래서 **직접 만들기**로 간다.
- 추출: 저장소에 이미 있는 **TypeScript Compiler API**(`typescript@6.0.3`)를 `require`로 빌려 구문 트리만 읽는다(타입 검사기는 쓰지 않음 → 빠르고 설정 의존이 없다). import 경로는 `tsconfig`의 별칭(`@main/*`, `@shared/*`, `@renderer/*`, `@preload/*`)과 상대 경로를 직접 풀어 파일에 연결한다.
- 시각화: D3 Collapsible tree의 「노드를 눌러 한 단계씩 펼치는 수평 트리」 모양을 **의존성 없는 바닐라 JS + SVG**로 다시 구현한다. 펼친 노드만 행으로 그리는 방식이라 멤버가 많아도 세로 스크롤로 읽힌다. 외부 라이브러리·CDN이 없어 파일 하나로 오프라인에서 열린다.
- 도메인 의존은 행렬(히트맵 표)로 보여 준다. 프로세스마다 도메인이 10~12개라 행렬(프로세스별 탭)이 그래프보다 숫자 읽기에 낫다. 프로세스 사이 의존은 4×4 요약 행렬로 따로 보인다.
