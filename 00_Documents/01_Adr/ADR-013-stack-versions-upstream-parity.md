### ADR-013: 스택 버전 — 원본 AgentCodeGUI와 동일 업그레이드 ⭐
**결정**: **React 19 · Electron 42 · Vite 7 · electron-vite 5 · TypeScript 6** + @vitejs/plugin-react 5 · vitest 3 · @testing-library/react 16 · @types/react 19 · @types/node 24. (이전 암묵 React18/Electron31/Vite5/TS5 → 상향.)
**이유**: Track 1 = **완전 복제**. 런타임/빌드가 원본과 동일해야 동작·배포·미래기능(LSP·Agent SDK) 정합. 원본의 *동작하는* electron.vite/tsconfig를 미러링해 마이그레이션 위험을 줄임.
**트레이드오프**: Electron 11개 메이저 등 대규모 업그레이드 → React19 JSX 네임스페이스(`JSX.Element`→`React.JSX`)·testing-library 16·better-sqlite3 ABI 재빌드 등 breaking 대응 필요. **사용자 승인(2026-06-22)**. ADR-001/002의 "Electron+React+TS" 결정은 불변, 버전만 고정.
**Note(분류 — 혼동 방지)**: 본 ADR의 *'원본 일치'* 대상 = React·Electron·Vite·electron-vite·TS·CodeMirror·react-markdown·remark-gfm·highlight.js. **vitest·@testing-library·@vitejs/plugin-react·typescript-eslint·Zustand(ADR-005)·better-sqlite3(ADR-006)·rehype-highlight는 원본 미존재 = AgentDeck 확장**(원본은 테스트 프레임워크 없음·영속화 JSON 파일·상태 라이브러리 미사용·마크다운 하이라이팅은 highlight.js 직접 호출). 배포 스택(electron-builder/electron-updater)은 원본과 동일하나 **현재 미설치(M5 예정)**.

---

### 개정 1 (2026-07-26, NC 마일스톤 유지보수 창 1 — 영호 정정): AgentCodeGUI 위상 재분류 — "원본" → **참고용 소프트웨어 프로젝트**

**정정**: AgentCodeGUI 를 **원본(upstream)** 이 아니라 **참고용 소프트웨어 프로젝트**로 재분류한다. 영호 지시 원문: *"이제 AgentCodeGUI는 원본이 아니라 '참고용 소프트웨어 프로젝트'로 정정, **무조건 Copy는 X**."*

**무엇이 바뀌는가 — 근거의 방향이다**. 지금까지는 *"원본이 그러니까 우리도 그렇다"* 가 그 자체로 논거였다. 이제는 그렇지 않다. 참고 프로젝트의 선택은 **하나의 데이터포인트**이며, 채택하려면 **AgentDeck 자체의 근거**(우리 코드베이스의 다수파, 우리 제약, 우리 트레이드오프)가 따로 서야 한다.

**무엇이 바뀌지 않는가**: 위 **버전 결정 자체는 불변**이다(React 19 · Electron 42 · Vite 7 · electron-vite 5 · TypeScript 6). 근거만 재서술된다 — *"원본과 같아야 해서"* 가 아니라 *"검증된 조합이고, 이미 그 위에 구현이 쌓여 있어 되돌리는 비용이 이득을 넘어서기 때문"* 이다. 결론이 같고 이유가 바뀌었을 뿐이므로 코드 변경은 0건이다.

**「원본 일치 vs AgentDeck 확장」 이분법의 재서술**: 이 분류는 원래 *변경 재량의 크기*(전자를 바꾸면 벤치마킹 기준선이 흔들린다)를 뜻했다. 위상이 바뀌었으니 그 의미는 성립하지 않는다. 이제 이 분류가 뜻하는 것은 **참고 대조가 가능한가**뿐이다 — "원본 일치" 부류는 막혔을 때 **가서 볼 수 있는 참고 구현이 있고**, "AgentDeck 확장" 부류는 **참고할 곳이 없어 우리가 스스로 결정해야 한다**. 재량은 양쪽 다 우리에게 있다.

**⚠️ 이 개정의 범위는 재분류 한 가지다.** 파생 결정 — 참고 프로젝트를 **언제 따라 올릴 것인가**(업그레이드 정책), ADR-014 의 충실도 레퍼런스 클론(`C:/Dev/AgentCodeGUI`)이 앞으로 갖는 위상 — 은 **이번에 설계하지 않는다**. 명명 마일스톤에서 스택 정책을 함께 정하면 두 결정 다 검토가 얕아진다. 필요해지는 시점에 별도 ADR로 다룬다.

**파급**: `CLAUDE.md` 「기술 스택」 절의 이분법 서술 재작성. ADR-039 는 `.ts` camelCase 근거를 **저장소 다수파 + import 노출** 두 축에 두고 참고 프로젝트의 kebab 0건을 **각주로 강등**했다 — 본 개정이 나중에 또 바뀌어도 ADR-039 가 흔들리지 않도록 미리 그렇게 설계했다.

**위험도**: [M] — 결정의 *근거 층* 변경(코드 변경 0건, 그러나 이후 모든 스택 판단의 논거가 달라진다).

**관련**: ADR-014(충실도 레퍼런스 — 위상은 이번에 다루지 않음) · ADR-039(명명 규범 — 참고 프로젝트 의존을 미리 끊어둠) · `CLAUDE.md` 「기술 스택」.

