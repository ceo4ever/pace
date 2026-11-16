import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEMORY_LIMITS } from "../src/memory/memory.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("RULES는 1,700자 이하이고 핵심(메모리·쓰기 원칙·브레인 검색·사고 원칙·일의 성격 4가지·사실과 근거)을 지킨다", () => {
  const rules = read("templates/RULES.md");
  // P023: 공통 사고 원칙을 추가한 분량 가드. 실제 전달 예산·전문 보존은 boot 테스트에서 검증한다.
  assert.ok(rules.length <= 1700, `${rules.length}자`);
  for (const part of [
    // 메모리 즉시 기록·종류별 범위
    "생각나면 바로 `pace memory add [--project]`",
    "`rule` 교정·교훈(개인 습관=프로필, 이 프로젝트만=`--project`)",
    "`user`", "`todo`", "`issue`", "`note`", "`idea`", "이 셋은 `--project`",
    "`user` 사용자 사실(프로필)",
    "`todo` 할 일(개인=프로필, 프로젝트=`--project`)",
    "status --project",
    // 메모리 쓰기 원칙(P-7)
    "중복·범위 어긋남·가변값",
    "쓰기 원칙: 비밀·", // P014 P-4
    "에이전트만 알아볼 압축 문체",
    "요약 1줄은 행동 지시형",
    // 브레인은 검색
    "미리 읽지 않는다",
    "`pace brain search`",
    "`pace brain lint`",
    // 문구 보존 가드이며 실제 목표 판단·적용 검증은 독립 사례 검토로 한다.
    "## 사고 원칙", "목표→전략→계획→실행", "한 단계 위 목적", "고른 길·버린 길·이유",
    "위 단계로 올려 수정", "크기·위험에 비례", "같은 문서·절차를 강제하지 않는다",
    "사용자 의견도 목적·근거", "합의한 목표·범위를 바꿔야 하면 실행 전에 묻는다",
    // 일의 성격 4가지
    "## 일의 성격별 방식", // SOUL 템플릿·설치된 SOUL이 이 절 이름을 가리킨다
    "| 일상 비서 |", "| 개발 파트너 |", "| 프로젝트 매니저 |", "| 리서치 파트너 |",
    "프로필 `rule`이 우선",
    // 사실과 근거
    "`[확인: 출처]`(경로·명령 결과·URL+날짜)", "`[추정]`", "확인 안 된 방법",
    "확인된 단계 사이에 추정을 끼우지 않는다",
    "항목마다 확인·추정을 나눈다",
    // 옮긴 상세의 위치
    "`pace-memory` 스킬", "`pace-brain` 스킬",
  ]) {
    assert.ok(rules.includes(part), part);
  }
});

test("RULES에서 옮긴 상세는 영어 스킬에 있고, pace-memory 정리 기준이 RULES 쓰기 원칙과 같다", () => {
  const memory = read("skills/pace-memory/SKILL.md");
  assert.match(memory, /^name: pace-memory$/m);
  assert.match(memory, /\*\*Language:\*\* this skill is written in English, but .* user's language/);
  for (const part of [
    // RULES에서 옮긴 것: 정보를 둘 곳·판단 순서·닫기·오래된 항목·졸업·도구 자체 메모리
    "## Where information belongs",
    "Never record what code or git history already shows",
    "pace memory done <slug> [--project] --result",
    "**Stale (⚠)**",
    "**Graduate**",
    "not in the LLM tool's own memory",
    // 쓰기 원칙 = 정리 기준(P-7)
    "**No secrets.**",
    "even with `--force`",
    "**No duplicates.**",
    "**Right scope.**",
    "**No volatile values.**",
    "`status` is exempt",
    "**Compressed, agent-only style.**",
    "The one-line description is an instruction",
    "| Duplicate or contradiction |",
    "| Wrong scope |",
    "| Volatile value or verbose text |",
  ]) {
    assert.ok(memory.includes(part), part);
  }
  const brain = read("skills/pace-brain/SKILL.md");
  for (const part of [
    "## Project gates and promotion",
    "`pace project new` puts candidate pages",
    "never create page files by hand",
    "promoting it to `AGENTS.md` or `docs/`",
    "`pace-project-init` skill",
    "Run `pace brain lint` after committing changes outside a project",
  ]) {
    assert.ok(brain.includes(part), part);
  }
});

test("가드 문구 일치: 스킬·RULES·도움말이 구현(한도·검출 목록·--force·status 제외)과 같다", () => {
  const skill = read("skills/pace-memory/SKILL.md");
  assert.ok(skill.includes(`Description ≤ ${MEMORY_LIMITS.description} chars, body ≤ ${MEMORY_LIMITS.body} chars (\`status\` is exempt`));
  for (const part of ["Terminal handles (`term_…`)", "UUIDs", "full 40-char hashes", "A short commit hash as an issue's evidence is allowed", "(`P###`, `BL######`, `BR##`)", "file paths with lines", "`pace memory add|update` rejects violations", "`--force`"]) {
    assert.ok(skill.includes(part), part);
  }
  assert.ok(read("templates/RULES.md").includes("가변값(세션 ID·UUID·전체 해시·터미널 핸들)"));
  assert.ok(read("src/cli.ts").includes(`요약 ${MEMORY_LIMITS.description}자·본문 ${MEMORY_LIMITS.body}자 초과`));
});

test("프로젝트 계획에서 R7에 따라 현재 호스트 기능의 필요성과 적합성을 판단한다", () => {
  const rules = read("templates/RULES.md");
  const principle = "프로젝트 계획 때 필요성을 판단하고 현재 호스트 기능을 확인해 적합하면 대체 절차보다 우선한다.";
  assert.equal(rules.split(principle).length - 1, 1);
  assert.match(rules, /과거 결정·경위·함정·용어·도구 동작이 걸리거나 설계를 바꾸기 전/);
  assert.equal(rules.includes("도구 기본 기능(계획·서브에이전트·스킬·MCP·웹)을 쓴다."), false);
});
