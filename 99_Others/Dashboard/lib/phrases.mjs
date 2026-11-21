// 사람 문장 판독과 고정 사전. 문장을 지어내지 않는다 — 원문 파일의 문장을 그대로 읽거나, 아래 사전에 적힌 문장만 쓴다.
import { SECTION_RE, lines, splitSentences } from './markdown.mjs';

export const VOICE_FILE = '00_현황판-문장.md';
const VOICE_KEYS = { '한 줄': 'line', '목표': 'goal', '끝나면': 'after', '이름': 'name', '진행 중': 'doing', '완료': 'done', '시작 전 필요': 'need' };

// 「00_현황판-문장.md」: 절 제목(「## 마일스톤」, 「## Phase N」)이 대상이고 「- 이름: 문장」 줄이 값이다.
// 사전에 없는 이름의 줄과 다른 절은 읽지 않는다. 같은 이름이 두 번 나오면 첫 줄만 쓴다.
export function parseVoice(text) {
  const out = { milestone: null, phases: {} };
  let cur = null;
  lines(text).forEach((raw, i) => {
    if (SECTION_RE.test(raw)) {
      const title = raw.replace(SECTION_RE, '').trim(), m = /^Phase\s+(\d+)\s*$/.exec(title);
      if (title === '마일스톤') cur = out.milestone ||= { sectionLine: i + 1 };
      else if (m) cur = out.phases[Number(m[1])] ||= { sectionLine: i + 1 };
      else cur = null;
      return;
    }
    if (!cur) return;
    const m = /^-\s+([^:：]{1,20}?)\s*[:：]\s*(.+?)\s*$/.exec(raw);
    const key = m && VOICE_KEYS[m[1].trim()];
    if (key && !cur[key]) cur[key] = { text: m[2], line: i + 1 };
  });
  return out;
}

