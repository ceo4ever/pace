# T06 격리 증거 재현

격리 저장소에서 실제 실행한 확인 프로그램을 코드 예시로 기록했다. 정본·설치 설정에는 반영하지 않았다. 각 코드 블록의 첫 바이트부터 닫기 직전 개행까지의 SHA-256을 함께 적었다. 파일로 꺼내 쓸 경우 실행은 격리 사본과 충돌하지 않는 임시 경로에서 한다.

## 팀 원본과 생성물 대조

저장소 루트를 인자로 실행한다. S-1의 두 문단·표지와 양쪽 생성물·파일 범위를 확인한다.

`check-team-contract.py` · SHA-256 `833ae6c237f46ab2c16bcde98a405458b9289bde08dffabcb7f2f112a48d3c0e`

```python
import hashlib,json,re,subprocess,sys
from pathlib import Path
repo=Path(sys.argv[1]); source=repo/'.pace/team/agents-xhigh/pace-troubleshooter.md'; role=source.read_text(); template=(repo/'templates/team/member.md').read_text()
def section(s,name):
 return s.split(f'## {name}\n',1)[1].split('\n## ',1)[0].strip()
assert section(role,'실행 전 대조')==section(template,'실행 전 대조')
markers=re.findall(r'^- `(vfy-[sr]-[0-9a-f]{16})`',section(role,'하지 않는 일'),re.M)
assert len(set(markers))==2 and {m[4] for m in markers}=={'s','r'}
policy=json.loads((repo/'.pace/team/required-roles.json').read_text()); assert [r for r in policy['roles'] if r['role']=='pace-troubleshooter']==[{'role':'pace-troubleshooter','scope':'worktree','conditional':True}]
digest=hashlib.sha256(role.encode()).hexdigest()
for relative,model,effort in [('.claude/agents/pace-troubleshooter.md','claude-fable-5-2','high'),('.codex/agents/pace-troubleshooter.toml','gpt-6.2-astra','medium')]:
 generated=(repo/relative).read_text()
 assert f'# pace-team-source-sha256: {digest}' in generated
 assert f'{{"model":"{model}","effort":"{effort}"}}' in generated
 assert all(m in generated for m in markers)
changed=subprocess.check_output(['git','-C',str(repo),'diff','--name-only','HEAD','--','.pace/team/agents','.claude/agents','.codex/agents'],text=True).splitlines()
assert set(changed)<={'.claude/agents/pace-troubleshooter.md','.codex/agents/pace-troubleshooter.toml'}
result={'role':'pace-troubleshooter','sourceDigest':digest,'commonAndSupplementaryExecutionContractMatchesTemplate':True,'distinctReviewerMarkers':len(markers),'hostsWithSameFingerprintAndExpectedMapping':2,'conditionPolicy':{'scope':'worktree','conditional':True},'previousTrackedDefinitionsChanged':[]}
print(json.dumps(result,ensure_ascii=False,indent=2))
```

## Claude 종료 훅 관측기

보호된 임시 파일 경로를 인자로 두고 Claude Stop 훅의 JSON을 stdin으로 받는다.

`collect-claude-effort.py` · SHA-256 `db7b860c01f81e7f4b692eacb838b8490b03d5e27022a8c7e88e5012079b2003`

```python
import json,sys
from pathlib import Path
o=json.load(sys.stdin)
e=o.get("effort")
out={"effort":e.get("level") if isinstance(e,dict) else None,"session_id":o.get("session_id")}
Path(sys.argv[1]).write_text(json.dumps(out))
```

## Codex 거부 캡처

임시 bin/codex로 복사하고 같은 폴더의 capture-config.private.json에 실제 Codex 바이너리 절대 경로와 캡처 폴더를 둔다. 해당 호출만 임시 bin이 있는 PATH를 적용한다.

`capture-codex-rejection.py` · SHA-256 `01b9a7209fd882cba70be3ef53a6c609ff2b1c42b532e4fa2bc3d78a90c35346`

