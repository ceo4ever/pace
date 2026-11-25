import sys
from pathlib import Path
from markdown_it import MarkdownIt

root = Path(sys.argv[1])
parser = MarkdownIt("commonmark", {"html": True}).enable("table")
for rel in (
    "replay/list-nested-retro-title", "replay/list-nested-end-title",
    "replay/escaped-pipe-invalid-header",
    "delta/wider-canonical", "delta/wider-no-trailing-header",
    "delta/wider-no-trailing-separator", "delta/wider-short-delimiters",
    "delta/wider-blank-new-table", "delta/comment-only-summary",
    "delta/canonical-visible-summary",
):
    path = root / rel / "input-close.md"
    document = path.read_text()
    tokens = parser.parse(document)
    section = None
    print(path)
    for i, token in enumerate(tokens):
        if token.type == "heading_open":
            if token.level == 0:
                section = tokens[i+1].content
            if token.map[0] >= 18:
                print(f"  L{token.map[0]+1} heading level={token.level} {tokens[i+1].content!r}")
        if token.type == "table_open" and token.map[0] >= 18:
            end = next(j for j in range(i+1, len(tokens)) if tokens[j].type == "table_close")
            header_count = sum(t.type == "th_open" for t in tokens[i:end])
            print(f"  L{token.map[0]+1} table level={token.level} top-section={section!r} header-columns={header_count}")
            print(parser.renderer.render(tokens[i:end+1], parser.options, {}).rstrip())
