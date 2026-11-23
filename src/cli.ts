import { executeTest } from "./test-runner/runner.ts";
import { dashboardState as dashboardPresence } from './project/dashboard-layout.ts';
import { generateDashboard, refreshDashboard } from "./project/dashboard.ts";
import { initDashboard, isProtectedInitTarget } from "./project/dashboard-init.ts";
import { readWorkerSettings, resolveWorkerSettings, setWorkerSettings } from "./core/worker-settings.ts";
import { BacklogError, newBacklog, newBrief } from "./project/backlog.ts";
import { newRun } from "./scout/run.ts";
import { renderRun, schemaPath } from "./scout/report.ts";
import { writeCard } from "./scout/card.ts";
import { verifyRun } from "./scout/verify.ts";
import { transcriptFromBrowser } from "./scout/transcript.ts";
import { today } from "./core/fsutil.ts";
import { fetchSources, guessKind, normalizeTranscript, parseUrl, readSources, saveSource, ScoutError, type SourceKind, type SourceMethod } from "./scout/source.ts";
import { IntentError, loadLenses, writeLensIndex } from "./intent/lens.ts";
import { checkHandoffFile } from "./intent/handoff.ts";
import { renderDocs, verifyDocs, writeExamples, type Check } from "./intent/plan.ts";
import { createPreview, verifyPreview } from "./intent/preview.ts";
import { AgentError, errorPayload, runAgent, validateRequest } from "./agent/contract.ts";
import { allExecutors, findExecutor } from "./agent/registry.ts";
import { ChainConfigError, checkChain, defaultChainFile, fileCooldownStore, loadChainConfig, outcomeExitCode, resolveChain, runChain } from "./agent/chain.ts";
import { reviewNoteCommand, verifyCommand } from "./agent/verify-cli.ts";
import { daemonCommand, DaemonUsageError } from "./daemon/cli.ts";
import { defaultDataHome, refreshAutostart, type AutostartEnv } from "./daemon/autostart.ts";
import { runAgentSetup, SetupUsageError } from "./agent/setup.ts";
import { terminalSetupDeps } from "./agent/setup-cli.ts";
import { runCommand } from "./core/console-decode.ts";
import { PaceMcpServer } from "./mcp/server.ts";
import { serveStdio } from "./mcp/stdio.ts";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { applyAdoptOpal, formatPlan, planAdoptOpal } from "./project/adopt-opal.ts";
import { inspectWorkspaces, registerWorkspace, relocateWorkspace } from "./project/workspace-registry.ts";
import { AGENT_BUDGET } from "./project/agent-definition.ts";
import { agentEvent, ProjectLogError } from "./project/event-log.ts";
import { findProject, statsRepo } from "./project/harness.ts";
import { collectDashboard, formatDashboard, refreshProjectMetrics } from "./project/metrics-report.ts";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  addPage,
  appendLog,
  findBrainRoot,
  findProjectRoot,
  formatLint,
  formatSearch,
  ingestScan,
  initBrain,
  lintBrain,
  rebuildBrainIndex,
  searchBrain,
  updatePage,
  type LintIssue,
} from "./project/brain.ts";
import { assertHost, bootNotice, buildBootContext, cwdFromAntigravityHookInput, cwdFromHookInput, formatForHost, type Host } from "./boot.ts";
import {
  addMemory,
  assertMemoryType,
  completeMemory,
  listMemories,
  memoryTypes,
  profileMemoryDir,
  projectMemoryDir,
  readMemory,
  rebuildMemoryIndex,
  removeMemory,
  setStatus,
  updateMemory,
  type Scope,
} from "./memory/memory.ts";
import { projectRootForMemory } from "./project/situation.ts";
import {
  addTask,
  applyMerge,
  checkTask,
  doneTask,
  finishProject,
  formatList,
  formatReport,
  HarnessError,
  listProjects,
  newProject,
  openRepo,
  orcaChatSession,
  planMerge,
  startProject,
} from "./project/harness.ts";
import { install, uninstall } from "./setup/install.ts";
import { detectTool, isOnboardTool, launch, ONBOARD_TOOLS } from "./setup/onboard.ts";
import {
  describeTraits,
  formatQuestionsMarkdown,
  onboardingQuestions,
  runOnboarding,
} from "./profile/onboarding.ts";
import { assertSafeGitPath, paceHome, packageRoot, profileDir } from "./core/paths.ts";
import {
  cloneProfile,
  createProfile,
  getDefaultProfile,
  listProfiles,
  loadProfile,
  resolveProfileName,
  setDefaultProfile,
  type ProfileInput,
} from "./profile/profile.ts";

