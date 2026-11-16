import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingQuestions, runOnboarding } from "../src/profile/onboarding.ts";

function scripted(answers: string[]) {
  const printed: string[] = [];
  return {
    printed,
    io: {
      ask: async () => {
        const next = answers.shift();
        if (next === undefined) throw new Error("답이 모자람");
        return next;
      },
      print: (text: string) => printed.push(text),
    },
  };
}

test("객관식 번호·기본값·직접 입력을 받아 프로필 값을 만든다 (역할은 묻지 않음)", async () => {
  // 이름, 별칭, 호칭=2(캡틴), 말투=Enter(1), 성격=1,2,8(직접)+입력, 언어=Enter, 확인=Enter
  const { io, printed } = scripted(["알투", "R2D2", "2", "", "1,2,8", "숫자에 강함", "", ""]);
  const input = await runOnboarding("default", io);
  assert.deepEqual(input, {
    name: "default",
    displayName: "알투",
    alias: "R2D2",
    ownerName: "캡틴",
    tone: "존댓말 + 친근",
    personality: "꼼꼼함(디테일을 놓치지 않음), 솔직함(모르면 모른다고, 아니면 아니라고), 숫자에 강함",
    language: "ko",
  });
  const all = printed.join("\n");
  assert.match(all, /"캡틴, 이건 이렇게 하면 좋을 것 같아요!"/, "말투 예시에 고른 호칭 반영");
  assert.match(all, /알투가 당신을 어떻게/, "앞 답(이름) 반영");
  assert.doesNotMatch(all, /역할/);
});

test("잘못된 번호는 다시 묻고, 확인에서 n이면 처음부터 다시 묻는다", async () => {
  const round = ["자비스", "", "9", "1", "3", "4", "2"]; // 이름, 별칭=Enter, 호칭=9(잘못)→1, 말투=3, 성격=4, 언어=2
  const { io, printed } = scripted([...round, "n", ...round, "y"]);
  const input = await runOnboarding("coder", io);
  assert.equal(input.alias, "자비스", "별칭 기본값은 이름");
  assert.equal(input.ownerName, "사용자");
  assert.equal(input.tone, "격식체");
  assert.equal(input.personality, "차분함(감정에 흔들리지 않고 냉철하게)");
  assert.equal(input.language, "en");
  assert.ok(printed.some((t) => /1~6 중에서/.test(t)));
  assert.ok(printed.some((t) => /처음부터 다시/.test(t)));
});

test("세션 인터뷰용 질문 목록은 6문항, 역할 질문이 없고 객관식에는 기타가 있다", () => {
  const questions = onboardingQuestions();
  assert.equal(questions.length, 6);
  assert.ok(!questions.some((q) => (q.key as string) === "role"));
  for (const q of questions.filter((q) => q.kind !== "text")) assert.ok(q.other, q.key);
});
