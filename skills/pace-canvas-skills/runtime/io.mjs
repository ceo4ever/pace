// File helpers shared by the skill tools: bounded reads and writes that never follow a symbolic link.
import { randomBytes } from "node:crypto";
import { link, lstat, open, rename, rm, writeFile } from "node:fs/promises";

/** Read at most `limit` bytes of a regular file (the size seen by stat can change or be a special file); null when it holds more. */
export async function readBounded(file, limit) {
  const fh = await open(file, "r");
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw Object.assign(new Error("not a regular file"), { code: "ENOTFILE" });
    const chunks = [];
    let total = 0;
    for (;;) {
      const buf = Buffer.allocUnsafe(Math.min(1 << 20, limit + 1 - total));
      const { bytesRead } = await fh.read(buf, 0, buf.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > limit) return null;
      chunks.push(buf.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks);
  } finally { await fh.close(); }
}

/** Write through a temporary file and rename it over the target: a symbolic link already sitting at the target is replaced, never followed. */
export async function writeSafe(target, data) {
  const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try { await writeFile(tmp, data, { flag: "wx" }); await rename(tmp, target); } catch (e) { await rm(tmp, { force: true }); throw e; }
}

/** Does anything exist at this path (a link counts, and is not followed)? */
export async function exists(path) {
  try { await lstat(path); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; }
}

/**
 * Publish `data` at `target` only if nothing is there: written to a private temporary file, then hard-linked into place (the link fails with EEXIST
 * if anything, a symbolic link included, already sits at the target, and never replaces it). Nothing is reserved beforehand, so a crash leaves no empty file.
 */
export async function publishNew(target, data) {
  const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try { await writeFile(tmp, data, { flag: "wx" }); await link(tmp, target); } finally { await rm(tmp, { force: true }); }
}
