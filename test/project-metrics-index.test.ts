import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { refreshMetricsIndex } from "../src/project/metrics-index.ts";
import type { Repo } from "../src/project/harness.ts";
import { tempDir } from "./helpers.ts";

test("metrics index: sorted project snapshots, per tool output, unknown values and deterministic rebuild", () => {
  const root=tempDir(); const projects=join(root,"projects");mkdirSync(projects);
  const repo: Repo={root,mainRoot:root,branch:"main",base:"main",inWorktree:false};
  const write=(folder: string,text: string)=>{mkdirSync(join(projects,folder));writeFileSync(join(projects,folder,"METRICS.md"),text);};
  write("P002_261025_two","| 태스크 수 | 2 |\n| 작업 시간 | 1.0분 |\n| blocking | 4 |\n| 게이트 실패 | 1 |\n| 작업자 | Codex | 100 | 20 | 0 | 30 | 5 | 0 |\n| 코디네이터 | Codex | 900 | 20 | 0 | 999 | 5 | 0 |\n");
  write("P001_261025_one","| 태스크 수 | 0 |\n| 작업 시간 | 기록 없음 |\n");
  write("other","PRIVATE_OTHER");
  const outside=join(tempDir(),"outside");writeFileSync(outside,"PRIVATE_LINK");mkdirSync(join(projects,"P003_261025_link"));symlinkSync(outside,join(projects,"P003_261025_link","METRICS.md"));
  refreshMetricsIndex(repo); const path=join(projects,"METRICS.md"); const once=readFileSync(path,"utf8");
  refreshMetricsIndex(repo);assert.equal(readFileSync(path,"utf8"),once);
  assert.ok(once.indexOf("P001")<once.indexOf("P002"));
  assert.match(once,/P002.*METRICS.md>\) \| 2 \| 1.0분 \| 0.5분 \| Codex 30 \| 4 \| 1 \|/);
  assert.match(once,/P001.*\| 0 \| 기록 없음 \| 기록 없음 \| 기록 없음/);
  assert.ok(!once.includes("999"));assert.ok(!once.includes("PRIVATE"));assert.ok(!once.includes("P003"));
  rmSync(path);symlinkSync(outside,path);assert.throws(()=>refreshMetricsIndex(repo),/일반 파일/);assert.equal(readFileSync(outside,"utf8"),"PRIVATE_LINK");
});
