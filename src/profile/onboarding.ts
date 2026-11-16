import type { ProfileInput } from "./profile.ts";

/**
 * 프로필 생성 인터뷰. 한 번에 한 문제, 객관식 우선(+직접 입력), 고유값만 주관식 — v1 온보딩 방식.
 * 입출력은 주입받아 터미널(readline)과 테스트에서 같이 쓴다.
 */
export interface OnboardingIO {
  ask(prompt: string): Promise<string>;
  print(text: string): void;
}

interface Choice {
  label: string;
  /** 선택지 옆에 보여 줄 설명·예시. 호칭 자리는 {owner}. */
  hint?: string;
  /** 프로필에 들어갈 값. 없으면 label. */
  value?: string;
}

export const OWNER_CHOICES: Choice[] = [
  { label: "사용자" },
  { label: "캡틴" },
  { label: "보스" },
  { label: "대표님" },
  { label: "선배님" },
];

export const TONE_CHOICES: Choice[] = [
  { label: "존댓말 + 친근", hint: '"{owner}, 이건 이렇게 하면 좋을 것 같아요!"' },
  { label: "반말 + 직설", hint: '"이건 이렇게 하는 게 나아."' },
  { label: "격식체", hint: '"해당 건은 이렇게 진행하겠습니다."' },
];

export const TRAIT_CHOICES: Choice[] = [
  { label: "꼼꼼함", hint: "디테일을 놓치지 않음" },
  { label: "솔직함", hint: "모르면 모른다고, 아니면 아니라고" },
  { label: "주도적", hint: "시키지 않아도 먼저 제안" },
  { label: "차분함", hint: "감정에 흔들리지 않고 냉철하게" },
  { label: "유머러스", hint: "가끔 위트 있는 한마디" },
  { label: "까칠함", hint: "날카롭지만 일은 똑부러지게" },
  { label: "따뜻함", hint: "공감하고 격려하는 스타일" },
];

export const LANGUAGE_CHOICES: Choice[] = [
  { label: "한국어", value: "ko" },
  { label: "English", value: "en" },
];

export function describeTraits(labels: string[]): string {
  return labels
    .map((label) => {
      const hint = TRAIT_CHOICES.find((c) => c.label === label)?.hint;
      return hint ? `${label}(${hint})` : label;
    })
    .join(", ");
}

export async function runOnboarding(name: string, io: OnboardingIO): Promise<ProfileInput> {
  for (;;) {
    io.print("\nPACE 에이전트 프로필을 만듭니다. 하나씩 여쭐게요. (번호 입력, Enter = [기본값])\n");

    const displayName = await askText(io, "1/6 에이전트 이름을 정해 주세요.", "예) 알투, 자비스, 프라이데이, 아이리스");
    const alias = await askText(io, `2/6 ${displayName}의 영문 별칭(짧게)을 정해 주세요.`, "예) R2D2, JARVIS, IRIS", displayName);
    const ownerName = await askChoice(io, `3/6 ${displayName}가 당신을 어떻게 부르면 좋을까요?`, OWNER_CHOICES, {
      defaultIndex: 0,
      other: "호칭 직접 입력 (예: 팀장님, 민수님)",
    });
    const fill = (text: string) => text.replaceAll("{owner}", ownerName);
    const tone = await askChoice(io, `4/6 ${displayName}의 말투는 어떤 게 좋을까요?`, TONE_CHOICES.map((c) => ({ ...c, hint: c.hint && fill(c.hint) })), {
      defaultIndex: 0,
      other: '말투 직접 입력 (예: 존댓말, 짧고 간결하게 — "확인했습니다. 다음은 이겁니다.")',
    });
    const traits = await askMulti(io, `5/6 ${displayName}의 성격을 골라 주세요. 여러 개 가능 (예: 1,2,4)`, TRAIT_CHOICES, {
      defaults: [0, 1, 3],
      other: "성격 직접 입력, 쉼표로 구분 (예: 끈기 있음, 숫자에 강함)",
    });
    const language = await askChoice(io, "6/6 기본 언어는요?", LANGUAGE_CHOICES, { defaultIndex: 0, other: "직접 입력 (예: ja)" });

    const input: ProfileInput = {
      name,
      displayName,
      alias,
      ownerName,
      tone,
      personality: describeTraits(traits),
      language,
    };
    io.print(
      [
        "",
        "── 확인 ─────────────────────────",
        `  이름      ${displayName} (${alias})`,
        `  호칭      ${ownerName}`,
        `  말투      ${tone}`,
        `  성격      ${input.personality}`,
        `  언어      ${language}`,
        "─────────────────────────────────",
        "  나중에 바꾸려면: pace profile path → SOUL.md 수정",
      ].join("\n"),
    );
    const ok = (await io.ask("이대로 만들까요? [Y/n] ")).trim().toLowerCase();
    if (ok === "" || ok === "y" || ok === "yes" || ok === "예" || ok === "네") return input;
    io.print("\n처음부터 다시 여쭐게요.");
  }
}

