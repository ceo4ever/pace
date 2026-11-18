import {existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=process.env.PACE_NESTED_TRACE_DIR;
if(!directory)throw new Error('Missing diagnostic trace directory');
const root=tmpdir();
const record={pid:process.pid,ppid:process.ppid,tmp:root,owner:process.env.PACE_TEST_TMP_OWNER,parent:process.env.PACE_TEST_TMP_PARENT,paceHome:process.env.PACE_HOME,paceProfile:process.env.PACE_PROFILE??null,argv:process.argv,execArgv:process.execArgv};
writeFileSync(join(directory,`enter-${process.pid}.json`),JSON.stringify(record,null,2)+'\n');
// Registered after helpers' exit listener, so this observes its completed cleanup.
process.once('exit',()=>writeFileSync(join(directory,`exit-${process.pid}.json`),JSON.stringify({pid:process.pid,root,remaining:existsSync(root),exitCode:process.exitCode??0},null,2)+'\n'));
