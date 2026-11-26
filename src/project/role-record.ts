import { teamSourcePath, validTeamName, xhighTeamSourcePath } from "../team/model.ts";
import { hasSecret } from "./secrets.ts";
export interface StartRoleRecord {
  name: string;
  source: "option" | "project";
  definition: string;
  hash: string;
  method: "prompt";
  model: string;
  effort?: string;
  settingsStatus: "planned" | "arguments" | "unconfirmed" | "rejected";
  toolsPermissionApplied: false;
  runtimeObserved: false;
}
export function safeRoleSetting(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && value === value.trim() &&
    value.isWellFormed() && !value.startsWith("-") && !/[\p{Cc}\p{Cf}]/u.test(value) && !hasSecret(value);
}
export function safeRoleName(value: unknown): value is string {
  return typeof value === "string" && validTeamName(value) && !hasSecret(value);
}
export function validStartRole(value: unknown): value is StartRoleRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const required = ["name", "source", "definition", "hash", "method", "model", "settingsStatus", "toolsPermissionApplied", "runtimeObserved"];
  return required.every((key) => Object.hasOwn(r, key)) && Object.keys(r).every((key) => required.includes(key) || key === "effort") &&
    safeRoleName(r.name) && (r.source === "option" || r.source === "project") &&
    (r.definition === teamSourcePath(r.name) || r.definition === teamSourcePath(r.name, true) || r.definition === xhighTeamSourcePath(r.name)) &&
    typeof r.hash === "string" && /^[a-f0-9]{64}$/.test(r.hash) &&
    r.method === "prompt" && safeRoleSetting(r.model) && (r.effort === undefined || safeRoleSetting(r.effort)) &&
    ["planned", "arguments", "unconfirmed", "rejected"].includes(r.settingsStatus as string) &&
    r.toolsPermissionApplied === false && r.runtimeObserved === false;
}
