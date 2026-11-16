import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CHAT, tgHarness, U1, until } from "./telegram-helpers.ts";

// P035 실사용 확인 후속(수정 15·16) — 토픽의 /use 안내와 동작을 일치시키고, /new의 토픽 권한 부족을 구체적으로 안내한다.

type T = Awaited<ReturnType<typeof tgHarness>>;
const reply = (t: T): string[] => t.mock.texts().filter((x) => !x.includes("연결됨"));

async function withWorktrees(): Promise<T> {
  const t = await tgHarness();
  const a = t.h.config.workspaces.find((w) => w.name === "a")!;
  a.worktrees.P035 = join(t.home, "ws", "a-P035"); // /use는 설정의 워크트리 이름만 본다
  mkdirSync(a.worktrees.P035, { recursive: true });
  const b = t.h.config.workspaces.find((w) => w.name === "b")!;
  b.worktrees.other = join(t.home, "ws", "b-other");
  return t;
}

test("U-1 토픽의 /use는 <워크트리>와 <이 워크스페이스>/<워크트리> 모두 받는다", async () => {
  const t = await withWorktrees();
  try {
    t.mock.text(CHAT, 11, U1, "/use P035");
    t.mock.text(CHAT, 11, U1, "/use a/main");
    t.mock.text(CHAT, 11, U1, "/use a/P035");
    await until(() => reply(t).length >= 3, 4000, "응답");
    assert.deepEqual(reply(t), ["대상 변경: <code>a/P035</code> (이미 받은 작업에는 영향 없음)", "대상 변경: <code>a/main</code> (이미 받은 작업에는 영향 없음)", "대상 변경: <code>a/P035</code> (이미 받은 작업에는 영향 없음)"]);
  } finally { await t.stop(); }
});

test("U-2 다른 워크스페이스·없는 워크트리·인자 없음은 이 토픽의 워크트리 목록만 보여 주며 서로 모순되지 않는다", async () => {
  const t = await withWorktrees();
  try {
    t.mock.text(CHAT, 11, U1, "/use b/main"); // 다른 워크스페이스
    t.mock.text(CHAT, 11, U1, "/use a"); // 워크스페이스 이름만
    t.mock.text(CHAT, 11, U1, "/use nope");
    t.mock.text(CHAT, 11, U1, "/use");
    await until(() => reply(t).length >= 4, 4000, "응답");
    const [other, onlyWs, unknown, none] = reply(t);
    assert.match(other!, /^워크스페이스 <code>b<\/code>는 그 워크스페이스의 토픽에서 고른다\. 이 토픽에서는 <code>a<\/code>의 워크트리만/);
    assert.match(onlyWs!, /^알 수 없는 워크트리: <code>a<\/code>\n이 토픽\(<code>a<\/code>\)의 워크트리:\n• <code>main<\/code>\n• <code>P035<\/code>$/);
    assert.match(unknown!, /^알 수 없는 워크트리: <code>nope<\/code>/);
    assert.match(none!, /^사용법\n\/use <code>&lt;워크트리&gt;<\/code> — 이 토픽의 워크트리 선택\(예: P035\)\n이 토픽/);
    for (const x of [other!, onlyWs!, unknown!, none!]) {
      assert.ok(!x.includes("b/main") && !x.includes("other") && !x.includes("<code>b</code>\n"), `다른 워크스페이스의 워크트리는 목록에 없다: ${x}`);
      assert.ok(x.includes("<code>main</code>") && x.includes("<code>P035</code>"));
    }
    assert.equal(t.h.store.state.conversations[`telegram:${CHAT}:11`]?.worktreeName ?? "main", "main", "거부된 /use는 대상을 바꾸지 않는다");
  } finally { await t.stop(); }
});

test("U-3 모르는 명령은 토픽 도움말로 답하고(코어의 다른 도움말이 아니다), 도움말의 /use 표기가 동작과 같다", async () => {
  const t = await withWorktrees();
  try {
    t.mock.text(CHAT, 11, U1, "/zzz");
    t.mock.text(CHAT, 11, U1, "/help");
    await until(() => reply(t).length >= 2, 4000, "응답");
    for (const x of reply(t)) {
      assert.ok(x.includes("/use <code>&lt;워크트리&gt;</code> — 이 토픽의 워크트리 선택"), x);
      assert.ok(!x.includes("워크스페이스[/워크트리]"));
    }
    assert.match(reply(t)[0]!, /^<b>알 수 없는 명령 — 사용 가능한 명령<\/b>/);
    assert.equal(t.h.runner.started.length, 0);
  } finally { await t.stop(); }
});

test("N-1 /new의 토픽 권한 부족·포럼 꺼짐은 원문 오류 대신 해결 방법을 안내한다(같은 /new로 이어 간다)", async () => {
  const t = await tgHarness();
  try {
    const dir = join(t.home, "ws", "newws"); mkdirSync(dir, { recursive: true });
    t.mock.fault("createForumTopic", { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: not enough rights to create a topic" }, times: 1 });
    t.mock.text(CHAT, undefined, U1, `/new newws ${dir}`);
    await until(() => reply(t).length >= 1, 5000, "권한 안내");
    const text = reply(t)[0]!;
    assert.match(text, /^봇에 토픽 관리 권한이 없어 토픽을 만들지 못했다\.\n그룹 설정 → 관리자 → 이 봇 → <b>토픽 관리<\/b> 권한을 켠다\.\n/);
    assert.ok(!/Bad Request|not enough rights/.test(text), "원문 오류를 그대로 보이지 않는다");
    for (const line of text.split("\n")) assert.ok((line.match(/(?:^|[\s(>])\/[a-z]+/g) ?? []).length <= 1, line);
    // 권한을 준 뒤 같은 /new로 이어 간다
    t.mock.text(CHAT, undefined, U1, `/new newws ${dir}`);
    await until(() => reply(t).some((x) => x.includes("등록 완료")), 5000, "이어서 등록");
    // 포럼이 꺼진 그룹
    const dir2 = join(t.home, "ws", "newws2"); mkdirSync(dir2, { recursive: true });
    t.mock.fault("createForumTopic", { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: the chat is not a forum" }, times: 1 });
    t.mock.text(CHAT, undefined, U1, `/new newws2 ${dir2}`);
    await until(() => reply(t).some((x) => x.includes("토픽(포럼)이 꺼져")), 5000, "포럼 안내");
    // 모르는 원인은 원문 오류를 보인다
    const dir3 = join(t.home, "ws", "newws3"); mkdirSync(dir3, { recursive: true });
    t.mock.fault("createForumTopic", { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: something else" }, times: 1 });
    t.mock.text(CHAT, undefined, U1, `/new newws3 ${dir3}`);
    await until(() => reply(t).some((x) => x.includes("토픽을 만들지 못했다: ") && x.includes("something else")), 5000, "원문 오류");
  } finally { await t.stop(); }
});