async function askText(io: OnboardingIO, question: string, example: string, fallback?: string): Promise<string> {
  io.print(`\n${question}\n  ${example}`);
  for (;;) {
    const answer = (await io.ask(fallback ? `> [${fallback}] ` : "> ")).trim();
    if (answer.length > 0) return answer;
    if (fallback) return fallback;
    io.print("  값을 입력해 주세요.");
  }
}

async function askChoice(
  io: OnboardingIO,
  question: string,
  choices: Choice[],
  options: { defaultIndex: number; other: string },
): Promise<string> {
  printChoices(io, question, choices, options.other);
  const otherNumber = choices.length + 1;
  for (;;) {
    const answer = (await io.ask(`> [${options.defaultIndex + 1}] `)).trim();
    const index = answer === "" ? options.defaultIndex : Number.parseInt(answer, 10) - 1;
    const choice = choices[index];
    if (choice && /^\d*$/.test(answer)) return choice.value ?? choice.label;
    if (answer === String(otherNumber)) {
      const custom = (await io.ask("  직접 입력: ")).trim();
      if (custom.length > 0) return custom;
    }
    io.print(`  1~${otherNumber} 중에서 골라 주세요.`);
  }
}

async function askMulti(
  io: OnboardingIO,
  question: string,
  choices: Choice[],
  options: { defaults: number[]; other: string },
): Promise<string[]> {
  printChoices(io, question, choices, options.other);
  const otherNumber = choices.length + 1;
  const defaultLabel = options.defaults.map((i) => i + 1).join(",");
  for (;;) {
    const answer = (await io.ask(`> [${defaultLabel}] `)).trim();
    const picks = answer === "" ? options.defaults.map((i) => i + 1) : answer.split(/[\s,]+/).map((v) => Number.parseInt(v, 10));
    if (picks.some((n) => !Number.isInteger(n) || n < 1 || n > otherNumber)) {
      io.print(`  1~${otherNumber} 번호를 쉼표로 구분해 입력해 주세요.`);
      continue;
    }
    const labels = [...new Set(picks)].filter((n) => n !== otherNumber).map((n) => (choices[n - 1] as Choice).label);
    if (picks.includes(otherNumber)) {
      const custom = (await io.ask("  직접 입력: ")).split(",").map((v) => v.trim()).filter((v) => v.length > 0);
      labels.push(...custom);
    }
    if (labels.length > 0) return labels;
    io.print("  하나 이상 골라 주세요.");
  }
}

function printChoices(io: OnboardingIO, question: string, choices: Choice[], other: string): void {
  const lines = choices.map((c, i) => `  ${i + 1}. ${c.label}${c.hint ? ` — ${c.hint}` : ""}`);
  lines.push(`  ${choices.length + 1}. ${other}`);
  io.print(`\n${question}\n${lines.join("\n")}`);
}

export interface OnboardingQuestion {
  key: keyof Omit<ProfileInput, "name"> | "traits";
  question: string;
  kind: "text" | "choice" | "multi";
  example?: string;
  choices?: { label: string; hint?: string }[];
  other?: string;
}

/** 세션 인터뷰(pace-onboarding 스킬)가 읽는 질문 목록. 터미널 인터뷰와 같은 원본이다. */
export function onboardingQuestions(): OnboardingQuestion[] {
  const plain = (choices: Choice[]) => choices.map(({ label, hint }) => (hint ? { label, hint } : { label }));
  return [
    { key: "displayName", kind: "text", question: "에이전트 이름을 정해 주세요.", example: "알투, 자비스, 프라이데이, 아이리스" },
    { key: "alias", kind: "text", question: "영문 별칭(짧게)을 정해 주세요.", example: "R2D2, JARVIS, IRIS" },
    { key: "ownerName", kind: "choice", question: "당신을 어떻게 부르면 좋을까요?", choices: plain(OWNER_CHOICES), other: "직접 입력 (예: 팀장님, 민수님)" },
    { key: "tone", kind: "choice", question: "말투는 어떤 게 좋을까요? (예시의 {owner}는 고른 호칭)", choices: plain(TONE_CHOICES), other: "직접 입력" },
    { key: "traits", kind: "multi", question: "성격을 골라 주세요. 여러 개 가능", choices: plain(TRAIT_CHOICES), other: "직접 입력" },
    { key: "language", kind: "choice", question: "기본 언어는요?", choices: plain(LANGUAGE_CHOICES), other: "직접 입력" },
  ];
}

export function formatQuestionsMarkdown(questions: OnboardingQuestion[]): string {
  return questions
    .map((q, i) => {
      const head = `${i + 1}. [${q.key} · ${q.kind === "text" ? "주관식" : q.kind === "multi" ? "객관식 복수" : "객관식"}] ${q.question}`;
      const body = q.example
        ? [`   예) ${q.example}`]
        : [...(q.choices ?? []).map((c, j) => `   ${j + 1}) ${c.label}${c.hint ? ` — ${c.hint}` : ""}`), `   기타) ${q.other}`];
      return [head, ...body].join("\n");
    })
    .join("\n");
}
