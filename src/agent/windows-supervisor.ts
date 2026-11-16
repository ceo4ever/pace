import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Detached Node는 부모 사망 뒤에도 살아 있으며 PowerShell을 같은 입출력 핸들로 띄운다.
const script = fileURLToPath(new URL('./windows-job.ps1', import.meta.url));
const child = spawn(process.env.PACE_JOB_POWERSHELL!, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, process.argv[2]!], {
  stdio: 'inherit', windowsHide: true, env: process.env,
});
child.on('error', () => { process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