const HELP = `pace — LLM CLI 세션에 올라오는 개인 비서 에이전트

사용법:
  pace test changed | file <경로> | unit <id> | all — 변경 기반·선택·전체 검사
  pace boot [--host claude|codex|gemini|cursor|antigravity|plain] [--cwd <dir>] [--text]
  pace adopt opal [--cwd <폴더>] [--apply]   OPAL(.opal) 프로젝트 정의를 PACE(.pace)로 가져온다 — 기본은 미리보기, 커밋 없음
  pace workspace register <경로> [--name <이름>] [--summary <요약>] · list · move <ID> <경로>
  pace profile create <이름> [--display-name --alias --owner --tone --personality --language] [--clone <원본>]
  pace profile questions [--json]          프로필 인터뷰 질문 목록 (pace-onboarding 스킬용)
  pace profile list | show [이름] | use <이름> | path [이름]
  pace memory add [--project] --type <종류> --name <제목> --description <요약> [--body <내용>|-] [--due YYYY-MM-DD] [--force]
      프로필 종류: user · rule · todo        프로젝트 종류(--project): status · rule · issue · todo · note · idea
  pace memory update <slug> [--project] [--name --description --type --body --due] [--force]
      add·update는 쓰기 원칙(가변값·중복·프로필에 프로젝트 내용·요약 160자·본문 400자 초과)을 거부 — 예외만 --force
  pace memory done <slug> [--project] [--result <결과>]     이슈·할 일·아이디어 닫기 (이력에 기록)
  pace memory status --project [--body <내용>]             진행 상황 보기·갱신
  pace memory remove|show <slug> [--project] · list [--project] · index [--project]
  pace brain search "<질의>" [--list] [--type T] [--tag X] [--limit N] [--budget 글자수]   관련 절을 모아 돌려줌
  pace brain add --type <종류> --title <제목> --summary <한 줄> --body …   페이지 추가 (검사 통과해야 씀)
  pace brain update <페이지> [--summary --body --append-sources …]         페이지 수정 (created 보존)
  pace brain lint [--fix] · index · init · log --op --summary · ingest-scan [--source docs|skills|backlogs]
  pace backlog new "<이름>" · brief <BL> "<이름>"   백로그·브리프 생성 (main)
  pace backlog init                               현재 대상 폴더 대시보드 최초 생성
  pace backlog refresh                            설치된 대시보드 자료 수동 갱신
  pace scout new "<주제>" [--out <폴더>]   기회 탐색 실행 폴더 (main이면 backlogs/, 아니면 $PACE_HOME/scout/)
  pace scout fetch <폴더> <URL>… [--kind article|blog|video] [--allow-local]   출처를 sources/S{n}.md로 (유튜브는 자막 먼저, 못 받으면 설명란과 다음 경로 안내)
  pace scout add <폴더> --url --title [--author --published --kind --method web-read|browser|pasted --replace S#] [--body <글>|-]   웹 읽기·붙여넣은 본문 저장
  pace scout transcript <폴더> <S#> [--via auto|orca|agent-browser] [--cdp <포트>] [--chrome <경로>]   유튜브 스크립트를 브라우저 패널에서 읽어 저장 (Orca 브라우저 → agent-browser + 빈 임시 프로필 Chrome, --cdp는 임시 프로필 Chrome에만)
  pace scout render <폴더>                       report.json → report.html (schema에 어긋나면 칸 이름과 함께 실패)
  pace scout verify <폴더> [--offline] [--allow-local]   증명 검사 6종 + 링크 → verify.log·보고서 부록 (실패가 있으면 종료 1)
  pace scout card <폴더> <I#>                    report.json의 후보를 혼자 읽히는 아이디어 카드 idea-{n}.md로
  pace scout schema                              report.json schema 경로
  pace intent index [--check] · lint   pace-intent 렌즈 형식 검사·INDEX.md 다시 만들기 (--skill <폴더>)
  pace intent check <BACKLOG.md|BR##_….md|PROJECT.md>…   인계 문서 빈 칸·필수 절·남은 템플릿 주석 검사 (문제가 있으면 종료 1)
  pace intent render <docs 폴더> [--root <제품 저장소>] [--legacy-wireframe]   plan.json → 기획 HTML과 증명 검사
  pace intent preview <폴더> [--root <제품 저장소>] [--verify]   Canvas 이미지 미리보기 생성 또는 검증
  pace intent verify <docs 폴더> [--root <제품 저장소>]   증명 검사만 (실패가 있으면 종료 1). --root는 기존·변경 화면 근거 경로의 기준(기본: 지금 폴더)
  pace intent examples [--check]   템플릿 example.html을 예시 데이터로 다시 만들기 (--check: 어긋나면 종료 1)
  pace agent run --agent claude|codex --mode p|acp [--prompt-file <파일>|stdin] [--cwd --system-prompt-file --model --effort --write --timeout-ms --resume --raw-dir]   다른 제공자 에이전트 호출 (결과 JSON, 프롬프트는 argv 금지)
  pace agent setup [--agents claude,codex] [--yes] [--login] [--install-adapters]   이 기기의 claude·codex CLI·로그인·ACP 어댑터를 감지해 프로필의 default 체인을 만든다(기존 파일은 보존·병합, 로그인은 공식 CLI, 어댑터 설치는 동의할 때만)
  pace agent run --chain <이름> [--chain-file <파일>] [--prompt-file <파일>|stdin] [--cwd --write --timeout-ms --raw-dir]   체인 호출 — 한도 시 다음 단계로 폴백, 쓰기 변경 뒤에는 handoff_required (종료 0 ok · 12 handoff · 13 소진 · 11 한도 …)
  pace daemon run|start|status|stop [--force]|logs [-n N]|release <경로>|install [--yes] [--start] [--agents --login --install-adapters]|uninstall [--yes]   기기 상시 실행(메신저·Gateway 요청을 워크트리에서 체인으로 실행) — 쓰기는 승인, 재시작 뒤 자동 재실행 없음. install은 --yes 없이는 계획만 출력
  pace mcp --workspace <경로> --access read-only|write   PACE 도구 서버(stdio MCP) — ACP 세션에 주입된다. 워크스페이스·접근 권한은 기동 때 고정, 읽기 전용이면 변경 도구를 서버가 거부
  pace agent verify --author-agent claude|codex --target <파일> (--purpose <글>|--purpose-file <파일>) [--kind goal|task] [--allow-same-provider] [--out <기록>]   다른 제공자 에이전트의 읽기 전용 교차 검증 (task: 구현 전 TASK 사전 검토, 미실행이면 종료 10과 질문). 대상 폴더 REVIEW-LOG.jsonl에 판정을 남기고, 직전이 fail이면 그 검토 원문·바뀐 줄로 재검토하며, 연속 3회 fail이면 진단·진단 뒤 fail이면 사용자 결정 전까지 종료 16
  pace agent review-note --target <파일> (--diagnosis --layer structure|planning|design|other --summary <글> [--file <근거>] | --decision --choice <글> --summary <글> --file <결정 원문>)   반복 실패의 근본 진단·사용자 결정을 검토 원장에 기록
  pace project new "<이름>" [--from <BL 폴더 또는 앞부분>]   프로젝트 폴더·PROJECT.md (main)
  pace worker show | set <도구> <model|effort> <값> | reset <도구> <model|effort>
  pace project start <P###> [--model <모델>] [--effort <값|default>] [--agent <도구>] [--no-launch|--launch]   정의 커밋 + worktree(../<저장소>.wt/P###) (main). Orca 안이면 작업자 세션을 띄우고 이 세션이 코디네이터
  pace project task <P###> "<이름>"              태스크 폴더·TASK.md·태스크 표 행 (worktree)
  pace project check <P###> <T##>                커밋 게이트 확인 — TASK-CLOSE (worktree)
  pace project done <P###> <T##>                 check 통과 시 상태 완료 — TASK.md·태스크 표·같은 번호 브리프·빈 커밋 칸 (worktree, 커밋은 직접)
  pace project finish <P###>                     마감 하네스 → 병합 대기 (worktree에서만)
  pace project merge <P###> [--yes]              ff 병합·정리 (main에서만, 기본은 요약만)
  pace project log <P###> [T##] --type <decision|change|review|question|answer|escalation|note> --msg <한 줄> [--src 출처] [--ref 파일]
  pace project list                              프로젝트 상태·진행 태스크·worktree
  pace project stats <P###> [--json|--write]     러닝 시간·대기·게이트 실패·도구별 토큰 (--write: METRICS.md·비교 표 다시 만들기)
  pace onboard [--with claude|codex|gemini|cursor-agent] [-- <도구 옵션>]   온보딩을 바로 시작하며 LLM CLI 열기
  pace install [--dry-run] [--claude-dir <폴더>…] [--codex-dir <폴더>…]   각 LLM 도구(계정별 폴더 포함)에 부트 훅·대체 규칙·스킬 등록
  pace uninstall [--dry-run]
  pace --version

공통: --profile <이름> (메모리 대상 프로필), 환경변수 PACE_HOME, PACE_PROFILE`;

export interface MainDeps {
  /** pace install 뒤 daemon 등록 갱신에 쓸 환경(시험 주입) — 없으면 실제 플랫폼·실행자 */
  autostart?: Partial<AutostartEnv>;
}

export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "boot":
      return boot(rest);
    case "profile":
      return profile(rest);
    case "memory":
      return memory(rest);
    case "brain":
      return brain(rest);
    case "backlog":
      return backlogCommand(rest);
    case "worker": {
      const [sub, agent, field, value] = rest;
      if (sub === "show" && rest.length === 1) {
        const settings = readWorkerSettings();
        process.stdout.write(JSON.stringify({ settings, effective: { codex: resolveWorkerSettings("codex", undefined, undefined), claude: resolveWorkerSettings("claude", undefined, undefined) } }, null, 2) + "\n");
      } else if (sub === "set" && agent && field && value !== undefined && rest.length === 4) setWorkerSettings(agent, field, value);
      else if (sub === "reset" && agent && field && rest.length === 3) setWorkerSettings(agent, field, undefined);
      else throw new UsageError("pace worker show | set <도구> <model|effort> <값> | reset <도구> <model|effort>");
      return 0;
    }
    case "test": {
      const result = await executeTest(process.cwd(), rest);
      process.stdout.write(result.text + "\n");
      return result.code;
    }
    case "project":
      return projectCommand(rest);
    case "agent":
      return agentCommand(rest);
    case "daemon":
      try { return await daemonCommand(rest); } catch (error) { if (error instanceof DaemonUsageError) throw new UsageError(error.message); throw error; }
    case "mcp":
      return mcpCommand(rest);
    case "workspace":
      return workspaceCommand(rest);
    case "adopt":
      return adoptCommand(rest);
    case "scout":
      return scoutCommand(rest);
    case "intent":
      return intentCommand(rest);
    case "onboard":
      return onboardCommandLine(rest);
    case "install":
    case "uninstall":
      return installCommand(command, rest, deps);
    case "--version":
    case "-v":
      process.stdout.write(`${readVersion()}\n`);
      return 0;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(`${HELP}\n`);
      return 0;
    default:
      throw new UsageError(`알 수 없는 명령: ${command}`);
  }
}

async function mcpCommand(args: string[]): Promise<number> {
  const usage = "pace mcp --workspace <경로> --access read-only|write";
  let values: { workspace?: string; access?: string };
  try {
    values = parseArgs({ args, options: { workspace: { type: "string" }, access: { type: "string" } }, strict: true }).values;
  } catch (error) {
    throw new UsageError(`${usage} (${(error as Error).message})`);
  }
  if (!values.workspace || (values.access !== "read-only" && values.access !== "write")) throw new UsageError(usage);
  let server: PaceMcpServer;
  try {
    server = new PaceMcpServer({ workspace: resolve(values.workspace), access: values.access });
  } catch (error) {
    throw new UsageError(`${error instanceof Error ? error.message : String(error)}`);
  }
  await serveStdio(server, process.stdin, process.stdout);
  return 0;
}

