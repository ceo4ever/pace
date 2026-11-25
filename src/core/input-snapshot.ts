import { createHash } from "node:crypto";
import { resolve } from "node:path";

/** Optional internal provenance; no source bodies are retained or serialized. */
export interface InputTrace {
  record(path: string, hash: string): void;
  absent?(path: string): void;
  listing?(path: string, names: readonly string[], query: string, mode: "entries" | "regular-files", accepts: (name: string) => boolean): void;
}
interface Listing { path: string; names: string[]; query: string; mode: "entries" | "regular-files"; accepts: (name: string) => boolean }
export class InputSnapshotError extends Error {}
export function inputHash(body: Buffer | string): string {
  if (typeof body === "string" && !body.isWellFormed()) throw new InputSnapshotError("검증 입력 문자열은 유효한 Unicode여야 한다");
  // Preserve all original bytes; typed metadata readers separately enforce UTF-8.
  const bytes = typeof body === "string" ? Buffer.from(body.replaceAll("\r\n", "\n")) : Buffer.from(body.toString("latin1").replaceAll("\r\n", "\n"), "latin1");
  return createHash("sha256").update(bytes).digest("hex");
}
export class InputSnapshot implements InputTrace {
  private readonly values = new Map<string, string>();
  private readonly absentValues = new Set<string>();
  private readonly listingValues = new Map<string, Listing>();
  private changed = false;
  get files(): ReadonlyMap<string, string> {
    if (this.changed) throw new InputSnapshotError("검증 중 입력이 바뀌었다: 다시 확인한 뒤 finish한다");
    return this.values;
  }
  get missing(): ReadonlySet<string> { void this.files; return this.absentValues; }
  get directories(): readonly Listing[] { void this.files; return [...this.listingValues.values()]; }
  record(path: string, hash: string): void {
    path = resolve(path);
    const previous = this.values.get(path);
    if (this.absentValues.has(path) || previous !== undefined && previous !== hash) this.changed = true;
    if (this.changed) throw new InputSnapshotError("검증 중 입력이 바뀌었다: 다시 확인한 뒤 finish한다");
    this.values.set(path, hash);
  }
  absent(path: string): void {
    path = resolve(path);
    if (this.values.has(path)) this.changed = true;
    void this.files;
    this.absentValues.add(path);
  }
  listing(path: string, names: readonly string[], query: string, mode: "entries" | "regular-files", accepts: (name: string) => boolean): void {
    path = resolve(path);
    const filtered = names.filter(accepts).sort(), key = `${path}\0${query}`, previous = this.listingValues.get(key);
    if (previous && JSON.stringify(previous.names) !== JSON.stringify(filtered)) this.changed = true;
    void this.files;
    this.listingValues.set(key, { path, names: filtered, query, mode, accepts });
  }
  include(trace: InputTrace | undefined): void {
    for (const [path, hash] of this.files) trace?.record(path, hash);
    for (const path of this.missing) trace?.absent?.(path);
    for (const item of this.directories) trace?.listing?.(item.path, item.names, item.query, item.mode, item.accepts);
  }
}
