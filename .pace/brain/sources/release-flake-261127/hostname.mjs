import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
let calls = 0;
os.hostname = () => ++calls === 1 ? 'fixture-before' : 'fixture-after';
syncBuiltinESMExports();
