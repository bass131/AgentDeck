import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function loadConfig(file = path.join(ROOT, 'config.local.json')) {
  let raw;
  try { raw = await readFile(file, 'utf8'); }
  catch (error) {
    throw new Error(error.code === 'ENOENT'
      ? `${file} 파일이 없어요. config.example.json을 복사해 만들어 주세요.`
      : `설정 파일을 읽지 못했어요 (${error.code || '읽기 오류'}).`);
  }
  let config;
  try { config = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw); } catch { throw new Error('설정 파일의 JSON 형식을 읽지 못했어요.'); }
  if (typeof config.repoPath !== 'string' || !path.isAbsolute(config.repoPath)) throw new Error('repoPath에 AgentDeck 저장소의 절대경로를 적어 주세요.');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('port는 1~65535 사이 정수여야 해요.');
  return { repoPath: path.resolve(config.repoPath), port: config.port };
}

// 로그와 PID 기록은 저장소 밖 실행 폴더에만 둔다. 저장소 안이면 실행하지 않는다.
export function runtimeDirectory(repoPath) {
  if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA 환경변수가 없어 실행 파일 위치를 정하지 못했어요.');
  const directory = path.resolve(process.env.LOCALAPPDATA, 'AgentDeckDashboard');
  const relative = path.relative(path.resolve(repoPath), directory);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('로그 파일 경로가 저장소 안에 있어 실행을 중단했어요.');
  }
  return directory;
}
