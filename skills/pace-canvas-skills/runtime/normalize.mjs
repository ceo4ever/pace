// Normalize a document with the editor's own engine (real text heights, auto layout recomputed) and return the new file text.
import { ChromeError } from "./chrome.mjs";
import { openEditor } from "./editor-session.mjs";

export async function normalizeText(text, { timeoutMs = 300000 } = {}) {
  const s = await openEditor(Buffer.from(text, "utf8"), { timeoutMs });
  try {
    const r = await s.page.evaluate("window.__render.normalize()", { timeout: timeoutMs });
    if (!r || typeof r.json !== "string") throw new ChromeError("the editor returned no document");
    return r.json;
  } finally { s.close(); }
}
