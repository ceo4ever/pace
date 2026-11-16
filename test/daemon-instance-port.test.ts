import assert from "node:assert/strict";
import test from "node:test";
import { activeInstancePort, instancePort, instancePortCandidate, PORT_CANDIDATES, writeLockInfo } from "../src/daemon/instance.ts";
import { tempDir } from "./helpers.ts";

// Windows 제외 포트 범위(예 56577~56876)에 걸린 인스턴스 포트의 listen EACCES — 후보를 멀리 떨어뜨려 다음 후보로 넘어간다.

test("IP-1 후보 포트는 기본 해시 포트에서 시작하고 서로 멀리 떨어져 있으며 모두 임시 포트 범위 안이다", () => {
  const home = tempDir("pace-port-");
  assert.equal(instancePortCandidate(home, 0), instancePort(home));
  const ports = Array.from({ length: PORT_CANDIDATES }, (_, k) => instancePortCandidate(home, k));
  assert.equal(new Set(ports).size, PORT_CANDIDATES);
  for (const p of ports) assert.ok(p >= 49152 && p < 49152 + 16000);
  for (let k = 1; k < ports.length; k++) {
    const d = Math.abs(ports[k]! - ports[k - 1]!);
    assert.ok(Math.min(d, 16000 - d) >= 500, "연속된 제외 범위(백여 포트)에 후보가 함께 빠지지 않는다");
  }
});

test("IP-2 실행 중 daemon의 포트는 정보 파일에서 읽고, 없으면 기본 후보를 쓴다", () => {
  const home = tempDir("pace-port-");
  assert.equal(activeInstancePort(home), instancePort(home));
  writeLockInfo(home, { pid: 1, startedAt: 1, bootId: "b", port: instancePortCandidate(home, 2) });
  assert.equal(activeInstancePort(home), instancePortCandidate(home, 2));
});
