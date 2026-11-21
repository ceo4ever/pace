param([int]$DaemonPid)
$ErrorActionPreference = 'Stop'
$osMemory = Get-CimInstance Win32_OperatingSystem
$daemonProcess = Get-Process -Id $DaemonPid -ErrorAction SilentlyContinue
$sample = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  totalPhysicalKiB = [long]$osMemory.TotalVisibleMemorySize
  availablePhysicalKiB = [long]$osMemory.FreePhysicalMemory
  processFound = [bool]$daemonProcess
  daemonWorkingSetBytes = if ($daemonProcess) { [long]$daemonProcess.WorkingSet64 } else { $null }
  daemonProcessStartedAt = if ($daemonProcess) { $daemonProcess.StartTime.ToUniversalTime().ToString('o') } else { $null }
}
$sample | ConvertTo-Json -Compress
