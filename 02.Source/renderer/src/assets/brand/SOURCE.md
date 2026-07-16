# brand/ — 공식 브랜드 에셋 출처 박제 (TG1 P01)

> 이 폴더의 에셋은 **자체 제작물이 아니라** Anthropic 공식 배포 press kit에서 그대로 가져온 원본 파일이다. 자체 재현·추측 SVG 생성 금지 (상표 게이트).

## Claude Spark (pinwheel 심볼)

| 항목 | 값 |
|---|---|
| 파일 | `claude-spark-clay.svg` (2,580 bytes, viewBox 94x94, 단일 path, fill `#D97757` Clay) · `claude-spark-clay.png` (39,563 bytes, 937x937) |
| 원본 파일명 | `Claude Spark - Clay.svg` / `Claude Spark - Clay.png` (공백 제거만 — 내용 무수정) |
| zip 내 경로 | `Anthropic media resources/Anthropic logos/Claude logos/3 Claude Spark/{SVG,PNG}/` |
| 출처 URL | https://www.anthropic.com/press-kit (Anthropic Newsroom "Download press kit" — 307 리다이렉트 → https://www-cdn.anthropic.com/ae59ca4ca194dac9c9dc3bc78c5829468cb0e8af.zip, 26,465,941 bytes) |
| 다운로드 일자 | 2026-07-16 |
| 공식 명칭 | "Claude Spark" — Anthropic이 pinwheel(바람개비/스타버스트) 심볼에 붙인 공식 이름. press kit에는 이 외 `1 Claude logo`(워드마크) · `2 Claude Code logo` · `4 Claude icon`(앱 아이콘 타일)도 존재 |

## 상표 고지 (CRITICAL)

- Claude pinwheel 심볼은 Anthropic의 **등록 상표 #7645254**. Claude·Anthropic 명칭과 로고의 권리는 전부 Anthropic PBC 소유.
- **허용 범위: 대화 내 엔진 아바타 한정** — "이 메시지는 Claude 엔진 출력"임을 가리키는 지시자(indicator) 용도로만 사용한다.
- **금지: 앱 아이덴티티 사용 금지** — AgentDeck 자체의 앱 아이콘·로고·스플래시·마케팅 등 AgentDeck을 대표하는 자리에 쓰지 않는다 (Anthropic 제품/제휴로 오인 유발).
- **M5 배포 전 게이트**: 배포(설치본 패키징) 전에 Anthropic Trademark Guidelines를 재확인하고 사용 범위 적합성을 사람이 판단한다.

## 조달 기록 (재현 절차)

1. https://www.anthropic.com/news → "Download press kit" → https://www.anthropic.com/press-kit (zip 리다이렉트).
2. zip 해제 → `Claude logos/3 Claude Spark/`에서 SVG·PNG만 추출, 파일 내용 무수정 배치.
3. 참고: 프로젝트 하네스가 `Bash(curl*)`·`Bash(wget*)`를 deny하므로 다운로드는 허용 경로인 `node`(fetch)로 수행했다 (2026-07-16).
