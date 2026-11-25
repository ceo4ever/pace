from pathlib import Path
from sys import argv
from markdown_it import MarkdownIt

parser = MarkdownIt("commonmark", {"html": True}).enable("table")
cases = ('canonical', 'exact-self-closing-block', 'malformed-slash-prefix',
         'atx-real-space-inline-comment', 'atx-fake-end-boundary', 'atx-real-end-boundary',
         'list-nested-retro-title', 'list-nested-end-title', 'escaped-pipe-invalid-header',
         'unsupported-dash')
for case in cases:
    print(case)
    document = Path(argv[1]) / case / 'input-close.md'
    tokens = parser.parse(document.read_text())
    nearest_top_heading = None
    for i, token in enumerate(tokens):
        if token.type == 'heading_open':
            heading = tokens[i+1].content
            if token.level == 0:
                nearest_top_heading = heading
            if token.map[0] >= 18:
                print(f'  L{token.map[0]+1} heading level={token.level} {heading!r}')
        elif token.type in ('table_open', 'html_block', 'bullet_list_open', 'paragraph_open') and token.map[0] >= 18:
            print(f'  L{token.map[0]+1} {token.type} level={token.level} top-section={nearest_top_heading!r}')
