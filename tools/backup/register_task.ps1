param(
    [string]$Python = (Get-Command python).Source,
    [string]$Time = "08:30",
    [string]$Config = "$env:USERPROFILE\fabric-backup\config.json"
)

$Repository = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Script = Join-Path $Repository "tools\backup\weekly_backup.py"
$ActionArguments = "`"$Script`" --config `"$Config`""
$Action = New-ScheduledTaskAction -Execute $Python -Argument $ActionArguments -WorkingDirectory $Repository
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At $Time
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive

Register-ScheduledTask `
    -TaskName "FabricRnD 주간 백업" `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force
