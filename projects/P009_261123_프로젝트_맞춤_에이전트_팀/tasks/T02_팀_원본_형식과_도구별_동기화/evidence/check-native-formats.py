"""로컬 실제 CLI 시나리오. Python 3.11+ tomllib와 Ruby 표준 YAML을 독립 판독기로 쓴다."""
from pathlib import Path
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib

repo = Path(__file__).resolve().parents[5]
evidence = Path(__file__).resolve().parent
label = sys.argv[sys.argv.index("--record-label") + 1] if "--record-label" in sys.argv else ""
if label and not re.fullmatch(r"[a-z0-9-]+", label):
    raise RuntimeError("기록 라벨 오류")
suffix = "-" + label if label else ""
root = Path(tempfile.mkdtemp(prefix="pace-P009-T02-native-"))
home = Path(tempfile.mkdtemp(prefix="pace-P009-T02-home-"))
env = {k: v for k, v in os.environ.items() if not k.startswith("ORCA_") and k not in ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]}
env.update(PACE_HOME=str(home), HOME=str(home), USERPROFILE=str(home), GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull)
commands = []

def run(*args, expected=0):
    result = subprocess.run(["node", str(repo / "bin/pace.ts"), *args], cwd=root, env=env, capture_output=True, text=True)
    commands.append({"args": list(args), "exit_code": result.returncode})
    if result.returncode != expected:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout

subprocess.run(["git", "init", "-q", "-b", "main", str(root)], env=env, check=True)
special = "\n: 空白 # 本文\n- leading\n'quote' \"quote\" \"\"\" ''' \\path\nname = 'not a field'\nmodel: not-a-field\n---\n次の行\n"
for name, role in [("captain", "lead"), ("builder", "maker"), ("inspect", "reviewer")]:
    run("team", "new", name, "--role", role)
    path = root / ".pace/team" / (name + ".md")
    path.write_text(path.read_text().replace("stage: []", "stage: [분석, 문서]").replace("tools: []", "tools: [Read, Bash]") + special)
run("team", "sync", "--check", "--json", expected=1)
if (root / ".claude").exists() or (root / ".codex").exists():
    raise RuntimeError("check가 출력 폴더를 만들었다")
run("team", "sync")
run("team", "sync", "--check", "--json")
mapping = json.loads(run("worker", "show"))["teamTiers"]
ruby = "require 'yaml'; require 'json'; s=File.read(ARGV[0]); h=s.match(/\\A---\\n(.*?)\\n---\\n/m)[1]; puts JSON.generate(YAML.safe_load(h, [], [], false))"
parsed = []
fixture = evidence / ("native-format-fixture" + suffix)
execution_rule = "위임을 받으면 실행 전에 지시가 근거(캡틴 원문·확인된 해석 또는 계약)와 같은 범위인지 대조한다. 범위가 달라졌거나 근거가 불명확하면 실행을 보류하고 결정 요청 형식(결정 주체·근거·선택지)으로 올린다. 미확인 해석을 승인된 것으로 바꾸지 않는다."
for name, role in [("captain", "lead"), ("builder", "maker"), ("inspect", "reviewer")]:
    source = (root / ".pace/team" / (name + ".md")).read_text()
    body = source[re.match(r"\A---\n.*?\n---\n", source, re.S).end():]
    claude = root / ".claude/agents" / (name + ".md")
    codex = root / ".codex/agents" / (name + ".toml")
    native = tomllib.loads(codex.read_text())
    frontmatter = json.loads(subprocess.check_output(["ruby", "-e", ruby, str(claude)], env=env, text=True))
    tier = "medium" if role == "maker" else "high"
    if set(native) != {"name", "description", "model", "model_reasoning_effort", "developer_instructions"}:
        raise RuntimeError("TOML 필드가 주입되거나 누락됐다")
    if set(frontmatter) != {"name", "description", "model", "effort"}:
        raise RuntimeError("YAML frontmatter 필드가 주입되거나 누락됐다")
    if native["name"] != name or frontmatter["name"] != name:
        raise RuntimeError("이름 불일치")
    if native["model"] != mapping["codex"][tier]["model"] or native["model_reasoning_effort"] != mapping["codex"][tier]["effort"]:
        raise RuntimeError("Codex 매핑 불일치")
    if frontmatter["model"] != mapping["claude"][tier]["model"] or frontmatter["effort"] != mapping["claude"][tier]["effort"]:
        raise RuntimeError("Claude 매핑 불일치")
    instructions = native["developer_instructions"]
    header = re.match(r"\A---\n.*?\n---\n", claude.read_text(), re.S)
    if claude.read_text()[header.end():] != instructions + "\n" or not instructions.endswith(body):
        raise RuntimeError("양쪽 지침·원문 본문 보존 실패")
    if execution_rule not in body or execution_rule not in instructions or execution_rule not in claude.read_text():
        raise RuntimeError("실행 전 대조 책임 전달 실패")
    if json.loads(re.search(r"역할 메타: (.*)\n", instructions)[1]) != {"name": name, "role": role, "stage": ["분석", "문서"], "tier": tier, "resources": [], "tools": ["Read", "Bash"]}:
        raise RuntimeError("역할 메타 불일치")
    parsed.append({"name": name, "role": role, "tier": tier, "tomllib": "pass", "ruby_yaml": "pass", "body_and_metadata": "pass", "execution_check": "pass"})
    if "--no-record" not in sys.argv:
        for group, path in [("sources", root / ".pace/team" / (name + ".md")), ("claude", claude), ("codex", codex)]:
            target = fixture / group / path.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
if "--no-record" not in sys.argv:
    (evidence / ("native-format-result" + suffix + ".json")).write_text(json.dumps({"fixture_root": str(root), "temporary_pace_home": str(home), "commands": commands, "parsed": parsed, "scope": "형식·의도 매핑·실행 전 대조 책임 전달 검증. 실제 호스트 적용/권한 집행은 검증하지 않음"}, ensure_ascii=False, indent=2) + "\n")
print("pass: CLI new 3명·sync/check, tomllib 3건·Ruby YAML 3건·본문/메타/실행 전 대조 책임 3건")