function adoptCommand(args: string[]): number {
  const usage = "pace adopt opal [--cwd <폴더>] [--apply]";
  const [what, ...rest] = args;
  if (what !== "opal") throw new UsageError(usage);
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { cwd: { type: "string" }, apply: { type: "boolean" } } });
  if (positionals.length > 0) throw new UsageError(usage);
  const root = resolve(values.cwd ?? process.cwd());
  const plan = planAdoptOpal(root, paceHome());
  const result = values.apply && plan.blockers.length === 0 ? applyAdoptOpal(root, paceHome(), plan) : plan;
  const out = formatPlan(result, Boolean(values.apply));
  process.stdout.write(out + "\n");
  return result.blockers.length ? 1 : 0;
}

function workspaceCommand(args: string[]): number {
  const [sub, ...rest] = args;
  if (sub === "list" && rest.length === 0) {
    const { active: entries, invalid } = inspectWorkspaces(paceHome(), AGENT_BUDGET);
    for (const entry of entries) process.stdout.write(`${entry.name} · ${entry.path} · ${entry.id}\n`);
    if (entries.length === 0) process.stdout.write("등록된 워크스페이스 없음\n");
    for (const id of invalid) process.stdout.write(`주의: ${id}의 AGENT 정의 또는 경로를 확인할 수 없다.\n`);
    return 0;
  }
  if (sub === "move" && rest.length === 2) {
    const entry = relocateWorkspace(paceHome(), rest[0]!, resolve(rest[1]!), AGENT_BUDGET);
    process.stdout.write(`워크스페이스 위치 변경: ${entry.name} · ${entry.path}\n`);
    return 0;
  }
  if (sub === "register") {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { name: { type: "string" }, summary: { type: "string" } } });
    if (positionals.length !== 1) throw new UsageError("pace workspace register <경로> [--name <이름>] [--summary <요약>]");
    const path = resolve(positionals[0]!);
    const entry = registerWorkspace(paceHome(), { path, name: values.name ?? basename(path), summary: values.summary ?? "" }, AGENT_BUDGET);
    process.stdout.write(`워크스페이스 등록: ${entry.name} · ${entry.id}\n`);
    const ignored = spawnSync("git", ["-C", entry.path, "check-ignore", "-q", ".pace/AGENT.md"], { timeout: 2000 });
    if (ignored.status === 0) process.stdout.write("주의: .pace/AGENT.md가 git에서 무시된다 — .gitignore의 .pace/ 제외를 .pace/*로 좁히고 !.pace/AGENT.md 예외를 추가한 뒤 git check-ignore로 확인하세요.\n");
    return 0;
  }
  throw new UsageError("pace workspace register <경로> [--name <이름>] [--summary <요약>] | list | move <ID> <경로>");
}

export class UsageError extends Error {}

/** 훅에서 호출된다. 어떤 오류도 세션 시작을 막지 않도록 항상 0으로 끝내고 경고만 주입한다. */
async function boot(args: string[]): Promise<number> {
  let textOutput = false;
  let host: Host = "plain";
  // 인자 오류 때도 지정된 호스트가 확인되면 해당 훅 형식으로 경고한다.
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") break;
    if (arg === "--text") textOutput = true;
    const hint = arg === "--host" ? args[++i] : arg.startsWith("--host=") ? arg.slice(7) : undefined;
    if (hint !== undefined) {
      try { host = assertHost(hint); } catch { host = "plain"; }
    }
  }
  try {
    const { values } = parseArgs({
      args,
      options: { host: { type: "string", default: "plain" }, cwd: { type: "string" }, text: { type: "boolean", default: false } },
    });
    host = assertHost(str(values.host) ?? "plain");
    textOutput = values.text === true;
    if (process.env.PACE_AGENT_CHILD === "1") {
      process.stdout.write(`${textOutput ? "[PACE-BOOT] pace agent가 호출한 자식 세션 — 부트 생략" : formatForHost(host, "[PACE-BOOT] pace agent가 호출한 자식 세션 — 부트 생략")}\n`);
      return 0;
    }
    const argCwd = str(values.cwd);
    const rawHook = argCwd || host === "plain" || textOutput ? "" : await readStdin(500);
    const hookCwd = host === "antigravity" ? cwdFromAntigravityHookInput(rawHook) : cwdFromHookInput(rawHook);
    // 다중 워크스페이스에서 임의 프로젝트를 선택하지 않는다.
    const cwd = argCwd ?? hookCwd ?? (host === "antigravity" ? homedir() : process.cwd());
    const home = paceHome();
    const context = buildBootContext({ home, cwd, host });
    process.stdout.write(`${textOutput ? context : formatForHost(host, context, bootNotice({ home, cwd }))}\n`);
  } catch (error) {
    const message = `[PACE-BOOT] 부트 실패: ${(error as Error).message} — 사용자에게 \`pace boot --host plain\`으로 확인하라고 알려라.`;
    process.stdout.write(`${textOutput ? message : formatForHost(host, message, "PACE ▸ 부트 실패 — pace boot --host plain 으로 확인")}\n`);
  }
  return 0;
}

async function profile(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const home = paceHome();
  switch (sub) {
    case "create": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          "display-name": { type: "string" },
          alias: { type: "string" },
          owner: { type: "string" },
          tone: { type: "string" },
          personality: { type: "string" },
          language: { type: "string" },
          clone: { type: "string" },
        },
      });
      const name = positionals[0];
      if (!name) throw new UsageError("프로필 이름이 필요하다: pace profile create <이름>");
      if (values.clone) {
        const dir = cloneProfile(home, values.clone, name, {
          displayName: values["display-name"],
          alias: values.alias,
        });
        process.stdout.write(`프로필 생성(복제: ${values.clone}, 메모리는 비움): ${dir}\n`);
        return 0;
      }
      const input = await collectProfileInput(name, values);
      const dir = createProfile(home, input);
      const isDefault = getDefaultProfile(home) === name;
      process.stdout.write(`프로필 생성: ${dir}${isDefault ? " (기본 프로필)" : ""}\n`);
      return 0;
    }
    case "questions": {
      const questions = onboardingQuestions();
      process.stdout.write(rest.includes("--json") ? `${JSON.stringify(questions, null, 2)}\n` : `${formatQuestionsMarkdown(questions)}\n`);
      return 0;
    }
    case "list": {
      const current = resolveProfileName(home);
      const names = listProfiles(home);
      if (names.length === 0) process.stdout.write("프로필 없음 — pace profile create <이름>\n");
      for (const name of names) process.stdout.write(`${name === current ? "*" : " "} ${name}\n`);
      return 0;
    }
    case "use": {
      const name = rest[0];
      if (!name) throw new UsageError("pace profile use <이름>");
      setDefaultProfile(home, name);
      process.stdout.write(`기본 프로필: ${name}\n`);
      return 0;
    }
    case "show": {
      const p = loadProfile(home, requireProfileName(home, rest[0]));
      process.stdout.write(`${p.soul.trim()}\n`);
      return 0;
    }
    case "path": {
      process.stdout.write(`${profileDir(home, requireProfileName(home, rest[0]))}\n`);
      return 0;
    }
    default:
      throw new UsageError("pace profile create|questions|list|show|use|path");
  }
}

