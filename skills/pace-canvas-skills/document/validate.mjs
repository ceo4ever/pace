#!/usr/bin/env node
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { parseDocFile, MAX_FILE_BYTES } from './parser.mjs';
try {
  if (process.argv.length !== 3) throw new Error('Usage: node validate.mjs <file.canvas.json>');
  const file = await open(process.argv[2], constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes;
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('Expected a regular file');
    if (info.size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes`);
    const chunks = [];
    let total = 0;
    while (total <= MAX_FILE_BYTES) {
      const block = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_FILE_BYTES + 1 - total));
      const { bytesRead } = await file.read(block, 0, block.length, null);
      if (!bytesRead) break;
      chunks.push(block.subarray(0, bytesRead));
      total += bytesRead;
    }
    if (total > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes`);
    bytes = Buffer.concat(chunks, total);
  } finally { await file.close(); }
  const result = parseDocFile(bytes.toString('utf8'));
  console.log(`Valid canvas document: ${result.doc.name}`);
} catch (error) {
  console.error(`Invalid canvas document: ${error.message}`);
  process.exitCode = 1;
}
