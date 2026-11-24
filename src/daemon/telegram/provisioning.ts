import { createHash } from "node:crypto";

interface ForumAddress {
  chatId: string;
  apiBase?: string;
}

/** 결속 표는 같은 번호가 다른 포럼에서 재사용돼도 이어지지 않는다. */
export function forumKey(address: ForumAddress): string {
  const api = (address.apiBase ?? "https://api.telegram.org").replace(/\/+$/, "");
  return createHash("sha256").update(JSON.stringify([api, address.chatId])).digest("hex");
}

/** 로컬 확인에 쓰인 포럼과 실행 중 어댑터의 포럼을 Gateway에서 대조한다. */
export function forumProof(address: ForumAddress & { token: string }): string {
  return createHash("sha256").update(forumKey(address)).update(address.token).digest("hex");
}

const TOPIC_STATES = [
  "bound", "already-bound", "unavailable", "unconfirmed-forum", "unavailable-workspace", "conflict",
  "intent-write-failed", "binding-write-failed", "unknown", "rejected", "permission", "not-forum",
] as const;

export type TopicState = typeof TOPIC_STATES[number];

export function isTopicState(value: unknown): value is TopicState {
  return typeof value === "string" && (TOPIC_STATES as readonly string[]).includes(value);
}

export function topicIsBound(state: TopicState): boolean {
  return state === "bound" || state === "already-bound";
}

export function topicStateText(state: TopicState, name: string): string {
  switch (state) {
    case "bound": return `등록 완료: ${name} → 토픽 결속`;
    case "already-bound": return `이미 등록돼 있다: ${name}`;
    case "unavailable": return "Telegram 어댑터를 사용할 수 없다";
    case "unconfirmed-forum": return "확인한 포럼과 실행 중 daemon의 포럼을 대조할 수 없다";
    case "unavailable-workspace": return "워크스페이스의 승인 경로를 확인할 수 없다";
    case "conflict": return "기존 토픽 결속 또는 생성 의도의 워크스페이스 등록이 일치하지 않는다";
    case "intent-write-failed": return "상태를 저장하지 못해 토픽을 만들지 않았다";
    case "binding-write-failed": return `토픽은 만들었으나 저장하지 못했다 — 그 토픽에서 /bind ${name}`;
    case "unknown": return `토픽 생성 결과를 확인하지 못했다 — 포럼에서 토픽을 확인하고 그 토픽 안에서 /bind ${name}`;
    case "rejected": return "Telegram이 토픽 생성을 거부해 토픽을 만들지 못했다. 원인을 해소하고 다시 요청한다";
    case "permission": return ["봇에 토픽 관리 권한이 없어 토픽을 만들지 못했다.", "그룹 설정 → 관리자 → 이 봇 → **토픽 관리** 권한을 켠다.", `원인을 해소하고 토픽 생성을 다시 요청한다 — /new ${name}`].join("\n");
    case "not-forum": return ["이 그룹은 토픽(포럼)이 꺼져 있어 토픽을 만들지 못했다.", "그룹 설정 → 토픽(Topics)을 켠 뒤 다시 요청한다."].join("\n");
  }
}
