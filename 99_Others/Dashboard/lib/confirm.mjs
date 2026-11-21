// 사람 확인 창 — 현황판 병합의 유일한 사람 증명이다. 페이지 토큰은 에이전트도 읽을 수 있으므로 증명이 아니다.
// 서버가 Windows PowerShell로 맨 위에 뜨는 WinForms 창을 띄우고, 사람이 「병합」을 눌렀을 때만 전용 출력 한 줄(CONFIRM_TOKEN)이 나온다.
// 그 밖의 모든 끝(비정상 종료·빈 출력·다른 출력·시간 초과로 죽임·띄우지 못함·Windows 아님)은 취소다. 동시에 한 창만 띄운다.
//
// 실수로 확인되지 않게: 가속키 없는 단추(UseMnemonic 끔, `&` 없음), 첫 초점은 「취소」, 뜬 뒤 1.5초는 두 단추를 잠근다(타자 중이던 Enter·Space·Y가 새지 않게),
// AcceptButton은 두지 않고 CancelButton은 「취소」라 창 닫기·Esc는 취소다.
// 키보드로는 확인되지 않는다: 잠금이 풀린 뒤 Tab·화살표로 「병합」에 간 다음 Enter·Space를 쳐도 Click만 일어난다.
// 「병합」은 Click이 아니라 마우스 왼쪽 MouseClick에만 반응하고 Tab 순서에서도 빠진다. 키보드 활성화·PerformClick은 MouseClick을 일으키지 않는다(2026-11-18 시험 폼 실측).
// 남이 정한 글(PR 제목·브랜치 이름·파일 이름)은 스크립트에 끼우지 않는다. 스크립트는 고정 글이고, 값은 환경변수(AD_MERGE_*)로만 넘긴다.
// 스크립트는 작은따옴표만 쓰는 한 줄이다 — execFile이 인자를 따옴표로 감쌀 때 큰따옴표 처리가 끼어들 틈이 없다.
//
// 실측(2026-11-18): execFile의 windowsHide:true로 띄운 PowerShell에서 폼은 ShowDialog 뒤에도 보이지 않았다(바깥에서 본 MainWindowHandle 0).
// 숨김 자식의 첫 ShowWindow가 STARTUPINFO의 SW_HIDE를 물려받기 때문으로 본다. 창이 뜬 직후(Shown) WindowState를 Minimized → Normal로 바꾸면 보였다.
// 한계(L3): 에이전트도 이 창을 화면 자동화로 누를 수 있고, 이 모듈이나 gh를 직접 부를 수도 있다. 막는 것은 실수와 무심한 자동 진행이다.
import { execFile } from 'node:child_process';

export const POWERSHELL = 'powershell.exe';
export const CONFIRM_TOKEN = 'AGENTDECK_MERGE_CONFIRMED';
export const CONFIRM_TIMEOUT_MS = 120000;
const LIST_MAX = 40, TEXT_MAX = 300, TITLE_MAX = 120;

