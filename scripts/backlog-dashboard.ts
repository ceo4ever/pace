import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { generateDashboard } from '../src/project/dashboard.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
console.log(generateDashboard(root) ?? '백로그 대시보드가 없어 건너뛰었습니다.');