async function memory(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      project: { type: "boolean" },
      profile: { type: "string" },
      cwd: { type: "string" },
      type: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      body: { type: "string" },
      due: { type: "string" },
      result: { type: "string" },
      force: { type: "boolean" },
    },
  });
  const guard = { force: values.force === true };
  const scope: Scope = values.project ? "project" : "profile";
  const home = paceHome();
  const dir =
    scope === "project"
      ? projectMemoryDir(projectRootForMemory(values.cwd ?? process.cwd()))
      : profileMemoryDir(loadProfile(home, requireProfileName(home, values.profile)).dir);
  const flag = scope === "project" ? " --project" : "";
  // 에이전트 셸에서 표준입력이 열린 채 남을 수 있으므로 `--body -`일 때만 읽는다.
  const body = values.body === "-" ? await readStdin(0) : values.body;
  switch (sub) {
    case "add": {
      if (!values.type || !values.name || !values.description) {
        throw new UsageError(`pace memory add${flag} --type ${memoryTypes(scope).join("|")} --name <제목> --description <요약> [--body <내용>|-] [--due YYYY-MM-DD] [--force]`);
      }
      const entry = addMemory(dir, scope, {
        type: assertMemoryType(scope, values.type),
        name: values.name,
        description: values.description,
        due: values.due,
        body,
      }, guard);
      process.stdout.write(`기억 추가: ${entry.slug}\n`);
      return 0;
    }
    case "update": {
      const slug = requireArg(positionals[0], "pace memory update <slug> [...]");
      const entry = updateMemory(dir, scope, slug, {
        name: values.name,
        description: values.description,
        type: values.type === undefined ? undefined : assertMemoryType(scope, values.type),
        due: values.due,
        body,
      }, guard);
      process.stdout.write(`기억 수정: ${entry.slug}\n`);
      return 0;
    }
    case "done": {
      const slug = requireArg(positionals[0], `pace memory done${flag} <slug> [--result <결과>]`);
      const entry = completeMemory(dir, scope, slug, values.result);
      process.stdout.write(`완료 처리: ${entry.name} (이력에 기록)\n`);
      return 0;
    }
    case "status": {
      if (scope !== "project") throw new UsageError("진행 상황은 프로젝트 메모리다: pace memory status --project [--body <내용>]");
      if (body === undefined) {
        try {
          process.stdout.write(`${readMemory(dir, "status").body}\n`);
        } catch {
          process.stdout.write("진행 상황 없음\n");
        }
        return 0;
      }
      setStatus(dir, body);
      process.stdout.write("진행 상황 갱신\n");
      return 0;
    }
    case "remove": {
      const slug = requireArg(positionals[0], "pace memory remove <slug>");
      removeMemory(dir, scope, slug);
      process.stdout.write(`기억 삭제: ${slug}\n`);
      return 0;
    }
    case "show": {
      const entry = readMemory(dir, requireArg(positionals[0], "pace memory show <slug>"));
      process.stdout.write(`# ${entry.name} (${entry.type})\n${entry.description}${entry.due ? ` · 마감 ${entry.due}` : ""}\n\n${entry.body}\n`);
      return 0;
    }
    case "list": {
      for (const e of listMemories(dir)) process.stdout.write(`${e.slug}\t${e.type}\t${e.description}\n`);
      return 0;
    }
    case "index": {
      process.stdout.write(rebuildMemoryIndex(dir, scope));
      return 0;
    }
    default:
      throw new UsageError("pace memory add|update|done|status|remove|show|list|index [--project]");
  }
}

async function brain(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      limit: { type: "string" },
      budget: { type: "string" },
      list: { type: "boolean" },
      type: { type: "string" },
      tag: { type: "string" },
      "include-draft": { type: "boolean" },
      fix: { type: "boolean" },
      title: { type: "string" },
      summary: { type: "string" },
      tags: { type: "string" },
      sources: { type: "string" },
      "append-sources": { type: "string" },
      related: { type: "string" },
      body: { type: "string" },
      "body-file": { type: "string" },
      file: { type: "string" },
      status: { type: "string" },
      force: { type: "boolean" },
      note: { type: "string" },
      op: { type: "string" },
      source: { type: "string" },
    },
  });
  const cwd = values.cwd ?? process.cwd();
  const csv = (v: string | undefined) => (v === undefined ? undefined : v.split(",").map((x) => x.trim()).filter(Boolean));
  const num = (v: string | undefined) => (v === undefined ? undefined : Number.parseInt(v, 10) || undefined);
  const readBody = async () =>
    values["body-file"] ? readFileSync(values["body-file"], "utf8") : values.body === "-" ? await readStdin(0) : values.body;
  const report = (r: { page: string; lint: { issues: LintIssue[]; fixed: string[] } }, verb: string) => {
    process.stdout.write(`${verb}: ${r.page}\n${formatLint(r.lint)}\n전체 점검은 pace brain lint\n`);
    return r.lint.issues.some((i) => i.severity === "error") ? 1 : 0;
  };
  switch (sub) {
    case "init": {
      const { root, created } = initBrain(findBrainRoot(cwd) ?? findProjectRoot(cwd));
      process.stdout.write(`${created ? "브레인 생성" : "이미 있음"}: ${root}/.pace/brain\n`);
      return 0;
    }
    case "add": {
      if (!values.type || !values.title || !values.summary) {
        throw new UsageError(
          "pace brain add --type concept|entity|flow|synthesis|term --title <제목> --summary <한 줄> --body <본문>|--body-file <파일>|--body - [--tags a,b] [--sources a,b] [--related a,b] [--file <이름>]",
        );
      }
      const body = (await readBody()) ?? "";
      const root = requireBrainRoot(cwd);
      const input = {
        type: values.type,
        title: values.title,
        summary: values.summary,
        body,
        tags: csv(values.tags),
        sources: csv(values.sources),
        related: csv(values.related),
        file: values.file,
        status: values.status,
      };
      return report(addPage(root, input, { force: values.force, note: values.note }), "페이지 추가");
    }
    case "update": {
      const ref = requireArg(positionals[0], "pace brain update <페이지> [--title --summary --body|--body-file --tags --sources --append-sources --related --status]");
      const root = requireBrainRoot(cwd);
      const patch = {
        title: values.title,
        summary: values.summary,
        body: await readBody(),
        tags: csv(values.tags),
        sources: csv(values.sources),
        appendSources: csv(values["append-sources"]),
        related: csv(values.related),
        status: values.status,
      };
      return report(updatePage(root, ref, patch, { force: values.force, note: values.note }), "페이지 수정");
    }
    case "lint": {
      const result = lintBrain(requireBrainRoot(cwd), { fix: values.fix });
      process.stdout.write(`${formatLint(result)}\n`);
      return result.issues.some((i) => i.severity === "error") ? 1 : 0;
    }
    case "index": {
      // 목차는 lint를 거친다. 오류가 있으면 목차는 갱신하되 실패로 끝내 고치게 한다.
      const root = requireBrainRoot(cwd);
      const result = lintBrain(root);
      rebuildBrainIndex(root);
      process.stdout.write(`목차 갱신: ${root}/.pace/brain/index.md\n${formatLint(result)}\n`);
      return result.issues.some((i) => i.severity === "error") ? 1 : 0;
    }
    case "search": {
      const query = positionals.join(" ");
      if (query.trim().length === 0) {
        throw new UsageError('pace brain search "<질의 — 한국어·영어·동의어를 섞어>" [--list] [--type T] [--tag X] [--limit N] [--budget 글자수]');
      }
      const root = requireBrainRoot(cwd);
      const result = searchBrain(root, query, {
        list: values.list,
        type: values.type,
        tag: values.tag,
        limit: num(values.limit),
        budget: num(values.budget),
        includeDraft: values["include-draft"],
      });
      process.stdout.write(`${formatSearch(root, result, values.list ?? false)}\n`);
      return 0;
    }
    case "log": {
      if (!values.op || !["ingest", "update", "lint", "query"].includes(values.op) || !values.summary) {
        throw new UsageError("pace brain log --op <ingest|update|lint|query> --summary <요약>");
      }
      appendLog(requireBrainRoot(cwd), values.op, values.summary);
      process.stdout.write("기록 추가\n");
      return 0;
    }
    case "ingest-scan": {
      const root = requireBrainRoot(cwd);
      const source = (values.source ?? "all") as "docs" | "skills" | "backlogs" | "all";
      const items = ingestScan(root, source);
      const pending = items.filter((i) => !i.done);
      process.stdout.write(`ingest 후보 ${pending.length} / 전체 ${items.length} (이미 담음 ${items.length - pending.length})\n`);
      for (const i of items) process.stdout.write(`${i.done ? "  ✓" : "  ·"} [${i.kind}] ${i.path}\n`);
      return 0;
    }
    default:
      throw new UsageError("pace brain init|add|update|search|lint|index|log|ingest-scan");
  }
}

