# Planning templates — shared parts

- `base.css` · `base.js` — header, tabs, colours (light · dark · print), and the `el()` helper that inserts every data string as text (never HTML). Links between documents go through `hrefFor(id)`; external links only through `safeUrl()` (http/https).
- `plan.schema.json` — the raw data the AI writes (`docs/plan.json`).
- Adding a document type that draws **existing data in a new view** = adding a folder `templates/<kind>/` with `template.html`, `schema.json` (`x-pace`: `title`, `desc`, `order`, `ids` — upper-case prefixes, not shared with another template —, `uses`, `requires`, `contents` for the table of contents), `example.html` (`pace intent examples`), and `GUIDE.md`. No command code changes: tabs, the index list, and ID routes come from `x-pace`. A document that needs **new data** (e.g. a data model) also extends `plan.schema.json` and the link computation in `src/intent/plan.ts`; `render` refuses an `x-pace.uses` key it does not compute.
- Every template keeps the CSP meta tag (no network, inline only) and inserts data as text; numbers that reach attributes are clamped.
- Known gap: a data screen with no Canvas or legacy wireframe entry is not flagged by `data-states` (only missing states of represented screens are).
- After changing a template, run `pace intent examples` — `npm run check` fails while an `example.html` is stale.
