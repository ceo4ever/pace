"""문서 표본의 분량·구조·원본/발췌 결속을 확인한다. 의미 판정은 독립 검토가 맡는다."""
import hashlib
import json
from pathlib import Path

here = Path(__file__).resolve().parent
record = json.loads((here / "baseline-ai-sql-client.json").read_text())
doc_path = here / "baseline-ai-sql-client-review.md"
doc = doc_path.read_text()

def require(ok, reason):
    if not ok:
        raise SystemExit("fail: " + reason)

require(3000 <= len(doc) <= 5000, "문서 분량")
require(hashlib.sha256(doc_path.read_bytes()).hexdigest() == record["document_sha256"], "최종 문서 해시")
for heading in ["개요", "현재 문서 서술 경계", "초안 제안 경계", "운영 점검", "결정 필요 사항"]:
    require("\n## " + heading + "\n" in doc, heading)
root = Path(record["repository"])
for relative, expected in record["sources"].items():
    require(hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, relative + " 원본 해시")
required = [
    ("docs/DESIGN.md", "## 7. SQL 실행 파이프라인"),
    ("docs/DESIGN.md", "### 7.2 분류 규칙"),
    ("docs/DESIGN.md", "### 7.3 승인 미리보기"),
    ("docs/DESIGN.md", "## 10. 보안"),
    ("docs/DEPLOYMENT_AUTH.md", "## 1. 목표와 원칙"),
    ("docs/DEPLOYMENT_AUTH.md", "## 3. 인증·자격 증명 종류"),
    ("docs/DEPLOYMENT_AUTH.md", "### 4.5 AI 에이전트"),
    ("docs/DEPLOYMENT_AUTH.md", "## 6. 데이터 위치와 보안 경계"),
    ("docs/DEPLOYMENT_AUTH.md", "## 9. 위험"),
    ("docs/DEPLOYMENT_AUTH.md", "최소 권한 DB 계정 권장"),
]
for source, heading in required:
    require(heading in (root / source).read_text(), source + " 인용 " + heading)
excerpts = (here / "baseline-source-excerpts.md").read_text()
parts = json.loads((here / "baseline-excerpt-index.json").read_text())
for part in parts:
    lines = (root / part["source"]).read_text().splitlines(keepends=True)
    start = part["start_line"] - 1
    chunk = "".join(lines[start:start + part["line_count"]])[:part["characters"]]
    require(hashlib.sha256(chunk.encode()).hexdigest() == part["sha256"], part["source"] + " 발췌 해시")
    require(chunk in excerpts, part["source"] + " 발췌 내용")
print(f"pass: {len(doc)}자 · 필수 5절 · 최종 문서/출처 4파일 해시 · 인용 10건 · 발췌 {len(parts)}건")