/**
 * pace project — 작업 하네스(new·start·task·check·done·finish·merge·list).
 * merge는 기본이 미리보기다. 사용자 승인 뒤 --yes로 실행한다.
 */
function projectCommand(args: string[]): number {
  const [sub, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      from: { type: "string" },
      yes: { type: "boolean" },
      base: { type: "string" },
      agent: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      json: { type: "boolean" },
      write: { type: "boolean" },
      type: { type: "string" },
      msg: { type: "string" },
      src: { type: "string" },
      ref: { type: "string" },
      by: { type: "string" },
      "no-launch": { type: "boolean" },
      launch: { type: "boolean" },
    },
  });
  const cwd = values.cwd ?? process.cwd();
  const out = (text: string) => process.stdout.write(`${text}\n`);
  const need = (n: number, usage: string) => {
    if (positionals.length < n) throw new UsageError(usage);
  };
  try {
    const repo = () => openRepo(cwd, values.base ?? "main");
    switch (sub) {
      case "new": {
        need(1, 'pace project new "<이름>" [--from <BL 폴더 또는 앞부분>]');
        const ref = newProject(repo(), positionals.join(" "), { from: values.from });
        refreshDashboard(repo().root);
        out(`프로젝트 생성: projects/${ref.dir}/PROJECT.md\n목적·재료·기준을 채우고 출처를 착수 결정으로 바로 실행: pace project start ${ref.id}`);
        return 0;
      }
      case "start": {
        need(1, "pace project start <P###>");
        const r = startProject(repo(), positionals[0]!, { launch: !values["no-launch"], relaunch: values.launch, agent: values.agent, model: values.model, effort: values.effort });
        if (!r.created && r.launch === null) {
          out(`이미 있음 — 이어서: ${r.ref.worktree} (작업자 세션을 다시 띄우려면 --launch)`);
          return 0;
        }
        out(r.created ? `worktree: ${r.ref.worktree} (브랜치 ${r.ref.branch})${r.setup ? `\n준비 명령: ${r.setup}` : ""}` : `이미 있음: ${r.ref.worktree}`);
        const launch = r.launch!;
        if (launch.status === "launched") {
          out(
            `작업자 세션: ${launch.detail}\n` +
              (orcaChatSession(process.env)
                ? "이 세션은 코디네이터다 — Orca 채팅 세션: 작업자가 보고하면 Orca가 깨운다, 폴링하지 말고 턴을 끝낸다\n"
                : "이 세션은 코디네이터다 — 질문을 기다려 답한다: orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json\n") +
              "판단 규칙: pace-project-dev 스킬 references/coordinator.md (크리티컬한 것은 사용자에게)",
          );
        } else if (launch.status === "unknown") {
          out(`작업자 세션 상태를 알 수 없다: ${launch.detail}`);
        } else if (launch.status === "failed") {
          out(`작업자 세션을 띄우지 못했다: ${launch.detail}\n직접 열기: ${launch.manual}`);
        } else {
          out(`작업자 세션: ${launch.detail}\n직접 열기: ${launch.manual}`);
        }
        return 0;
      }
      case "task": {
        need(2, 'pace project task <P###> "<이름>"');
        const r = addTask(repo(), positionals[0]!, positionals.slice(1).join(" "));
        out(`${r.ref.id} ${r.taskId}: ${r.path}`);
        return 0;
      }
      case "check": {
        need(2, "pace project check <P###> <T##>");
        const report = checkTask(repo(), positionals[0]!, positionals[1]!);
        out(formatReport(report));
        return report.ok ? 0 : 1;
      }
      case "done": {
        need(2, "pace project done <P###> <T##>");
        const report = doneTask(repo(), positionals[0]!, positionals[1]!);
        out(formatReport(report));
        return report.ok ? 0 : 1;
      }
      case "finish": {
        need(1, "pace project finish <P###>");
        const report = finishProject(repo(), positionals[0]!);
        out(formatReport(report));
        return report.ok ? 0 : 1;
      }
      case "merge": {
        need(1, "pace project merge <P###> [--yes]");
        const r = repo();
        const plan = planMerge(r, positionals[0]!, values.yes);
        out(`${plan.ref.id} ${plan.ref.name} — 병합할 커밋 ${plan.commits.length}개\n${plan.commits.map((c) => `  ${c}`).join("\n")}${plan.summary ? `\n\n${plan.summary}` : ""}`);
        if (!values.yes) {
          out("\n(미리보기 — 아무것도 바꾸지 않았다. 사용자 승인 뒤 --yes로 병합한다)");
          return 0;
        }
        out(`\n${applyMerge(r, plan).map((d) => `- ${d}`).join("\n")}`);
        return 0;
      }
      case "log": {
        need(1, "pace project log <P###> [T##] --type <종류> --msg <한 줄> [--src 출처] [--ref 파일]");
        if (!values.type || !values.msg) throw new UsageError("log는 --type과 --msg가 필요하다");
        const r = repo(); const ref = findProject(r, positionals[0]!); const owner = statsRepo(r, ref);
        const result = agentEvent(join(owner.root, "projects", ref.dir), { p: ref.id, t: positionals[1]?.toUpperCase(), type: values.type, msg: values.msg, src: values.src, ref: values.ref, by: values.by });
        out(result.recorded ? result.duplicate ? "이미 기록됨 (결정 표 동기화)" : "사건 기록" : "경고: 사건을 기록하지 못했다");
        return 0;
      }
      case "stats": {
        need(1, "pace project stats <P###> [--json|--write]");
        const r = repo();
        const ref = findProject(r, positionals[0]!);
        if (values.write) {
          refreshProjectMetrics(statsRepo(r, ref), ref);
          out(`지표 갱신: projects/${ref.dir}/METRICS.md · projects/METRICS.md (커밋은 하지 않는다)`);
          return 0;
        }
        const stats = collectDashboard(statsRepo(r, ref), ref);
        out(values.json ? JSON.stringify(stats, null, 2) : formatDashboard(stats));
        return 0;
      }
      case "list":
        out(formatList(listProjects(repo())));
        return 0;
      default:
        throw new UsageError("pace project new|start|task|check|done|finish|merge|log|stats|list");
    }
  } catch (error) {
    if (!(error instanceof HarnessError) && !(error instanceof BacklogError) && !(error instanceof ProjectLogError)) throw error;
    process.stderr.write(`pace: ${error.message}\n`);
    return 1;
  }
}

/** pace onboard [--with <도구>] [-- <도구 옵션>]: 온보딩 첫 메시지를 넣은 채로 LLM CLI를 연다. */
function onboardCommandLine(args: string[]): number {
  const split = args.indexOf("--");
  const own = split === -1 ? args : args.slice(0, split);
  const extra = split === -1 ? [] : args.slice(split + 1);
  const { values } = parseArgs({ args: own, options: { with: { type: "string" } } });
  const tool = values.with ?? detectTool();
  if (tool === null || tool === undefined) throw new UsageError(`LLM CLI를 찾지 못했다 (${ONBOARD_TOOLS.join(", ")})`);
  if (!isOnboardTool(tool)) throw new UsageError(`--with는 ${ONBOARD_TOOLS.join(" | ")} 중 하나: "${tool}"`);
  return launch(tool, extra, paceHome());
}

function readInstallRecord(home: string): { claudeDirs: string[]; codexDirs: string[] } {
  try {
    const record = JSON.parse(readFileSync(`${home}/install.json`, "utf8")) as { claudeDirs?: string[]; codexDirs?: string[] };
    return { claudeDirs: record.claudeDirs ?? [], codexDirs: record.codexDirs ?? [] };
  } catch {
    return { claudeDirs: [], codexDirs: [] };
  }
}

