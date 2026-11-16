import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** 같은 디렉터리에 임시 파일을 쓴 뒤 rename — 동시 세션이 반쯤 쓴 파일을 읽지 않게 한다. */
export function writeFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
  const fd = openSync(tmp, "wx");
  try {
    try { writeFileSync(fd, content, "utf8"); } finally { closeSync(fd); }
    // Windows에서 다른 프로세스가 대상을 교체 중이면 일시적인 공유 위반이 날 수 있다.
    for (let attempt = 0; ; attempt++) {
      try { renameSync(tmp, path); break; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (process.platform !== "win32" || (code !== "EPERM" && code !== "EACCES") || attempt >= 100) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
  } finally {
    // 이 호출이 wx로 만든 임시 파일만 제거한다. 성공한 rename 뒤에는 ENOENT다.
    try { unlinkSync(tmp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

export function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 파일명으로 쓸 슬러그. 한글은 유지하고 공백·특수문자는 '-'로 바꾼다. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) throw new Error(`슬러그를 만들 수 없는 이름: "${text}"`);
  // 자른 끝에 '-'가 남지 않게 한다 — slugify(slug) === slug(멱등)여야 memory의 slug 검증이 정상 항목을 거부하지 않는다.
  return slug.slice(0, 80).replace(/-+$/, "");
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

/** 프로젝트·백로그 폴더 이름. 한글은 유지하고 공백은 밑줄로 바꾼다. */
export function folderName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
  if (cleaned === "" || /^\.+$/.test(cleaned) || /[\r\n]/.test(name)) throw new Error("이름이 비었거나 파일명으로 쓸 수 없다");
  return cleaned;
}
