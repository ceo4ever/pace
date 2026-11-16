// pace mcp 서버의 이름과 도구 분류 — 실행기(권한 결정표)와 서버가 같은 상수를 쓴다.

export const MCP_SERVER_NAME = "pace";
/** 읽기 도구 — 읽기 전용 세션에서도 허용 대상 */
export const MCP_READ_TOOLS = ["memory_list", "memory_show", "project_list", "backlog_list", "backlog_show", "brain_search"] as const;
/** 변경 도구 — access가 write일 때만 노출·허용, 서버가 호출 시점에도 거부 */
export const MCP_WRITE_TOOLS = ["memory_add"] as const;

/** 에이전트 쪽 권한 요청에 나타나는 도구 이름(정확 일치 비교용) */
export function mcpToolName(tool: string): string {
  return `mcp__${MCP_SERVER_NAME}__${tool}`;
}
