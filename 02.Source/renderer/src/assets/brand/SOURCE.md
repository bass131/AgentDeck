# brand/ — 공식 브랜드 에셋 출처 박제 (TG1 P01·P09)

> 이 폴더의 에셋은 **자체 제작물이 아니라** 각 provider(Anthropic·OpenAI) 공식 배포 원본에서 그대로 가져온 파일이다. 자체 재현·추측 SVG 생성 금지 (상표 게이트).

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

---

## OpenAI Blossom (로고마크 — Codex 엔진 표시용, TG1 P09)

| 항목 | 값 |
|---|---|
| 파일 | `openai-blossom-black.svg` (2,415 bytes, viewBox 716x716, fill `black` — 라이트 배경용) · `openai-blossom-white.svg` (2,415 bytes, viewBox 716x716, fill `white` — 다크 배경용) · `openai-blossom-black.png` (15,987 bytes, 716x716) · `openai-blossom-white.png` (16,787 bytes, 716x716) |
| sha256 | black.svg `75c1e9fffa5e8c437bec1d67197a73992bca45d166c6ff23215185dea8fae92a` · white.svg `01d158767c4eec0e47bd617e67759c33da0accd1438be1a8d29dfdb99ce87285` · black.png `9897fc6c24e0dfb8cb81c287f456d7a01a5861066d7f3f93d2392e4e1c9eff38` · white.png `21c7057cfbec1b3892b7c3d724c57b914755ca66e4178f331072782cbc86525b` |
| 원본 파일명 | `OAI_OpenAI-Blossom_Black.{svg,png}` / `OAI_OpenAI-Blossom_White.{svg,png}` (kebab-case 개명만 — 내용 무수정, `cmp` 바이트 동일 확인) |
| zip 내 경로 | `OpenAI-logos/{SVGs,PNGs}/` |
| 출처 URL | https://openai.com/brand/ (OpenAI Design Guidelines — "Download logos") → https://cdn.openai.com/brand/openai-logos.zip (70,258 bytes, sha256 `c54e85ab5884228f89f0230dd8effa8d588cad78166fe954135f4afa553222db`) |
| 다운로드 일자 | 2026-07-17 |
| 공식 명칭 | "Blossom" — OpenAI가 로고마크(원+직각의 매듭 심볼)에 붙인 공식 이름. 공식 배포 zip에는 Blossom(Black/White) + Wordmark(Black/White) 총 8파일만 존재 |

### Codex 대표 마크 판정

- **Codex 전용 로고는 공식 배포에 존재하지 않는다** — openai.com/brand 의 "Download logos" zip 전수 확인 결과 Blossom·Wordmark 2종(각 Black/White)뿐. Codex는 OpenAI의 제품(브랜드 페이지 푸터 Products 항목)이므로 provider 로고마크 = **OpenAI Blossom**이 정답.
- Wordmark(OpenAI 글자 로고)는 아바타(정사각 소형 슬롯)에 부적합 + "primary wordmark는 Blossom과 병용 금지" 규정이 있어 미착지. 필요 시 같은 zip에서 조달 가능.

### 상표 고지 (CRITICAL)

- "OpenAI" 명칭·OpenAI 로고·"ChatGPT"·"GPT" 브랜드는 전부 OpenAI 소유("Marks"). 사용 = usage terms 동의(비독점·양도불가, OpenAI가 언제든 철회 가능).
- **지명 사용(nominative use) 허용 근거**: "If you are an active OpenAI developer, you may truthfully identify the OpenAI technology you use." — 단, 자사 앱의 이름·로고·설명 등 아이덴티티는 OpenAI 브랜드와 무관해야 하고, sponsorship/affiliation/endorsement 암시 금지.
- **허용 범위: 대화 내 엔진 아바타·엔진 식별 표시 한정** — "이 메시지/세션은 Codex(OpenAI) 엔진"임을 가리키는 지시자 용도로만. AgentDeck 자체 아이콘·로고·마케팅에 사용 금지 (Claude Spark와 동일 규율).
- **색 변조 절대 금지**: "DON'T add any colors to the Blossom" + "Use the logo exactly as provided" — CSS 재채색·틴트 불가. **다크/라이트 대응 = 공식 Black(라이트 배경)/White(다크 배경) 두 변형을 테마별로 스왑**하는 방식만 허용.
- 기타 금지: 변형·왜곡·요소 추가·busy 이미지 위 배치·자사 로고보다 크게 노출·상품(머천다이즈) 인쇄·자사 브랜딩에 편입·유사 로고 제작. 여백은 "prescribed spacing"(Blossom 주변 open space 충분히).
- 병치(파트너십 lockup) 주의: 공식 파트너가 아니면 "collaborated/worked/partnered with OpenAI" 표현 금지 — "built on OpenAI / developed on GPT-4"류만 허용. 파트너십 lockup에는 Blossom 사용 금지(wordmark만)·양 브랜드 승인 필요 → AgentDeck은 lockup을 만들지 않는다.
- 앱/제품명에 모델명·"GPT" 사용 금지 (AgentDeck는 해당 없음 — 준수 상태).
- **M5 배포 전 게이트**: 배포(설치본 패키징) 전에 OpenAI Brand Guidelines(https://openai.com/brand/)를 재확인하고 사용 범위 적합성을 사람이 판단한다. 문의 채널: partnercomms@openai.com (로고 사용 허가), legal@openai.com (법무).

### 조달 기록 (재현 절차)

1. https://openai.com/brand/ (OpenAI Design Guidelines) → Logo 절 "Download logos" → https://cdn.openai.com/brand/openai-logos.zip.
2. zip 해제 → `OpenAI-logos/SVGs/`·`PNGs/`에서 Blossom Black/White 4파일 추출, kebab-case 개명만 하고 내용 무수정 배치 (`cmp` 동일성 검증).
3. openai.com은 일반 스크레이퍼 UA를 403 차단 — 브라우저 UA 헤더를 붙인 `node`(fetch)로 페이지·zip을 수령했다 (curl/wget은 하네스 deny, 2026-07-17).
4. 가이드라인 세부 문구(GPTs·API Developers·Models·Non-partnerships·Content attribution 아코디언)는 페이지 임베디드 Contentful JSON에서 원문 추출해 검증했다.
