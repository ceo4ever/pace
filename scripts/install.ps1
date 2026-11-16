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
  [string]$Ref = $(if ($env:PACE_REF) { $env:PACE_REF } else { "main" }),
  [switch]$NoProfile,  # 이전 버전 호환 — 설치는 더 이상 프로필을 만들지 않는다
  [switch]$DryRun
)

$RepoUrl = if ($env:PACE_REPO_URL) { $env:PACE_REPO_URL } else { "https://github.com/ceo4ever/pace.git" }
$DefaultRepo = if ($env:PACE_REPO) { $env:PACE_REPO } else { [IO.Path]::Combine($env:LOCALAPPDATA, "pace") }
$PaceHome = [IO.Path]::Combine($env:USERPROFILE, ".pace")
$PaceBinDir = [IO.Path]::Combine($PaceHome, "bin")

function Info([string]$Message) { Write-Host "▸ $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { Write-Host "✗ $Message" -ForegroundColor Red; exit 1 }
function Ask([string]$Question) {
  if ($Yes) { return $true }
  $answer = Read-Host "$Question [y/N]"
  return ($answer -eq "y" -or $answer -eq "Y")
}

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
if (-not $Repo) {
  $scriptRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { $null }
  if ($scriptRoot -and (Test-Path ([IO.Path]::Combine($scriptRoot, "bin", "pace.ts")))) { $Repo = $scriptRoot }
  else { $Repo = $DefaultRepo }
}
$Entry = [IO.Path]::Combine($Repo, "bin", "pace.ts")

if (Test-Path $Entry) {
  if ((Test-Path ([IO.Path]::Combine($Repo, ".git"))) -and ($Repo -eq $DefaultRepo) -and -not $DryRun) {
    $Git = Find-Exe "git"
    if ($Git) {
      & $Git -C $Repo fetch --quiet origin $Ref 2>$null
      & $Git -C $Repo checkout --quiet $Ref 2>$null
      & $Git -C $Repo pull --quiet --ff-only origin $Ref 2>$null
      if ($LASTEXITCODE -ne 0) { Fail "코드 업데이트에 실패했습니다: $Repo ($Ref)" }
    }
  }
} else {
  $Git = Find-Exe "git"
  if (-not $Git) { Fail "git이 필요합니다. 설치: winget install Git.Git" }
  if ($DryRun) { Fail "미리보기는 코드가 있어야 합니다 (-Repo 지정)" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Repo) | Out-Null
  & $Git clone --quiet --branch $Ref $RepoUrl $Repo
  if ($LASTEXITCODE -ne 0) { Fail "코드를 받지 못했습니다." }
}

function Invoke-Pace([string[]]$Arguments) {
  & $Node $Entry @Arguments | Out-Host
  return $LASTEXITCODE
}

# ── 3. 기존 PACE 설치 판별 ──────────────────────────────────
$Migrate = @()
$Result = "설치"
if (Test-Path ([IO.Path]::Combine($PaceHome, "install.json"))) { $Result = "업데이트" }
# ── 4. 설치 ──────────────────────────────────────────────────
if ($DryRun) {
  [void](Invoke-Pace (@("install") + $Migrate + @("--dry-run")))
  exit 0
}
$env:PACE_FROM_SCRIPT = "1"
# 성공하면 결과 한 줄만 보인다. 실패하면 설치기 출력을 그대로 보여 준다.
$log = & $Node $Entry install @Migrate 2>&1
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
Write-Host "✓ PACE $(& $Node $Entry --version) $Result 완료$WrapperNotice$CleanupNotice" -ForegroundColor Green
