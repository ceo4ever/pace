// Auxiliary observation only. Explicit argv keeps this out of child NODE_OPTIONS.
export default async function* reporter(source: AsyncIterable<{ type: string; data: Record<string, unknown> }>) {
  for await (const event of source) {
    if (!["test:pass", "test:fail", "test:summary"].includes(event.type)) continue;
    const d = event.data;
    yield JSON.stringify({ type: event.type, ...d, details: d.details && {
      ...(d.details as Record<string, unknown>),
      error: (d.details as Record<string, unknown>).error ? String((d.details as Record<string, unknown>).error) : undefined,
    } }) + "\n";
  }
}
