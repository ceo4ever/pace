# PACE web installer for Windows PowerShell 5.1 / PowerShell 7.
#   irm https://raw.githubusercontent.com/ceo4ever/pace/main/scripts/get.ps1 | iex
#
# Keep this file ASCII-only and without a BOM: `irm | iex` hands the text to the parser, and a BOM
# before the first token breaks parsing. install.ps1 keeps its UTF-8 BOM (Korean messages), so it is
# saved to a temp file and run with -File in a child process. A failure there ends the child only and
# never closes the user's shell. Options go through PACE_REF / PACE_REPO_URL / PACE_REPO.
& {
  $ref = if ($env:PACE_REF) { $env:PACE_REF } else { "main" }
  $url = if ($env:PACE_INSTALL_URL) { $env:PACE_INSTALL_URL } else { "https://raw.githubusercontent.com/ceo4ever/pace/$ref/scripts/install.ps1" }
  $file = Join-Path ([IO.Path]::GetTempPath()) ("pace-install-" + [guid]::NewGuid().ToString("N") + ".ps1")
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file -ErrorAction Stop
    $exe = if ($PSVersionTable.PSEdition -eq "Core") { (Get-Process -Id $PID).Path } else { "powershell.exe" }
    & $exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $file
    if ($LASTEXITCODE -eq 0) {
      $bin = Join-Path $env:USERPROFILE ".pace\bin"
      if (($env:Path -split ";") -notcontains $bin) { $env:Path = "$env:Path;$bin" }
    }
  } catch {
    Write-Host "x PACE install script download failed: $url ($($_.Exception.Message))" -ForegroundColor Red
  } finally {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
  }
}
