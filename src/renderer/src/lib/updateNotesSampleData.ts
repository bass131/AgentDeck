/**
 * updateNotesSampleData.ts — UpdateNotes 정적 샘플 (F12-02).
 *
 * window.api 호출 0. 순수 데이터.
 * 원본 AgentCodeGUI UpdateNotes.tsx RELEASES['1.1']을 적응.
 */

export interface UnItem {
  /** 01, 02, … */
  n: string
  /** 태그 (모노, 소문자) */
  tag: string
  /** 항목 제목 */
  lead: string
  /** 항목 설명 */
  desc: string
}

export const UN_ITEMS: UnItem[] = [
  {
    n: '01',
    tag: '코드 에디터',
    lead: '읽고, 이제 고칩니다',
    desc: '코드 뷰어에 CodeMirror 편집기가 들어왔어요. 읽기 모드에선 부모 커밋과의 표준 diff(추가는 초록 행·삭제는 빨간 고스트 줄)를, 편집 모드에선 군더더기 없는 에디터를 — 헤더 토글로 오가며 제자리에서 고치고, 검색 바로 파일 안을 바로 훑어요.',
  },
  {
    n: '02',
    tag: '심볼 분석',
    lead: '다시 켜도, 거의 즉시',
    desc: '시맨틱 토큰을 프로젝트별로 디스크에 캐시하고 LSP 서버를 미리 데워 둬서, 앱을 다시 열어도 분석이 곧장 떠요. 파일별 진행 칩으로 어디까지 분석됐는지 한눈에.',
  },
  {
    n: '03',
    tag: 'C# · Roslyn',
    lead: '정의도, 호버도 더 정확히',
    desc: 'C# 분석 엔진을 Microsoft Roslyn LSP로 교체했어요(.NET 10). 프로젝트 초기화가 끝날 때까지 기다렸다 칠해 호버가 들쭉날쭉하지 않고, 정의 이동·타입 정보가 한결 정확해졌습니다.',
  },
  {
    n: '04',
    tag: '창 · 입력',
    lead: '작은 마찰까지',
    desc: '최대화 버튼에서 펼쳐지는 커스텀 창 스냅(반·1/4 배치), 반응형 컴포저, 다듬은 검색 바, 질문 모달 위치 정리까지 — 손에 닿는 자리들을 매만졌어요.',
  },
]

export const UN_KEYWORDS: string[] = [
  '코드 에디터',
  '심볼 분석',
  'C# · Roslyn',
  '창 · 입력',
]
