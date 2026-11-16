import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, stringifyFrontmatter } from "../src/core/frontmatter.ts";

test("스칼라·인라인 목록·블록 목록·주석을 읽는다", () => {
  const text = [
    "---",
    "type: concept # 주석",
    'title: "제목: 콜론 포함"',
    "tags: [a, b]",
    "sources:",
    "  - code:src/a.ts",
    "  - url:https://example.com/#x",
    "empty: []",
    "---",
    "본문",
  ].join("\n");
  const { data, body } = parseFrontmatter(text);
  assert.equal(data.type, "concept");
  assert.equal(data.title, "제목: 콜론 포함");
  assert.deepEqual(data.tags, ["a", "b"]);
  assert.deepEqual(data.sources, ["code:src/a.ts", "url:https://example.com/#x"]);
  assert.deepEqual(data.empty, []);
  assert.equal(body, "본문");
});

test("frontmatter가 없으면 본문 전체를 돌려준다", () => {
  assert.deepEqual(parseFrontmatter("그냥 글"), { data: {}, body: "그냥 글" });
});

test("stringify 결과를 다시 읽으면 값이 같다", () => {
  const data = { name: "커밋 전 확인: 필수", description: 'a "따옴표" #해시', tags: ["x", "y,z"] };
  const text = stringifyFrontmatter(data, "내용\n");
  const parsed = parseFrontmatter(text);
  assert.equal(parsed.data.name, data.name);
  assert.equal(parsed.data.description, data.description);
  assert.equal(parsed.body.trim(), "내용");
});

test("들여쓰기 없는 블록 목록과 따옴표 날짜(v1 브레인 형식)를 읽는다", () => {
  const { data } = parseFrontmatter("---\ntags:\n- domain\n- terminology\nrelated: []\ncreated: '2026-06-27'\nmetadata:\n  type: project\n---\n본문");
  assert.deepEqual(data.tags, ["domain", "terminology"]);
  assert.equal(data.created, "2026-06-27");
});