function installCommand(command: "install" | "uninstall", args: string[], deps: MainDeps = {}): number {
  const { values } = parseArgs({
    args,
    options: {
      "dry-run": { type: "boolean" },
      "claude-dir": { type: "string", multiple: true },
      "codex-dir": { type: "string", multiple: true },
    },
  });
  // 직접 지정했던 계정 폴더는 install.json에 남아 다음 설치·업데이트에도 쓴다(이름 규칙으로 못 찾는 폴더 대비).
  const previous = readInstallRecord(paceHome());
  const options = {
    home: homedir(),
    dataHome: paceHome(),
    dryRun: values["dry-run"] ?? false,
    claudeDirs: [...previous.claudeDirs, ...(values["claude-dir"] ?? [])],
    codexDirs: [...previous.codexDirs, ...(values["codex-dir"] ?? [])],
  };
  const actions = command === "install" ? install(options) : uninstall(options);
  const tag = options.dryRun ? "[미리보기] " : "";
  for (const a of actions) process.stdout.write(`${tag}${a.kind.padEnd(5)} ${a.path}\n      ${a.detail}\n`);
  if (actions.length === 0) process.stdout.write("바꿀 것 없음\n");
  if (command === "install" && !options.dryRun) {
    // daemon이 이미 등록돼 있을 때만 실행 경로를 새 설치본으로 바꾼다. 등록이 없으면 아무것도 하지 않는다
    try {
      const line = refreshAutostart({ platform: process.platform, runner: runCommand, home: paceHome(), defaultHome: defaultDataHome(), nodePath: process.execPath, binPath: join(homedir(), ".pace", "app", "bin", "pace.ts"), ...deps.autostart });
      if (line) process.stdout.write(`${line}\n`);
    } catch (error) { process.stdout.write(`daemon 등록 경로 갱신에 실패했다(설치는 끝났다): ${(error as Error).message}\n`); }
  }
  // 설치 스크립트는 다음 단계를 직접 안내·실행하므로 중복 안내하지 않는다.
  if (command === "install" && !options.dryRun && process.env.PACE_FROM_SCRIPT !== "1") {
    process.stdout.write(
      [
        "",
        "다음 단계:",
        "  1. pace onboard   — LLM CLI를 열어 바로 에이전트 온보딩 (프로필이 없을 때)",
        "  2. Codex는 처음 열 때 새 SessionStart 훅을 /hooks 에서 신뢰 승인",
        "",
      ].join("\n"),
    );
  }
  return 0;
}

async function collectProfileInput(
  name: string,
  values: Record<string, string | boolean | undefined>,
): Promise<ProfileInput> {
  const given = {
    displayName: str(values["display-name"]),
    alias: str(values.alias),
    ownerName: str(values.owner),
    tone: str(values.tone),
    personality: str(values.personality),
    language: str(values.language),
  };
  // 값을 하나도 주지 않았고 터미널이면 인터뷰한다. 에이전트 세션은 값을 모두 인자로 넘긴다.
  const noFlags = Object.values(given).every((v) => v === undefined);
  if (noFlags && process.stdin.isTTY === true) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await runOnboarding(name, { ask: (q) => rl.question(q), print: (t) => process.stdout.write(`${t}\n`) });
    } finally {
      rl.close();
    }
  }
  return {
    name,
    displayName: given.displayName ?? name,
    alias: given.alias ?? given.displayName ?? name,
    ownerName: given.ownerName ?? "사용자",
    tone: given.tone ?? "존댓말 + 친근",
    personality: given.personality ?? describeTraits(["꼼꼼함", "솔직함", "차분함"]),
    language: given.language ?? "ko",
  };
}

function requireProfileName(home: string, explicit: string | undefined): string {
  const name = explicit ?? resolveProfileName(home);
  if (!name) throw new UsageError("프로필이 없다 — pace profile create <이름>");
  return name;
}

function requireBrainRoot(cwd: string): string {
  const root = findBrainRoot(cwd);
  if (!root) throw new UsageError("이 위치에 프로젝트 브레인이 없다 — pace brain init");
  return root;
}

function requireArg(value: string | undefined, usage: string): string {
  if (!value) throw new UsageError(usage);
  return value;
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 표준입력이 파이프일 때만 읽는다. timeoutMs > 0이면 그 시간 안에 끝나지 않는 입력은 버린다. */
async function readStdin(timeoutMs: number): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  const reading = (async () => {
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  })();
  if (timeoutMs <= 0) return reading;
  const timeout = new Promise<string>((resolve) =>
    setTimeout(() => {
      process.stdin.destroy(); // 닫히지 않는 입력이 프로세스 종료를 막지 않게 한다.
      resolve(Buffer.concat(chunks).toString("utf8"));
    }, timeoutMs).unref(),
  );
  return Promise.race([reading, timeout]);
}

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(`${packageRoot}package.json`, "utf8")) as { version: string };
  return pkg.version;
}

async function agentCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === "verify") return agentVerify(rest);
  if (sub === "review-note") return agentReviewNote(rest);
  if (sub === "setup") return agentSetup(rest);
  if (sub !== "run") throw new UsageError("pace agent run|setup|verify|review-note …");
  const { values } = parseArgs({
    args: rest,
    options: {
      agent: { type: "string" }, mode: { type: "string" }, "prompt-file": { type: "string" }, cwd: { type: "string" },
      "system-prompt-file": { type: "string" }, model: { type: "string" }, effort: { type: "string" }, write: { type: "boolean" },
      "timeout-ms": { type: "string" }, resume: { type: "string" }, "raw-dir": { type: "string" }, chain: { type: "string" }, "chain-file": { type: "string" },
    },
    strict: true,
  });
  if (values.chain !== undefined && (values.agent !== undefined || values.mode !== undefined || values.model !== undefined || values.effort !== undefined || values.resume !== undefined || values["system-prompt-file"] !== undefined)) {
    throw new UsageError("--chain은 --agent·--mode·--model·--effort·--resume·--system-prompt-file과 함께 쓸 수 없다(단계에 정의한다)");
  }
  if (values["chain-file"] !== undefined && values.chain === undefined) throw new UsageError("--chain-file은 --chain과 함께 쓴다");
  if (values.chain !== undefined) return agentChainRun(values);
  try {
    const promptFile = str(values["prompt-file"]);
    const sysFile = str(values["system-prompt-file"]);
    const prompt = promptFile ? readFileSync(promptFile, "utf8") : await readStdin(0);
    const timeout = str(values["timeout-ms"]);
    const request = validateRequest({
      agent: str(values.agent), mode: str(values.mode), prompt, cwd: str(values.cwd) ?? process.cwd(),
      systemPrompt: sysFile ? readFileSync(sysFile, "utf8") : undefined,
      model: str(values.model), effort: str(values.effort), access: values.write ? "write" : "read-only",
      timeoutMs: timeout === undefined ? undefined : Number(timeout), resume: str(values.resume), rawDir: str(values["raw-dir"]),
    });
    const executor = findExecutor(request.agent, request.mode);
    if (!executor) throw new AgentError("executor_unavailable", `${request.agent}/${request.mode} 실행기가 아직 없다`);
    process.stdout.write(JSON.stringify(await runAgent(executor, request), null, 2) + "\n");
    return 0;
  } catch (error) {
    if (!(error instanceof AgentError)) throw error;
    process.stdout.write(JSON.stringify(errorPayload(error), null, 2) + "\n");
    process.stderr.write(`${error.code}: ${error.message}\n`);
    return error.exitCode;
  }
}

async function agentSetup(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { agents: { type: "string" }, yes: { type: "boolean" }, login: { type: "boolean" }, "install-adapters": { type: "boolean" } }, strict: true });
  const out = (line: string) => { process.stdout.write(`${line}\n`); };
  try {
    const outcome = await runAgentSetup(terminalSetupDeps(out), { agents: values.agents?.split(",").map((x) => x.trim()).filter(Boolean), yes: values.yes, login: values.login, installAdapters: values["install-adapters"] });
    return outcome.code;
  } catch (error) {
    if (error instanceof SetupUsageError) throw new UsageError(error.message);
    throw error;
  }
}

