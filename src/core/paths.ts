import { homedir } from "node:os";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Win32/Git은 끝 공백·마침표를 제거해 다른 형제 폴더로 갈 수 있다. 실제 경로까지 검사한다. */
export function assertSafeGitPath(input: string, allowMissing = false): void {
  if (process.platform !== "win32") return;
  const inspect = (value: string) => {
    const path = resolve(value), root = parse(path).root;
    const parts = path.slice(root.length).split(sep).filter(Boolean);
    for (const part of parts) {
      if (/[ .]$/.test(part)) throw new Error("끝 공백 또는 마침표 경로는 윈도우에서 다른 폴더로 해석될 수 있다");
    }
  };
  inspect(input);
  // Win32는 확장 경로를 cwd로 넘길 때 끝 공백·마침표를 없앤 이름으로 자식을 시작할 수 있다.
  // 입력 경로의 형제를 정션 너머까지 확인하고 실제 대상도 아래에서 검사한다.
  if (resolve(input).startsWith('\\\\?\\')) {
    const path = resolve(input), root = parse(path).root;
    const parts = path.slice(root.length).split(sep).filter(Boolean);
    let parent = root;
    for (const part of parts) {
      let entries: string[];
      try { entries = readdirSync(parent); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" && allowMissing) break; throw error; }
      if (entries.some((entry) => /[ .]$/.test(entry) && entry.replace(/[ .]+$/, "").toLowerCase() === part.toLowerCase())) {
        throw new Error("같은 폴더로 보이는 형제 경로가 충돌한다. 형제 이름을 변경하거나 확장 접두어 없는 일반 경로에서 실행한다");
      }
      parent = join(parent, part);
    }
  }
  if (allowMissing) {
    try { lstatSync(input); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  }
  // 정션의 이름이 안전해도 대상은 끝 공백·마침표일 수 있다.
  inspect(realpathSync.native(input));
}

/** 설치된 PACE 데이터 루트. 테스트와 병행 설치를 위해 PACE_HOME으로 바꿀 수 있다. */
export function paceHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.PACE_HOME && env.PACE_HOME.length > 0 ? env.PACE_HOME : join(homedir(), ".pace");
}

export function profilesDir(home: string): string {
  return join(home, "profiles");
}

export function profileDir(home: string, name: string): string {
  return join(profilesDir(home), name);
}

/** 기본 프로필 이름을 담는 파일. */
export function defaultProfileFile(home: string): string {
  return join(home, "default");
}

/** 이 패키지(저장소) 루트 — 템플릿과 스킬 원본 위치. */
export const packageRoot: string = fileURLToPath(new URL("../../", import.meta.url));

export const templatesDir: string = join(packageRoot, "templates");

/** 모든 사용자·프로필에 같은 시스템 운영 규칙. 설치본과 함께 갱신되고 부트가 여기서 바로 읽는다. */
export const systemRulesFile: string = join(templatesDir, "RULES.md");
