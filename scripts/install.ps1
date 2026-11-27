<#
.SYNOPSIS
  PACE 설치 (Windows). 신규 설치와 업데이트를 수행한다.

.EXAMPLE
  scripts\install.cmd   # 실행 정책(Restricted 기본값)을 피하는 래퍼
  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
  irm <raw URL>/scripts/get.ps1 | iex   # 원격 설치. 이 파일은 BOM 때문에 iex로 바로 실행할 수 없다

.NOTES
  Windows PowerShell 5.1 / PowerShell 7 공용.
  - 외부 명령의 stderr가 오류로 바뀌어 중단되지 않도록 $ErrorActionPreference는 기본값을 쓰고 종료 코드로 판단한다.
  - pace 명령은 .cmd(실행 정책 회피)와 Git Bash용 sh 래퍼로 만든다. 파일 쓰기는 Node가 하므로 BOM이 붙지 않는다.
  - 이 파일은 UTF-8 BOM으로 저장한다. BOM이 없으면 5.1이 한글을 ANSI로 읽어 깨진다.
#>
param(
  [switch]$Yes,
  [string]$Repo = "",
  [string]$Ref = $env:PACE_REF,
  [switch]$NoProfile,  # 이전 버전 호환 — 설치는 더 이상 프로필을 만들지 않는다
  [switch]$DryRun
)

$PaceHome = [IO.Path]::Combine($env:USERPROFILE, ".pace")
$PaceBinDir = [IO.Path]::Combine($PaceHome, "bin")

function Fail([string]$Message) { Write-Host "✗ $Message" -ForegroundColor Red; exit 1 }

# Microsoft Store의 가짜 실행 파일(WindowsApps)은 건너뛴다.
function Find-Exe([string]$Name) {
  $found = Get-Command $Name -All -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -and $_.Source -notmatch "\\WindowsApps\\" } |
    Select-Object -First 1
  if ($found) { return $found.Source } else { return $null }
}

# ── 1. 사전 확인 ──────────────────────────────────────────────
$Node = Find-Exe "node"
if (-not $Node) { Fail "Node.js 24 이상이 필요합니다. 설치: winget install OpenJS.NodeJS" }
& $Node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if ($LASTEXITCODE -ne 0) { Fail "Node.js 24 이상이 필요합니다 (현재 $(& $Node --version)). 업데이트: winget upgrade OpenJS.NodeJS" }

# ── 2. 코드 위치 ──────────────────────────────────────────────
if (-not $Repo -and $PSScriptRoot) {
  $scriptRoot = Split-Path -Parent $PSScriptRoot
  if (Test-Path -LiteralPath ([IO.Path]::Combine($scriptRoot, "bin", "pace.ts")) -PathType Leaf) { $Repo = $scriptRoot }
}

$Stage = $null
$PreviousFromScript = $env:PACE_FROM_SCRIPT
try {
  if (-not $Repo) {
    if ($DryRun) { Fail "미리보기는 로컬 소스가 필요합니다 (-Repo 지정)." }
    $Stage = (New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ("pace-release-" + [guid]::NewGuid().ToString("N"))) -ErrorAction Stop).FullName
    $Helper = Join-Path $Stage "install-release.mjs"
    $HelperUrl = "https://raw.githubusercontent.com/ceo4ever/pace/main/scripts/install-release.mjs"
    Invoke-WebRequest -UseBasicParsing -Uri $HelperUrl -OutFile $Helper -MaximumRedirection 0 -TimeoutSec 30 -ErrorAction Stop
    $SourceName = & $Node $Helper $Stage $Ref
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $Repo = Join-Path $Stage $SourceName
  }

  $Entry = [IO.Path]::Combine($Repo, "bin", "pace.ts")
  if (-not (Test-Path -LiteralPath $Entry -PathType Leaf)) { Fail "PACE 소스를 찾을 수 없습니다: $Repo (-Repo 확인)" }

  # ── 3. 기존 PACE 설치 판별 ────────────────────────────────────
  $Result = "설치"
  if (Test-Path -LiteralPath ([IO.Path]::Combine($PaceHome, "install.json"))) { $Result = "업데이트" }

  # ── 4. 설치 ──────────────────────────────────────────────────
  if ($DryRun) {
    & $Node $Entry install --dry-run
    exit $LASTEXITCODE
  }
  $Version = & $Node $Entry --version
  if ($LASTEXITCODE -ne 0) { Fail "소스에서 PACE 버전을 확인하지 못했습니다." }
  $env:PACE_FROM_SCRIPT = "1"
  # 성공하면 결과 한 줄만 보인다. 실패하면 설치기 출력을 그대로 보여 준다.
  $log = & $Node $Entry install 2>&1
  if ($LASTEXITCODE -ne 0) { $log | Out-Host; Fail "설치에 실패했습니다." }

  # ── 5. PATH (사용자 범위) ────────────────────────────────────
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $userPath) { $userPath = "" }
  if (($userPath -split ";") -notcontains $PaceBinDir) {
    [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";") + ";" + $PaceBinDir).TrimStart(";")), "User")
    $env:Path = "$env:Path;$PaceBinDir"
  }

  $WrapperNotice = if ($log -match "\[pace-wrapper-conflict\]") { " · Git Bash 래퍼 충돌: 수동 확인" } else { "" }
  $CleanupNotice = if ($log -match "\[pace-old-cleanup\]") { " · 이전 설치본 정리 실패: 수동 확인" } else { "" }
  Write-Host "✓ PACE $Version $Result 완료$WrapperNotice$CleanupNotice" -ForegroundColor Green
} catch {
  Fail ("PACE 설치를 진행하지 못했습니다. " + $_.Exception.Message)
} finally {
  $env:PACE_FROM_SCRIPT = $PreviousFromScript
  if ($Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue }
}