export const CONFIRM_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '[System.Windows.Forms.Application]::EnableVisualStyles()',
  '$r=@{ yes=$false }',
  '$nl=[Environment]::NewLine',
  '$f=New-Object System.Windows.Forms.Form',
  "$f.Text='AgentDeck 병합 확인'",
  '$f.TopMost=$true',
  "$f.StartPosition='CenterScreen'",
  "$f.FormBorderStyle='FixedDialog'",
  '$f.MaximizeBox=$false',
  '$f.MinimizeBox=$false',
  "$f.Font=New-Object System.Drawing.Font('Malgun Gothic',10)",
  '$f.ClientSize=New-Object System.Drawing.Size(620,460)',
  '$h=New-Object System.Windows.Forms.Label',
  '$h.UseMnemonic=$false',
  '$h.AutoSize=$false',
  '$h.Location=New-Object System.Drawing.Point(16,12)',
  '$h.Size=New-Object System.Drawing.Size(588,48)',
  "$h.Text='현황판에서 아래 PR의 병합을 요청했어요. 내용이 맞으면 「병합」을 누르세요. 「취소」를 누르거나 창을 닫으면 병합하지 않아요.'",
  '$t=New-Object System.Windows.Forms.TextBox',
  '$t.Multiline=$true',
  '$t.ReadOnly=$true',
  "$t.ScrollBars='Vertical'",
  '$t.TabStop=$false',
  '$t.Location=New-Object System.Drawing.Point(16,64)',
  '$t.Size=New-Object System.Drawing.Size(588,332)',
  '$must=$env:AD_MERGE_MUSTSEE',
  "if ([string]::IsNullOrEmpty($must)) { $must='없음' }",
  "$t.Text=('저장소: ' + $env:AD_MERGE_REPO + $nl + 'PR #' + $env:AD_MERGE_NUMBER + $nl + 'base ← head: ' + $env:AD_MERGE_BASE + ' ← ' + $env:AD_MERGE_HEAD + $nl + '머리 SHA: ' + $env:AD_MERGE_SHA + $nl + $nl + '꼭 볼 것 파일:' + $nl + $must + $nl + $nl + '제목: ' + $env:AD_MERGE_TITLE)",
  '$ok=New-Object System.Windows.Forms.Button',
  "$ok.Text='병합'",
  '$ok.UseMnemonic=$false',
  '$ok.TabStop=$false',
  '$ok.Enabled=$false',
  '$ok.Location=New-Object System.Drawing.Point(404,410)',
  '$ok.Size=New-Object System.Drawing.Size(96,34)',
  '$no=New-Object System.Windows.Forms.Button',
  "$no.Text='취소'",
  '$no.UseMnemonic=$false',
  '$no.Enabled=$false',
  '$no.Location=New-Object System.Drawing.Point(508,410)',
  '$no.Size=New-Object System.Drawing.Size(96,34)',
  '$f.CancelButton=$no',
  "$ok.Add_MouseClick({ param($s,$e) if ($e.Button -eq 'Left') { $r.yes=$true; $f.Close() } })",
  '$no.Add_Click({ $f.Close() })',
  '$f.Controls.AddRange(@($h,$t,$ok,$no))',
  '$u=New-Object System.Windows.Forms.Timer',
  '$u.Interval=1500',
  '$u.Add_Tick({ $u.Stop(); $no.Enabled=$true; $ok.Enabled=$true; $f.ActiveControl=$no; [void]$no.Focus() })',
  '$c=New-Object System.Windows.Forms.Timer',
  '$c.Add_Tick({ $c.Stop(); $f.Close() })',
  '$ms=[long]$env:AD_MERGE_DEADLINE - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); if ($ms -lt 1) { $ms=1 }; $c.Interval=[int]$ms',
  "$f.Add_Shown({ $f.WindowState='Minimized'; $f.WindowState='Normal'; $f.Activate(); $u.Start(); $c.Start() })",
  '[void]$f.ShowDialog()',
  '$f.Dispose()',
  `if ($r.yes -eq $true) { [Console]::Out.WriteLine('${CONFIRM_TOKEN}') }`,
].join('; ');

export const confirmArgs = () => ['-NoProfile', '-NonInteractive', '-STA', '-Command', CONFIRM_SCRIPT];

