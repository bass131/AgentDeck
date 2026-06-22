/**
 * whatsNewSampleData.ts — WhatsNew 6-슬라이드 정적 샘플 (F12-02).
 *
 * window.api 호출 0. 순수 데이터.
 * 원본 AgentCodeGUI WhatsNew.tsx SLIDES를 번역/적응.
 */

export interface WnSlide {
  /** 하단 칩 레이블 */
  chip: string
  /** 제목 아래 필기체 액센트 (영문) */
  accent: string
  /** 상단 아이브로 추가 텍스트 (선택) */
  eyebrow?: string
  /** 메인 제목 (줄바꿈 포함 가능 — \n 구분) */
  title: string
  /** 제목의 뮤트 부분 (em 태그로 렌더) */
  titleMuted?: string
  /** 본문 설명 */
  desc: string
}

export const WN_SLIDES: WnSlide[] = [
  {
    chip: '개요',
    accent: 'the launch',
    title: '코딩 에이전트가,',
    titleMuted: '데스크탑이 됩니다.',
    desc: 'AgentDeck은 이 PC의 Claude Code를 풀 에이전트 모드로 구동하는 데스크탑 IDE예요. 별도 API 키 없이 기존 로그인 그대로 — 자체 탐색기·코드 인텔리전스·Git·멀티 에이전트까지, 1.0의 모든 것을 한 장씩 넘겨보세요.',
  },
  {
    chip: '코드 인텔리전스',
    accent: 'read the code',
    title: '다른 에디터 없이도,',
    titleMuted: '읽고, 고칩니다.',
    desc: '내장 파일 탐색기와 LSP 코드 뷰어 — 심볼 탐색, Ctrl+F, F12로 정의 이동, 구조화된 호버 카드. 읽기·편집 모드를 오가며 부모 커밋과의 표준 diff를 보고 제자리에서 고치고, 분석은 디스크 캐시로 다시 켜도 거의 즉시 떠요.',
  },
  {
    chip: '⎇ Git',
    accent: 'git, in a card',
    title: '브랜치의 흐름이,',
    titleMuted: '한 장의 카드로.',
    desc: '탐색기 ⎇ 버튼 하나로 커밋 히스토리·변경 사항·브랜치/태그가 한 카드에. 변경을 읽어 Claude가 커밋 메시지를 짓고 푸시·당겨오기까지, 삭제된 줄은 diff에 빨간 고스트 줄로 그대로 남아요.',
  },
  {
    chip: '멀티 에이전트',
    accent: 'in parallel',
    title: '여럿이 한 번에,',
    titleMuted: '동시에 일합니다.',
    desc: 'N개의 패널이 각자 폴더·프롬프트·모델로 동시에 작업해요. 실행 중에도 다음 메시지를 예약해 두면 끝나는 대로 순차 전송, 세션 단위 작업 목록으로 전체 진행이 한눈에 들어옵니다.',
  },
  {
    chip: '대화',
    accent: 'every keystroke',
    title: '입력 한 줄까지,',
    titleMuted: '매끄럽게.',
    desc: '이미지는 붙여넣기·드래그로 첨부, / 명령어·스킬과 @ 파일 멘션, ↑/↓로 보낸 메시지 복구, 드래그하면 뜨는 복사·"더 자세히" 툴바, 채팅별 프롬프트까지 — 단일과 멀티 어디서나 똑같이.',
  },
  {
    chip: '그리고',
    accent: 'ready',
    title: '엔진까지,',
    titleMuted: '앱 안에서.',
    desc: 'Claude Code 엔진을 인앱에서 설치·전환하고, 라이트·다크 테마, 최대화 버튼의 창 스냅 배치, 자동 업데이트까지. 자, 이제 시작할 시간이에요.',
  },
]