async function agentChainRun(values: { chain?: string; "chain-file"?: string; "prompt-file"?: string; cwd?: string; write?: boolean; "timeout-ms"?: string; "raw-dir"?: string }): Promise<number> {
  try {
    const home = paceHome();
    let file = str(values["chain-file"]);
    if (!file) {
      const profile = resolveProfileName(home);
      if (!profile) throw new ChainConfigError("프로필이 없어 체인 설정 위치를 정할 수 없다 — --chain-file을 주거나 프로필을 만든다");
      file = defaultChainFile(profileDir(home, profile));
    }
    const config = loadChainConfig(file);
    const chain = resolveChain(config, String(values.chain));
    const { warnings } = checkChain(chain, findExecutor);
    const promptFile = str(values["prompt-file"]);
    const prompt = promptFile ? readFileSync(promptFile, "utf8") : await readStdin(0);
    const timeout = str(values["timeout-ms"]);
    const outcome = await runChain(chain, {
      prompt, cwd: str(values.cwd) ?? process.cwd(), access: values.write ? "write" : "read-only",
      timeoutMs: timeout === undefined ? undefined : Number(timeout), rawDir: str(values["raw-dir"]),
    }, { find: findExecutor, cooldowns: fileCooldownStore(join(home, "agent-cooldowns.json")), limitPatterns: config.limitPatterns });
    process.stdout.write(JSON.stringify({ ...outcome, definition_warnings: warnings }, null, 2) + "\n");
    return outcomeExitCode(outcome);
  } catch (error) {
    if (error instanceof ChainConfigError) {
      process.stdout.write(JSON.stringify({ is_error: true, error: { code: "invalid_request", message: error.message } }, null, 2) + "\n");
      process.stderr.write(`invalid_request: ${error.message}\n`);
      return 2;
    }
    if (!(error instanceof AgentError)) throw error;
    process.stdout.write(JSON.stringify(errorPayload(error), null, 2) + "\n");
    process.stderr.write(`${error.code}: ${error.message}\n`);
    return error.exitCode;
  }
}

/** 교차 검증: 작성자와 다른 제공자의 에이전트가 산출물을 읽기 전용으로 검토. 미실행이면 종료 10과 질문 문구, 반복 실패 단계면 종료 16(P007). */
function agentVerify(args: string[]): Promise<number> {
  return verifyCommand(args, { executors: allExecutors, write: (t) => process.stdout.write(t) });
}

function agentReviewNote(args: string[]): Promise<number> {
  return reviewNoteCommand(args, { executors: allExecutors, write: (t) => process.stdout.write(t) });
}

