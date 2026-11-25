import {existsSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname,"../../../../..");
const {createPExecutor,codexP}=await import(resolve(root,"src/agent/p-executor.ts"));
const {runAgent,validateRequest}=await import(resolve(root,"src/agent/contract.ts"));
const label=process.argv[2];if(!/^[a-z0-9-]+$/.test(label??""))throw new Error("label");
const out=resolve(import.meta.dirname,`codex-post-r7-${label}.json`);if(existsSync(out))throw new Error("preserve original");
const result=await runAgent(createPExecutor(codexP),validateRequest({agent:"codex",mode:"p",cwd:root,access:"write",prompt:readFileSync(resolve(import.meta.dirname,`codex-post-r7-${label}-prompt.txt`),"utf8"),timeoutMs:600000}));
writeFileSync(out,JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({model:result.model,provider:result.provider,stop_reason:result.stop_reason,is_error:result.is_error}));