// 창에 보일 글: 제어문자(줄바꿈 포함)와 글 방향 바꾸기 문자는 빈칸으로 바꾸고, 빈칸 연속은 하나로 접고, 길면 자른다. 환경변수에는 NUL이 들어갈 수 없다.
// 빈칸을 접는 것은 긴 빈칸으로 줄을 밀어 창의 다른 줄(머리 SHA·꼭 볼 것)을 흉내 내지 못하게 하려는 것이다. 제목은 120자까지, 창의 맨 끝 줄이다.
// 0x2000 위의 글자는 코드 포인트로 만든다. 원문에 보이지 않는 글자를 두지 않는다(server.mjs scriptJSON과 같은 규칙).
const cp = n => String.fromCharCode(n);
const CONTROL = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${cp(0x2028)}${cp(0x2029)}${cp(0x200e)}${cp(0x200f)}${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}]`, 'g');
export function cleanText(value, max = TEXT_MAX) {
  const chars = Array.from(String(value ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim());
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}
// 자식에게 넘길 환경. 물려받은 AD_MERGE_* 값은 버리고 이 모듈이 정한 키만 싣는다.
// deadline은 창이 스스로 닫힐 시각(epoch ms)이다. 뜬 시점이 아니라 띄운 시점 기준이라 PowerShell 기동이 늦어도 죽이기보다 먼저 닫힌다.
export function confirmEnv(info, deadline, base = process.env) {
  const env = Object.fromEntries(Object.entries(base).filter(([k]) => !/^AD_MERGE_/i.test(k)));
  const names = (Array.isArray(info.mustSee) ? info.mustSee : []).map(n => cleanText(n)).filter(Boolean);
  const listed = names.length > LIST_MAX ? [...names.slice(0, LIST_MAX), `외 ${names.length - LIST_MAX}개`] : names;
  return Object.assign(env, {
    AD_MERGE_REPO: cleanText(info.repo), AD_MERGE_NUMBER: String(info.number), AD_MERGE_TITLE: cleanText(info.title, TITLE_MAX),
    AD_MERGE_BASE: cleanText(info.baseRef), AD_MERGE_HEAD: cleanText(info.headRef), AD_MERGE_SHA: String(info.sha),
    AD_MERGE_MUSTSEE: listed.join('\r\n'), AD_MERGE_DEADLINE: String(deadline),
  });
}

const no = reason => ({ answer: 'no', reason });
// 확인 함수를 만든다. 결과는 { answer: 'yes' } 또는 { answer: 'no', reason }이다. 병합 모듈은 answer가 정확히 'yes'일 때만 보낸다.
export function createConfirm({ execFileFn = execFile, platform = process.platform, timeoutMs = CONFIRM_TIMEOUT_MS, now = () => Date.now() } = {}) {
  let open = false;
  return async function confirm(info) {
    if (platform !== 'win32') return no('확인 창은 Windows에서만 띄울 수 있어요');
    if (!info || typeof info !== 'object' || !Number.isInteger(info.number) || info.number <= 0 || typeof info.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(info.sha)) return no('확인 창에 보일 PR 정보가 올바르지 않아요');
    if (open) return no('이미 확인 창이 떠 있어요. 그 창을 먼저 닫아 주세요');
    open = true;
    try {
      // 창은 죽이기 전에 스스로 닫힌다(죽이기가 실패해도 남지 않게). 마감은 띄우는 지금 기준이라 기동이 늦어도 지켜진다. 둘 다 취소다.
      const env = confirmEnv(info, now() + Math.max(1000, timeoutMs - 2000));
      return await new Promise(resolve => {
        try {
          execFileFn(POWERSHELL, confirmArgs(), { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: false, env, maxBuffer: 64 * 1024 }, (error, stdout) => {
            if (error) {
              if (error.killed || error.signal) return resolve(no('시간 안에 고르지 않아 창을 닫았어요'));
              if (error.code === 'ENOENT') return resolve(no('확인 창을 띄우지 못했어요(PowerShell을 찾지 못함)'));
              return resolve(no('확인 창이 비정상으로 끝났어요'));
            }
            resolve(String(stdout ?? '').trim() === CONFIRM_TOKEN ? { answer: 'yes' } : no('확인 창에서 병합을 누르지 않았어요'));
          });
        } catch { resolve(no('확인 창을 띄우지 못했어요')); }
      });
    } finally { open = false; }
  };
}