function backlogRoot(current: string): string | null {
  try { assertSafeGitPath(current); } catch (error) { throw new BacklogError(error instanceof Error ? error.message : String(error)); }
  const version = spawnSync("git", ["--version"], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (version.error || version.status !== 0) throw new BacklogError(`Git을 실행할 수 없습니다: ${version.error?.message ?? (version.stderr || "git --version 실패").trim()}`);
  let directory = current;
  let markerFound = false;
  for (;;) {
    const markerPath = join(directory, ".git");
    try {
      const marker = lstatSync(markerPath);
      markerFound = true;
      if (marker.isSymbolicLink() || (!marker.isDirectory() && !marker.isFile())) throw new BacklogError(`손상되었거나 안전하지 않은 Git 경로입니다: ${markerPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  const resolved = spawnSync("git", ["-c", "core.quotepath=false", "-C", current, "rev-parse", "--show-toplevel"], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (resolved.status === 0) {
    const output = resolved.stdout.endsWith("\n") ? resolved.stdout.slice(0, -1) : resolved.stdout;
    if (output.length > 0) {
      try { assertSafeGitPath(output); } catch (error) { throw new BacklogError(error instanceof Error ? error.message : String(error)); }
      return realpathSync(output);
    }
  }
  const configured = ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"].some(key => Boolean(process.env[key]));
  const detail = (resolved.stderr || resolved.error?.message || "").trim();
  if (!markerFound && !configured && /not a git repository/i.test(detail)) return null;
  throw new BacklogError(`Git 저장소 조회에 실패했습니다${detail ? `: ${detail}` : ""}. 기존 .git 경로와 권한을 확인하세요.`);
}

function backlogCommand(args: string[]): number {
  const [sub, ...rest] = args;
  if (sub === "new" && rest.length === 1 && (rest[0] === "--help" || rest[0] === "-h")) {
    process.stdout.write('사용법: pace backlog new "<이름>"\n');
    return 0;
  }
  try {
    try { assertSafeGitPath(process.cwd()); } catch (error) { throw new BacklogError(error instanceof Error ? error.message : String(error)); }
    const current = realpathSync(process.cwd());
    if (sub === "init" && rest.length === 0) {
      let root = backlogRoot(current);
      let createdRoot: string | null = null;
      try {
        if (root === null) {
          const home = realpathSync(homedir());
          if (isProtectedInitTarget(current, home)) throw new BacklogError(`안전 경계 때문에 HOME 또는 파일시스템 루트에는 새 Git 저장소를 초기화할 수 없습니다: ${current}`);
          const initialized = spawnSync("git", ["-C", current, "init"], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
          if (initialized.status !== 0) throw new BacklogError(`Git 저장소를 초기화하지 못했습니다: ${(initialized.stderr || initialized.error?.message || "git init 실패").trim()}`);
          createdRoot = current;
          root = backlogRoot(current);
          if (root === null) throw new BacklogError("git init 후에도 저장소 루트를 찾지 못했습니다.");
        }
        const message = initDashboard(root);
        process.stdout.write(`${message} · 대시보드: ${join(root, "backlogs/README.html")}\n`);
        return 0;
      } catch (error) {
        if (createdRoot !== null) throw new BacklogError(`새 Git 저장소를 초기화했습니다: ${createdRoot}. 대시보드 생성은 실패했으며 Git 저장소와 사용자 파일은 보존했습니다. 문제를 확인한 뒤 pace backlog init으로 재시도하세요. 원인: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
    if (sub === "refresh" && rest.length === 0) {
      const root = backlogRoot(current);
      if (root === null) {
        process.stdout.write("Git 저장소가 없어 대시보드 갱신을 건너뛰었습니다. 최초 생성은 opi 마무리 또는 `pace backlog init`으로 실행하세요.\n");
        return 0;
      }
      const presence = dashboardPresence(root);
      if (presence === "absent") {
        process.stdout.write("백로그 대시보드가 없어 갱신을 건너뛰었습니다. 최초 생성은 opi 마무리 또는 `pace backlog init`으로 실행하세요.\n");
        return 0;
      }
      if (presence === "partial") throw new BacklogError("백로그 대시보드가 부분 설치 상태라 갱신하지 않았습니다. 기존 파일을 보존했습니다. `pace backlog init`으로 복구를 확인하세요.");
      const refreshed = generateDashboard(root, false);
      if (refreshed === null) process.stdout.write("백로그 대시보드가 없어 갱신을 건너뛰었습니다. 최초 생성은 opi 마무리 또는 `pace backlog init`으로 실행하세요.\n");
      else process.stdout.write(`${refreshed}\n`);
      return 0;
    }
    const repo = openRepo(process.cwd());
    let path: string;
    if (sub === "new" && rest.length > 0) path = newBacklog(repo, rest.join(" "));
    else if (sub === "brief" && rest.length > 1) path = newBrief(repo, rest[0]!, rest.slice(1).join(" "));
    else throw new UsageError('pace backlog new "<이름>" | brief <BL> "<이름>"');
    refreshDashboard(repo.root);
    process.stdout.write(`${path}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof BacklogError) && !(error instanceof HarnessError)) throw error;
    process.stderr.write(`pace: ${error.message}\n`);
    return 1;
  }
}

async function scoutCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      kind: { type: "string" },
      url: { type: "string" },
      title: { type: "string" },
      author: { type: "string" },
      published: { type: "string" },
      method: { type: "string" },
      body: { type: "string" },
      replace: { type: "string" },
      "allow-local": { type: "boolean" },
      offline: { type: "boolean" },
      via: { type: "string" },
      cdp: { type: "string" },
      chrome: { type: "string" },
    },
  });
  try {
    if (sub === "new" && positionals.length > 0) {
      const run = newRun(process.cwd(), positionals.join(" "), { home: paceHome(), out: values.out });
      if (run.fallback) process.stderr.write(`pace: backlogs/를 쓰지 않고 대체 위치에 만든다 — ${run.fallback}\n`);
      process.stdout.write(`${run.dir}\n`);
      return 0;
    }
    if (sub === "fetch" && positionals.length > 1) {
      const [dir, ...urls] = positionals;
      const failed = await fetchSources(dir!, urls, { kind: values.kind as SourceKind | undefined, allowLocal: values["allow-local"] }, {
        saved: (path) => process.stdout.write(`${path}\n`),
        note: (message) => process.stderr.write(`pace: ${message}\n`),
      });
      return failed > 0 ? 1 : 0;
    }
    if (sub === "add" && positionals.length === 1) {
      const dir = positionals[0]!;
      const previousSource = values.replace ? readSources(dir).find((s) => s.meta.id === values.replace) : undefined;
      const previous = previousSource?.meta;
      const url = values.url ?? previous?.url;
      const title = values.title ?? previous?.title;
      if (!url || !title) throw new UsageError("pace scout add: --url과 --title이 필요하다(--replace면 기존 값을 쓴다)");
      const input = values.body === undefined || values.body === "-" ? await readStdin(0) : values.body;
      // --replace에 본문을 주지 않으면 메타(발행일 등)만 고친다.
      const keep = previousSource !== undefined && input.trim() === "";
      if (values.method !== undefined && !["web-read", "pasted", "browser"].includes(values.method)) throw new UsageError("--method는 web-read·browser·pasted");
      const method = (values.method ?? (keep ? previous!.method : "web-read")) as SourceMethod;
      const kind = (values.kind ?? previous?.kind ?? guessKind(parseUrl(url))) as SourceKind;
      const body = keep ? previousSource.body : kind === "video" ? normalizeTranscript(input) : input;
      const meta = { url, title, author: values.author ?? previous?.author ?? "", published: values.published ?? previous?.published ?? "", accessed: today(), kind, method };
      process.stdout.write(`${saveSource(dir, meta, body, values.replace)}\n`);
      return 0;
    }
    if (sub === "render" && positionals.length === 1) {
      process.stdout.write(`${renderRun(positionals[0]!)}\n`);
      return 0;
    }
    if (sub === "transcript" && positionals.length === 2) {
      const via = values.via ?? "auto";
      if (!["auto", "orca", "agent-browser"].includes(via)) throw new UsageError("--via는 auto·orca·agent-browser");
      const path = transcriptFromBrowser(positionals[0]!, positionals[1]!, { via: via as "auto" | "orca" | "agent-browser", cdp: values.cdp, chrome: values.chrome }, (message) => process.stderr.write(`pace: ${message}\n`));
      process.stdout.write(`${path}\n`);
      return 0;
    }
    if (sub === "verify" && positionals.length === 1) {
      const outcome = await verifyRun(positionals[0]!, { offline: values.offline, allowLocal: values["allow-local"] });
      process.stdout.write(outcome.log);
      if (outcome.first && outcome.failed > 2) process.stderr.write(`pace: 첫 검사에서 실패한 검사 ${outcome.failed}개 — 땜질하지 말고 실패가 생긴 순서 단계를 진단해 보고하고 멈춘다(pace-scout 예외 사례)\n`);
      return outcome.failed > 0 ? 1 : 0;
    }
    if (sub === "card" && positionals.length === 2) {
      process.stdout.write(`${writeCard(positionals[0]!, positionals[1]!)}\n`);
      return 0;
    }
    if (sub === "schema" && positionals.length === 0) {
      process.stdout.write(`${schemaPath}\n`);
      return 0;
    }
    throw new UsageError('pace scout new "<주제>" [--out <폴더>] | fetch <폴더> <URL>… [--kind] [--allow-local] | add <폴더> --url --title [--author --published --kind --method web-read|browser|pasted --replace S#] [--body <글>|-] | render <폴더> | card <폴더> <I#> | transcript <폴더> <S#> [--via auto|orca|agent-browser] [--cdp <포트>] [--chrome <경로>] | verify <폴더> [--offline] [--allow-local] | schema');
  } catch (error) {
    if (!(error instanceof BacklogError) && !(error instanceof HarnessError) && !(error instanceof ScoutError)) throw error;
    process.stderr.write(`pace: ${error.message}\n`);
    return 1;
  }
}

function intentCommand(args: string[]): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { skill: { type: "string" }, check: { type: "boolean" }, root: { type: "string" }, "legacy-wireframe": { type: "boolean" }, verify: { type: "boolean" } },
  });
  const [sub] = positionals;
  const skill = values.skill;
  try {
    if (sub === 'preview' && positionals.length === 2) {
      if (values.verify) { verifyPreview(positionals[1]!); process.stdout.write('미리보기 검증 통과\n'); }
      else { createPreview(positionals[1]!, { root: values.root ?? process.cwd() }); process.stdout.write('미리보기 생성 완료\n'); }
      return 0;
    }
    if (sub === "lint") {
      const { lenses, problems } = loadLenses(skill);
      for (const p of problems) process.stderr.write(`${p.file}: ${p.message}\n`);
      process.stdout.write(`렌즈 ${lenses.length}개 · 문제 ${problems.length}개\n`);
      return problems.length === 0 ? 0 : 1;
    }
    if (sub === "index") {
      const result = writeLensIndex(skill, values.check === true);
      for (const p of result.problems) process.stderr.write(`${p.file}: ${p.message}\n`);
      if (result.problems.length > 0) return 1;
      if (values.check) {
        process.stdout.write(result.changed ? `INDEX.md가 렌즈 머리말과 다르다 — pace intent index로 다시 만든다\n` : "INDEX.md 최신\n");
        return result.changed ? 1 : 0;
      }
      process.stdout.write(`${result.path}${result.changed ? "" : " (변경 없음)"}\n`);
      return 0;
    }
    if (sub === "check" && positionals.length > 1) {
      let count = 0;
      for (const file of positionals.slice(1)) {
        if (!existsSync(file)) throw new IntentError(`파일이 없다: ${file}`);
        for (const p of checkHandoffFile(file)) {
          process.stderr.write(`${file}${p.line > 0 ? `:${p.line}` : ""}: ${p.message}\n`);
          count++;
        }
      }
      process.stdout.write(`인계 문서 ${positionals.length - 1}개 · 문제 ${count}개\n`);
      return count === 0 ? 0 : 1;
    }
    if ((sub === "render" || sub === "verify") && positionals.length === 2) {
      const docs = positionals[1]!;
      const options = { skillDir: skill, root: values.root ?? process.cwd(), legacyWireframe: values["legacy-wireframe"] === true };
      let checks: Check[];
      if (sub === "render") {
        const result = renderDocs(docs, options);
        if (!options.legacyWireframe && result.legacyAvailable) process.stdout.write("기존 wireframe.html이 있으면 보존 — 호환 렌더(--legacy-wireframe)는 해당 파일을 덮어쓴다\n");
        for (const file of result.files) process.stdout.write(`${file}\n`);
        process.stdout.write(`원본 ${result.bytes.plan}바이트 → HTML ${result.files.length}개 ${result.bytes.html}바이트\n`);
        checks = result.checks;
      } else checks = verifyDocs(docs, options);
      for (const c of checks) process.stdout.write(`${c.ok ? "✔" : "✘"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}\n`);
      const failed = checks.filter((c) => !c.ok).length;
      process.stdout.write(`증명 검사 ${checks.length - failed}/${checks.length} 통과\n`);
      return sub === "verify" && failed > 0 ? 1 : 0;
    }
    if (sub === "examples") {
      const stale = writeExamples(skill, values.check === true);
      for (const file of stale) process.stdout.write(`${values.check ? "어긋남" : "다시 만듦"}: ${file}\n`);
      if (values.check && stale.length > 0) return 1;
      if (stale.length === 0) process.stdout.write("example.html 최신\n");
      return 0;
    }
    throw new UsageError("pace intent index [--check] | lint [--skill <폴더>] | check <문서>… | render <docs> [--root] | verify <docs> [--root] | examples [--check]");
  } catch (error) {
    if (!(error instanceof IntentError)) throw error;
    process.stderr.write(`pace: ${error.message}\n`);
    return 1;
  }
}
