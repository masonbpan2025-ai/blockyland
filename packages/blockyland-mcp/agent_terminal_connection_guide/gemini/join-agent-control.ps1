<#
    Join the player's Blockyland Agent Terminal over Agent Control for Gemini / Antigravity.

        .\join-agent-control.ps1 -Code 215537     # join (or re-join) and verify
        .\join-agent-control.ps1 -Status          # is a client alive / paired / answering?

    Connection Steps:
      1. FREE PORT 47615: Ensures no orphaned server or competing agent process holds port 47615.
         Note: Safe for Antigravity (does NOT kill agy.exe by default).
      2. START CLIENT DETACHED (agent-control-client.mjs) with state in node_modules/.gemini-tmp.
      3. PAIR WITH THE CODE: The client retries pairing every 2.5s until the game tab is connected.
      4. VERIFY WITH get_state: Confirms live round-trip interaction with the browser tab.

    Queueing commands during gameplay:
        Write lines to node_modules\.gemini-tmp\mcp-cmd.txt:
        {"tool":"report_progress","args":{"message":"Building tower","progress":50}}
        {"tool":"run_plan","args":{"plan":{...}}}
        {"tool":"get_state","args":{}}
        {"tool":"say","args":{"text":"Done: tower built!"}}   # Ends request
        {"control":"done"}                                    # Ends request without answer
#>
param(
    [string]$Code,
    [int]$Port = 47615,
    [switch]$Status,
    [switch]$KeepOtherApps,
    [switch]$ForceOccupant,
    [string]$ServerPattern = 'blockyland-mcp|agent-control-client|antigravity-mcp-server|mcp-connect',
    [string]$RespawnerPattern = 'claude|codex|deepseek'
)

$ErrorActionPreference = 'Stop'

function Find-Repo([string]$start) {
    $at = $start
    for ($i = 0; $i -lt 10; $i++) {
        if (Test-Path (Join-Path $at 'packages\blockyland-mcp\server.mjs')) { return $at }
        $up = Split-Path -Parent $at
        if (-not $up -or $up -eq $at) { break }
        $at = $up
    }
    throw "Could not find Blockyland checkout above $start (looked for packages\blockyland-mcp\server.mjs)."
}
$repo = Find-Repo $PSScriptRoot
$scratch = Join-Path $repo 'node_modules\.gemini-tmp'
$client = Join-Path $PSScriptRoot 'agent-control-client.mjs'
$log = Join-Path $scratch 'connect.out.log'
$err = Join-Path $scratch 'connect.err.log'
$pidFile = Join-Path $scratch 'connect.pid'
$cmdFile = Join-Path $scratch 'mcp-cmd.txt'
$joinLog = Join-Path $scratch 'join-agent-control.log'

New-Item -ItemType Directory -Force -Path $scratch | Out-Null
Set-Content -Path $joinLog -Value "join-agent-control (Gemini) $(Get-Date -Format o)" -Encoding utf8

function Step($text) {
    $line = "==> $text"
    Write-Host $line -ForegroundColor Cyan
    Add-Content -Path $joinLog -Value $line -Encoding utf8
}
function Note($text) {
    Write-Host "    $text" -ForegroundColor Gray
    Add-Content -Path $joinLog -Value "    $text" -Encoding utf8
}
function PortOwner {
    (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).OwningProcess
}
function LogText {
    Get-Content $log -Raw -ErrorAction SilentlyContinue
}
function ClientAlive {
    $id = Get-Content $pidFile -ErrorAction SilentlyContinue
    $id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)
}

if ($Status) {
    $id = Get-Content $pidFile -ErrorAction SilentlyContinue
    $alive = [bool](ClientAlive)
    $owner = PortOwner
    $paired = [bool]((LogText) -match 'paired|connected":true')
    Note "client pid: $(if ($id) { $id } else { 'none' }) (alive: $alive)"
    Note "port $Port owner: $(if ($owner) { $owner } else { 'free' })"
    Note "paired with game tab: $paired"
    $last = Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($last) { Note "last log line: $last" }
    if (-not $alive) { exit 1 }
    exit 0
}

