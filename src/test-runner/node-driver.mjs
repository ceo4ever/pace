import { run } from 'node:test';
import { writeSync } from 'node:fs';
let summary;
for await (const event of run({ files: [process.argv[2]] })) {
  if (event.type === 'test:summary' && event.data.file) summary = event.data;
  if (event.type === 'test:stdout') process.stdout.write(event.data.message);
  if (event.type === 'test:stderr') process.stderr.write(event.data.message);
}
writeSync(3, JSON.stringify(summary ?? null));
