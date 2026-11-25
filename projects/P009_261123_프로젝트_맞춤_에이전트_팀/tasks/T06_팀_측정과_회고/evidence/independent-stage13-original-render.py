from pathlib import Path
import sys
from markdown_it import MarkdownIt
from PIL import Image, ImageDraw, ImageFont
from unicodedata import category, name

d = Path(sys.argv[1])
parser = MarkdownIt("commonmark").enable("table")
for group, names in (
    ("changed", ("ls-fake-root-heading", "ps-fake-heading-end", "ls-fake-end-of-retro", "tilde-ascii-close", "tilde-nbsp-close", "html-nbsp-line", "html-ascii-blank")),
    ("visibility", ("hangul-filler-summary", "hangul-filler-evidence-label", "hangul-filler-header", "hangul-visible-syllable")),
):
    for case in names:
        root = d / group / case
        md = (root / "input-close.md").read_text()
        html = parser.render(md)
        (root / "local-markdown.html").write_text(html)
        headers = [tk.content for prev, tk in zip(parser.parse(md), parser.parse(md)[1:]) if prev.type == "heading_open"]
        print(case, "headings:", repr(headers))
        if group == "visibility":
            for line in html.split("\n"):
                if "\u3164" in line:
                    print("  rendered:", ascii(line))
font = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 32)
for s in ("\u3164", "한", " "):
    image = Image.new("L", (128, 80), 0)
    ImageDraw.Draw(image).text((8, 8), s, font=font, fill=255)
    print(ascii(s), name(s), category(s), "ink_bbox", image.getbbox(), "advance", font.getlength(s))