// 계획 문서의 「## 사람용 개요」 절 첫 문단을 문장으로 나눈다. 절이 없으면 null이다.
export function parseOverview(text) {
  const all = lines(text), s = all.findIndex(l => /^##\s+사람용 개요\s*$/.test(l));
  if (s < 0) return null;
  const para = [];
  let first = null;
  for (let i = s + 1; i < all.length && !SECTION_RE.test(all[i]); i++) {
    if (!all[i].trim()) { if (para.length) break; continue; }
    if (first == null) first = i + 1;
    para.push(all[i].trim());
  }
  return para.length ? { line: first, sentences: para.flatMap(splitSentences) } : null;
}

// 훅 판정의 고정 사전. 열쇠는 「훅|판정|규칙」이고, 없으면 「훅|판정」으로 한 번 더 찾는다. 둘 다 없으면 문장이 없다(화면은 원문을 그대로 보인다).
// 값은 [문장, 단계]다. 단계: ok(통과) · note(알림·확인 필요) · block(막음) · quiet(기록만).
export const HOOK_NAMES = Object.freeze({
  'cmd-guard': '위험 명령 검사', 'role-gate': '역할 구분 검사', 'line-limit': '문서 길이 검사', 'pass-watcher': '검증 기록 감시',
  'plan-gate': '계획 검사', 'edit-plan-gate': '수정 전 계획 검사', 'start-brief': '세션 시작 안내', 'stop-gate': '마감 검사', 'surface-probe': '말투 검사', 'tdd-guard': '테스트 동반 검사',
});
export const HOOK_PHRASES = Object.freeze({
  'cmd-guard|allow': ['위험 명령 검사가 명령을 통과시켰습니다.', 'ok'],
  'cmd-guard|ask': ['위험 명령 검사가 사용자 승인을 물었습니다.', 'note'],
  'cmd-guard|ask|git-push': ['원격 저장소에 올리는 명령이라 사용자 승인을 물었습니다.', 'note'],
  'cmd-guard|deny': ['위험 명령 검사가 명령을 막았습니다.', 'block'],
  'cmd-guard|deny|git-push': ['원격 저장소에 올리는 명령을 막았습니다.', 'block'],
  'cmd-guard|deny|rm-재귀': ['폴더째 지우는 명령을 막았습니다.', 'block'],
  'cmd-guard|deny|rm-재귀·강제': ['폴더째 강제로 지우는 명령을 막았습니다.', 'block'],
  'line-limit|통과': ['문서 길이 검사를 통과했습니다.', 'ok'],
  'line-limit|발화': ['문서가 줄 수 상한을 넘었다고 알렸습니다.', 'note'],
  'pass-watcher|무장전': ['검증 기록에 새 통과 줄이 없어 마감 검사를 켜지 않았습니다.', 'quiet'],
  'pass-watcher|장전': ['검증 기록에 통과 줄이 늘어 마감 검사를 켰습니다.', 'quiet'],
  'pass-watcher|증인': ['작업 좌표 문서의 갱신을 이 세션의 것으로 기록했습니다.', 'quiet'],
  'plan-gate|allow': ['계획 검사가 워커 띄우기를 허용했습니다.', 'ok'],
  'plan-gate|deny': ['계획 검사가 워커 띄우기를 막았습니다.', 'block'],
  'edit-plan-gate|allow': ['수정 전 계획 검사가 파일 수정을 허용했습니다.', 'ok'],
  'edit-plan-gate|allow|저장소-밖': ['저장소 밖 파일이라 수정 전 계획 검사가 관여하지 않았습니다.', 'ok'],
  'edit-plan-gate|allow|계획-표면': ['계획 문서를 고치는 것이라 계획 상태와 상관없이 허용했습니다.', 'ok'],
  'edit-plan-gate|allow|훅-내부오류': ['수정 전 계획 검사가 오류가 나서 검사 없이 통과시켰습니다.', 'note'],
  'edit-plan-gate|deny': ['계획이 유효하지 않아 파일 수정을 막았습니다.', 'block'],
  'role-gate|allow': ['역할 구분 검사가 파일 수정을 허용했습니다.', 'ok'],
  'role-gate|allow|경계-밖': ['저장소 밖 파일이라 역할 구분 검사가 관여하지 않았습니다.', 'ok'],
  'role-gate|allow|워커-허용': ['워커의 파일 수정을 허용했습니다.', 'ok'],
  'role-gate|allow|허용-표면': ['메인 세션의 계획 문서 수정을 허용했습니다.', 'ok'],
  'role-gate|deny': ['역할 구분 검사가 파일 수정을 막았습니다.', 'block'],
  'role-gate|deny|분업-1-구현-차단': ['메인 세션이 계획 문서 밖의 파일을 고치려 해서 막았습니다.', 'block'],
  'start-brief|allow': ['세션이 시작되어 인수인계 문서를 불러왔습니다.', 'quiet'],
  'stop-gate|allow': ['마감 요약이 갱신되어 세션 종료를 허용했습니다.', 'ok'],
  'stop-gate|block': ['마감 요약을 새로 쓰지 않아 세션 종료를 막았습니다.', 'block'],
  'surface-probe|통과': ['말투 검사를 통과했습니다.', 'ok'],
  'surface-probe|발화': ['말투 검사가 고칠 문장이 있다고 알렸습니다.', 'note'],
  'surface-probe|판정불가': ['검사할 답변 글이 없어 말투 검사를 건너뛰었습니다.', 'quiet'],
  'tdd-guard|green-기록': ['테스트 전체 통과를 확인해 증거로 기록했습니다.', 'ok'],
  'tdd-guard|리셋': ['테스트 파일을 고쳐서, 테스트 없이 고친 횟수를 0으로 되돌렸습니다.', 'quiet'],
  'tdd-guard|무기록': ['테스트 통과를 확인하지 못해 증거로 기록하지 않았습니다.', 'note'],
  'tdd-guard|무기록|vitest-red': ['테스트가 실패해서 통과 증거로 기록하지 않았습니다.', 'note'],
  'tdd-guard|무기록|판정-불능': ['테스트 결과를 읽지 못해 통과 증거로 기록하지 않았습니다.', 'note'],
  'tdd-guard|통과': ['테스트 없이 고친 횟수가 아직 한도 아래입니다.', 'ok'],
  'tdd-guard|allow': ['테스트 동반 검사가 수정을 허용했습니다.', 'ok'],
  'tdd-guard|allow|비대상-태그': ['테스트 통과 증거가 필요 없는 단계라서 기록 추가를 허용했습니다.', 'ok'],
  'tdd-guard|allow|치유-경로-테스트': ['테스트 파일을 고치는 것이라 허용했습니다.', 'ok'],
  'tdd-guard|deny': ['테스트 없이 소스를 연달아 고치려 해서 막았습니다.', 'block'],
  'tdd-guard|오류': ['테스트 동반 검사가 오류로 멈췄습니다.', 'note'],
});

export function hookPhrase({ hook, verdict, rule }) {
  const hit = (rule != null && HOOK_PHRASES[`${hook}|${verdict}|${rule}`]) || HOOK_PHRASES[`${hook}|${verdict}`] || null;
  return { say: hit ? hit[0] : null, level: hit ? hit[1] : null, hookName: HOOK_NAMES[hook] || null };
}
