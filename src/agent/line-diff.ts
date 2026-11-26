export type LineOperation = { op: " " | "-" | "+"; text: string };

const MAX_DIFF_CELLS = 4_000_000;

/** 의존성 없는 줄 단위 비교: 바뀐 줄(-/+)과 앞뒤 1줄 맥락. 같은 앞뒤 줄을 먼저 떼고, 남은 구간이 커서 LCS를 못 돌리면
 * 그 구간을 통째로 -/+로 낸다(거칠지만 바뀐 줄은 언제나 나온다 — 재검토가 막다른 길에 빠지지 않게) */
export function lineOperations(before: string, after: string): LineOperation[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
  const ops: LineOperation[] = a.slice(0, pre).map((text) => ({ op: " " as const, text }));
  if (am.length * bm.length > MAX_DIFF_CELLS) {
    for (const text of am) ops.push({ op: "-", text });
    for (const text of bm) ops.push({ op: "+", text });
  } else {
    const n = am.length, m = bm.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = am[i] === bm[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) { ops.push({ op: " ", text: am[i]! }); i++; j++; }
      else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) ops.push({ op: "-", text: am[i++]! });
      else ops.push({ op: "+", text: bm[j++]! });
    }
    while (i < n) ops.push({ op: "-", text: am[i++]! });
    while (j < m) ops.push({ op: "+", text: bm[j++]! });
  }
  for (const text of a.slice(a.length - suf)) ops.push({ op: " ", text });
  return ops;
}

export function lineDiff(before: string, after: string): string {
  const ops = lineOperations(before, after);
  const changed = (k: number) => ops[k] !== undefined && ops[k]!.op !== " ";
  const out: string[] = [];
  let skipped = false;
  ops.forEach((o, k) => {
    if (changed(k) || changed(k - 1) || changed(k + 1)) { if (skipped && out.length) out.push("…"); skipped = false; out.push(`${o.op} ${o.text}`); }
    else skipped = true;
  });
  return out.length ? out.join("\n") : "(바뀐 줄 없음)";
}
