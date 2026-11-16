// 사례 저장소·서비스·사람 이름 금지어는 공개 저장소에 커밋하지 않는다.
// 저장소 밖 로컬 목록(줄마다 정규식)이 있을 때만 읽고, 없으면 null — 그때는 일반 형식 검사만 한다.
// 위치: 환경변수 PACE_PRIVATE_DIR 또는 ~/.pace-private 아래 P001-banned.txt
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';

export function privateBanned(){
  const file=join(process.env.PACE_PRIVATE_DIR||join(homedir(),'.pace-private'),'P001-banned.txt');
  if(!existsSync(file))return null;
  const lines=readFileSync(file,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  return lines.length?new RegExp(lines.join('|'),'i'):null;
}
