import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

export interface HandoffProblem {
  line: number;
  message: string;
}

/** 파일 이름으로 인계 문서 종류를 고르고 꼭 있어야 할 절을 정한다. 하네스가 읽는 한국어 절 이름 그대로. */
function requiredSections(name: string): string[] | null {
  if (name === "BACKLOG.md") return ["목표", "진행 현황"];
  if (/^BR\d{2}_.+\.md$/.test(name)) return ["목적", "범위", "완료 기준"];
  if (name === "PROJECT.md") return ["목적", "재료", "기준"];
  return null;
}

/** 빈 칸이어도 되는 열 — 나중에 명령이 채우는 칸. */
const OPTIONAL_COLUMNS = new Set(["비고", "커밋"]);

const isComment = (text: string) => /^<!--[\s\S]*-->$/.test(text.trim());

/**
 * 인계 문서(BACKLOG·BR·PROJECT)의 빈 칸 검사. 머리말 목록 줄(`- 작업자:` 등)의 안내 주석과
 * 절 밖 안내 주석 덩어리는 그대로 둘 수 있지만, 절 본문이 주석뿐이거나 표 칸이 비면 문제다.
 * 코드 펜스 안(문서가 예시로 담은 표·제목·자리 표시)은 보지 않는다.
 */
export function checkHandoffText(name: string, text: string): HandoffProblem[] {
  const required = requiredSections(name);
  if (required === null) return [{ line: 0, message: "인계 문서가 아니다 — BACKLOG.md · BR##_이름.md · PROJECT.md만 검사한다" }];
  const problems: HandoffProblem[] = [];
  const sections = new Map<string, { line: number; body: string[] }>();
  let current: { line: number; body: string[] } | null = null;
  let header: string[] | null = null;
  let fenced = false;
  text.replaceAll("\r\n", "\n").split("\n").forEach((line, i) => {
    const at = i + 1;
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      header = null;
      current?.body.push(line);
      return;
    }
    if (fenced) {
      current?.body.push(line);
      return;
    }
    if (line.includes("{{") && line.includes("}}")) problems.push({ line: at, message: "템플릿 자리 표시가 남았다" });
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) {
      if (sections.has(heading[1]!)) problems.push({ line: at, message: `절이 두 번 있다: ## ${heading[1]}` });
      current = { line: at, body: [] };
      sections.set(heading[1]!, current);
      header = null;
      return;
    }
    current?.body.push(line);
    const row = line.trim();
    if (!row.startsWith("|")) {
      header = null;
      return;
    }
    const cells = row.replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
    if (header === null) {
      header = cells;
      return;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) return;
    if (cells.length < header.length) problems.push({ line: at, message: `칸이 모자라다: ${cells.length}/${header.length}` });
    cells.forEach((cell, k) => {
      const column = header![k] ?? "";
      if ((cell === "" || isComment(cell)) && !OPTIONAL_COLUMNS.has(column)) problems.push({ line: at, message: `빈 칸: ${column || `${k + 1}번째 열`}` });
    });
  });
  for (const name of required) if (!sections.has(name)) problems.push({ line: 0, message: `절이 없다: ## ${name}` });
  for (const [name, section] of sections) {
    const body = section.body.join("\n").trim();
    if (body !== "" && isComment(body)) problems.push({ line: section.line, message: `절 본문이 안내 주석뿐이다: ## ${name}` });
    else if (body.replace(/<!--[\s\S]*?-->/g, "").trim() === "" && required.includes(name)) problems.push({ line: section.line, message: `절이 비었다: ## ${name}` });
  }
  return problems;
}

export function checkHandoffFile(path: string): HandoffProblem[] {
  if (!statSync(path).isFile()) return [{ line: 0, message: "파일이 아니다" }];
  return checkHandoffText(basename(path), readFileSync(path, "utf8"));
}
