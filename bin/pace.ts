#!/usr/bin/env node
import { main, UsageError } from "../src/cli.ts";

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`pace: ${(error as Error).message}\n`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
}
