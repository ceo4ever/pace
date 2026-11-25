import pathlib
import sys
from markdown_it import MarkdownIt

root = pathlib.Path(sys.argv[1])
parser = MarkdownIt("commonmark", {"html": True}).enable("table")
for case, document in (
    ('canonical', 'PROJECT-CLOSE.md'),
    ('no-atx-comment-between-hashes-and-text', 'PROJECT-CLOSE.md'),
    ('comment-wrong-section', 'PROJECT-CLOSE.md'),
    ('inline-html-wrong-section', 'PROJECT-CLOSE.md'),
    ('unsupported-dash', 'PROJECT-CLOSE.md'),
    ('marker-synthetic-heading', 'PROJECT.md'),
):
    project = next((root / case / 'projects').glob('P001_*'))
    target = project / document
    original = target.read_text()
    if (root / case / 'finish-result.json').is_file():
        import subprocess
        checked = subprocess.run(
            ['git','show','HEAD~1:'+str(target.relative_to(root / case))],
            cwd=root / case, capture_output=True, text=True,
            env={'PATH':'/usr/bin:/bin','GIT_CONFIG_GLOBAL':'/dev/null','GIT_CONFIG_NOSYSTEM':'1'})
        if checked.returncode == 0 and (root / case / 'finish-result.json').read_text().startswith('{"status":0'):
            original = checked.stdout
    heading = None
    print(case, document)
    tokens = parser.parse(original)
    for i,t in enumerate(tokens):
        if t.type == 'heading_open':
            heading = tokens[i+1].content
            print(f'  line {t.map[0]+1} heading {heading!r}')
        elif t.type == 'table_open':
            print(f'  line {t.map[0]+1} table under {heading!r}')
        elif t.type in ('paragraph_open','bullet_list_open') and t.map and (
            '##<!--' in original.splitlines()[t.map[0]] or
            original.splitlines()[t.map[0]].strip() in ('-', '- 팀 측정: v1')
        ):
            print(f'  line {t.map[0]+1} {t.type}: {original.splitlines()[t.map[0]]!r}')
