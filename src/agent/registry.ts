import { claudeAcp, codexAcp, createAcpExecutor } from "./acp-executor.ts";
import { claudeP, codexP, createPExecutor } from "./p-executor.ts";
import type { AgentName, Executor, Mode } from "./contract.ts";

// 실행기 등록처. T02(-p)·T03(ACP)가 여기에 더한다.
const executors: Executor[] = [createPExecutor(claudeP), createPExecutor(codexP), createAcpExecutor(claudeAcp), createAcpExecutor(codexAcp)];

export function registerExecutor(executor: Executor): void {
  executors.push(executor);
}

export function findExecutor(agent: AgentName, mode: Mode): Executor | undefined {
  return executors.find((e) => e.agent === agent && e.mode === mode);
}

export function allExecutors(): Executor[] {
  return [...executors];
}