```python
#!/usr/bin/env python3
"""An isolated evidence wrapper for the model refusal exercised in T06 S-3."""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def forward(path: Path, stream) -> int:
    with path.open("rb") as captured:
        shutil.copyfileobj(captured, stream)
        stream.flush()
        return captured.tell()


config = json.loads(Path(__file__).with_name("capture-config.private.json").read_text())
command = [config["codexBinary"], *sys.argv[1:]]
if sys.argv[1:2] != ["exec"]:
    os.execv(command[0], command)

os.umask(0o077)
folder = Path(config["capturePath"])
stdout_path = folder / "host-stdout.private.log"
stderr_path = folder / "host-stderr.private.log"
start = utc_timestamp()
with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
    completed = subprocess.run(command, stdout=stdout, stderr=stderr, check=False)
end = utc_timestamp()
receipt = {
    "startedAt": start,
    "finishedAt": end,
    "hostExit": completed.returncode,
    "stdoutBytes": stdout_path.stat().st_size,
    "stderrBytes": stderr_path.stat().st_size,
    "forwardedStdoutBytes": forward(stdout_path, sys.stdout.buffer),
    "forwardedStderrBytes": forward(stderr_path, sys.stderr.buffer),
}
with (folder / "capture-receipt.local.json").open("x") as output:
    json.dump(receipt, output)
sys.exit(completed.returncode)
```

## 같은 Codex 시도를 대조하는 검사

첫 인자는 캡처 폴더, 둘째는 `calls/log.jsonl` 파일이다. 검증 전에는 보호된 로컬 캡처를 사용하며 결과의 안전한 파생값만 보존한다.

`check-codex-rejection.py` · SHA-256 `0a92d83de3ef1a76aa2819976a0eab01431cd667c7cf9e23e12d1fb829fe8648`

```python
#!/usr/bin/env python3
"""Check the local capture against the PACE result and one ledger attempt."""

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path


folder = Path(sys.argv[1])
row_path = Path(sys.argv[2])
stdout_bytes = (folder / "host-stdout.private.log").read_bytes()
stderr_bytes = (folder / "host-stderr.private.log").read_bytes()
stderr = stderr_bytes.decode().strip()
record = json.loads((folder / "capture-receipt.local.json").read_text())
result = json.loads((folder / "result.local.json").read_text())
message = result["error"]["message"]
rows = [json.loads(line) for line in row_path.read_text().splitlines()]
assert len(rows) == 1
row = rows[0]
assert record["hostExit"] == 1 and int((folder / "exit.txt").read_text()) == 7
assert result["error"]["code"] == row["reason"] == "agent_failed"
assert row["model"]["requested"]["value"] == "pace-not-a-deployed-model"
assert row["model"]["actual"] == {"value": None, "source": "unknown"}
assert row["status"] == "failed" and row["route"] == "p"
assert record["stdoutBytes"] == record["forwardedStdoutBytes"] == len(stdout_bytes) == 0
assert record["stderrBytes"] == record["forwardedStderrBytes"] == len(stderr_bytes)
assert message == f"codex 종료 코드 1: {stderr[:300]}"
raw_session = re.search(r"^session id: (\S+)$", stderr, re.MULTILINE).group(1)
preview_session = re.search(r"^session id: (\S+)$", message, re.MULTILINE).group(1)
assert raw_session == preview_session
reason = "The 'pace-not-a-deployed-model' model is not supported when using Codex with a ChatGPT account."
assert reason in stderr and reason not in message
started = datetime.fromisoformat(record["startedAt"])
finished = datetime.fromisoformat(record["finishedAt"])
row_time = datetime.fromisoformat(row["at"].replace("Z", "+00:00"))
start_offset = round((started - row_time).total_seconds() * 1000)
end_offset = round((finished - row_time).total_seconds() * 1000)
assert 0 <= start_offset <= end_offset <= row["duration_ms"]["value"] + 10
wrapper = folder / "bin/codex"
meta = json.loads((folder / "meta.safe.json").read_text())
meta.update({
    "hostRefusal": reason,
    "hostExit": record["hostExit"],
    "capturedInsideSameRun": True,
    "paceErrorPreviewIncludesReason": False,
    "pmDisposition": "hold and return same-run provider refusal; zero replacement calls",
    "correlation": {
        "callId": row["id"],
        "callStartedAt": row["at"],
        "oneLedgerAttempt": len(rows) == 1,
        "wrapperSha256": hashlib.sha256(wrapper.read_bytes()).hexdigest(),
        "wrapperStartOffsetFromCallMs": start_offset,
        "wrapperEndOffsetFromCallMs": end_offset,
        "wrapperWindowInsideCall": True,
        "samePrivateHostSessionIdComparedLocally": True,
        "pacePreviewMatchesCapturedStderrPrefix": True,
        "streamReceipt": record,
    },
})
print(json.dumps(meta, ensure_ascii=False, indent=2))
```