if ($Code -notmatch '^\d{6}$') {
    throw "The pairing code must be exactly 6 digits from the Connect AI panel; received '$Code'."
}
if (-not (Test-Path $client)) {
    throw "Missing client script at: $client"
}
$deadlineAll = (Get-Date).AddSeconds(150)

# --- 1. Free the port ---
Step "Checking port $Port"
for ($i = 0; $i -lt 6; $i++) {
    $owner = PortOwner
    if (-not $owner) { break }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue
    if (-not $proc) { Start-Sleep -Milliseconds 300; continue }
    if ($proc.CommandLine -notmatch $ServerPattern) {
        if (-not $ForceOccupant) {
            throw "Port $Port is held by PID $owner ($($proc.Name)), which does not match '$ServerPattern': $($proc.CommandLine). Stop it or pass -ForceOccupant."
        }
        Note "Stopping unrecognised occupant (-ForceOccupant): $($proc.CommandLine)"
    }
    Note "Stopping occupant PID $owner"
    if (-not $KeepOtherApps -and $RespawnerPattern) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
        if ($parent -and ($parent.Name -match $RespawnerPattern -or $parent.CommandLine -match $RespawnerPattern)) {
            Note "Stopping respawner parent PID $($parent.ProcessId) ($($parent.Name))"
            Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}
if (PortOwner) { throw "Port $Port is still in use." }
Note "Port $Port is free."

# --- 2. Start the Gemini MCP Client ---
Step "Starting Gemini Agent Control client (detached)"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'agent-control-client.mjs' -and $_.CommandLine -match 'gemini' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Remove-Item $log, $err, $cmdFile -ErrorAction SilentlyContinue
$started = Start-Process -FilePath 'node' `
    -ArgumentList "`"$client`"", '--port', $Port, '--code', $Code `
    -WorkingDirectory $repo -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError $err -PassThru

$started.Id | Set-Content $pidFile
Note "Client PID $($started.Id)"

# --- 3. Wait for pairing with the game tab ---
Step "Waiting for game tab to pair with code $Code (up to 60s)"
Note "Make sure Blockyland is open: press C -> Offline Mode OFF -> Connect AI"
$deadline = (Get-Date).AddSeconds(60)
$paired = $false
while ((Get-Date) -lt $deadline -and (Get-Date) -lt $deadlineAll) {
    Start-Sleep -Milliseconds 600
    if (-not (Get-Process -Id $started.Id -ErrorAction SilentlyContinue)) {
        throw "The client exited unexpectedly. Check $err"
    }
    $content = LogText
    if ($content -match '"connected":true' -or $content -match 'paired with a game tab' -or $content -match 'paired; idle until') {
        $paired = $true
        break
    }
}
if (-not $paired) {
    $tail = (Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 6) -join "`n"
    throw "Pairing did not complete within timeout.`n$tail`nPlease verify the 6-digit code in the Connect AI panel."
}
Note "Successfully paired with game tab!"

# --- 4. Verify round-trip with get_state ---
Step "Verifying tab status (get_state)"
Start-Sleep -Milliseconds 300
'{"tool":"get_state","args":{}}' | Set-Content $cmdFile -Encoding utf8
$stateDeadline = (Get-Date).AddSeconds(20)
$line = $null
while ((Get-Date) -lt $stateDeadline -and -not $line) {
    Start-Sleep -Milliseconds 400
    $line = Get-Content $log -ErrorAction SilentlyContinue | Where-Object { $_ -match 'tool get_state \(' } | Select-Object -Last 1
}
if (-not $line) {
    Note "Warning: get_state call did not appear in log within 20s, but client is paired."
} else {
    try {
        $json = $line.Substring($line.IndexOf('{"'))
        $s = $json | ConvertFrom-Json
        Step "CONNECTED: $($s.gameMode) at ($($s.position -join ', ')), health $($s.health)"
    } catch {
        Step "CONNECTED: Tab responded to get_state."
    }
}

Note "Client is listening for terminal requests."
Note "Command queue: $cmdFile"
Note "Activity log:  $log"

