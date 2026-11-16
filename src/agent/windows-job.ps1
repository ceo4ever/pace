param([int]$Port)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$client = $null
$writer = $null
try {
  $client = New-Object System.Net.Sockets.TcpClient
  $client.Connect('127.0.0.1', $Port)
  $stream = $client.GetStream()
  $reader = New-Object System.IO.StreamReader($stream, (New-Object System.Text.UTF8Encoding($false)), $false, 4096, $true)
  $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)), 4096, $true)
  $writer.AutoFlush = $true
  $writer.WriteLine($env:PACE_JOB_TOKEN)
  $spec = $reader.ReadLine() | ConvertFrom-Json
  if (-not $spec) { throw 'missing control specification' }
  $envMap = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($property in $spec.env.PSObject.Properties) { $envMap[$property.Name] = [string]$property.Value }
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-job.cs')
  $result = [PaceWindowsJob]::Run($reader, $writer, [int]$spec.parent, [int]$spec.supervisor, [string]$spec.command, [string[]]$spec.args, [string]$spec.cwd, $envMap, [long]$spec.deadline)
  exit $result
} catch {
  if ($writer) { try { $writer.WriteLine('ERROR:' + $_.Exception.Message.Replace("`n", ' ').Replace("`r", ' ')) } catch {} }
  exit 1
} finally {
  if ($writer) { $writer.Dispose() }
  if ($client) { $client.Dispose() }
}
