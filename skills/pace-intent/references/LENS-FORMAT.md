# Lens file format

A lens is one Markdown file under `references/<group>/<id>.md`. It is used twice (D3): first as a reasoning lens that exposes gaps and produces questions, then — only when useful — as an output form.
`pace intent lint` checks every lens against this format, and `pace intent index` rebuilds [INDEX.md](INDEX.md) from the front matter. Never edit `INDEX.md` by hand.

Lenses are written in English; questions they produce are asked in the user's language. Concepts are rewritten in our own words with the concept source named (D7). Copied text needs a license check and an entry in [SOURCES.md](SOURCES.md).

## Front matter

| Key | Value |
|---|---|
| `id` | file name without `.md` |
| `title` | display name |
| `group` | folder name: `intent` · `writing` · `review` · `strategy` · `service` · `execution` · `platform` |
| `types` | list from `document`, `feature`, `service`, `business`, `platform` |
| `depth` | list from `L0`, `L1`, `L2`, `L3` |
| `signals` | list of cues in a request or an answer that call this lens |
| `source` | concept source (author, book, or URL) |

## Sections

All sections are required and must not be empty. Write "none" with a reason when a section does not apply.

| Section | Content |
|---|---|
| `## Looks at` | what this lens examines |
| `## Key questions` | the questions the planner asks itself through this lens |
| `## Common gaps` | what is usually missing when this lens is skipped |
| `## Turning gaps into questions` | how a gap becomes one user question (options, recommendation) — or an assumption. Examples list the multiple-choice options only: when asking for real, free text is always added (the tool's "Other", or a last option `직접 입력`), and the clause after "—" is the one-line why |
| `## Tensions` | other lenses that pull the opposite way, and the question that tension produces |
| `## When not to use` | requests where this lens only adds noise |
| `## Output form` | three lines: `Form:` the second-layer form · `Link to first layer:` how lens results fill it · `When to produce:` when the form is worth writing |
| `## Closing` | how the lens ends in a conclusion instead of a list |
| `## Source` | concept source and what was changed |

A worked example of every section: [intent/purpose-ladder.md](intent/purpose-ladder.md).
