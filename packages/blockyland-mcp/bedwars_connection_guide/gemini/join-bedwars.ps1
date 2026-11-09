<#
    Join a Blockyland Bed Wars match for Gemini / Antigravity.

        .\join-bedwars.ps1 -Code 1234 -Team blue                   # Join on Blue team
        .\join-bedwars.ps1 -Code 1234 -Team red -Strategy rusher   # Join Red as a rusher
        .\join-bedwars.ps1 -Status                                 # Inspect bed and team status
#>
param(
    [string]$Code,
    [string]$Name = 'Gemini',
    [ValidateSet('red', 'blue', 'green', 'yellow', 'aqua', 'white', 'pink', 'gray')]
    [string]$Team = 'blue',
    [ValidateSet('easy', 'normal', 'hard')]
    [string]$Difficulty = 'normal',
    [ValidateSet('auto', 'defender', 'rusher', 'farmer', 'pvp')]
    [string]$Strategy = 'defender',
    [switch]$Manual,
    [string]$Url = 'ws://localhost:3000/ws/share',
    [switch]$Status
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
    throw "Could not find Blockyland checkout above $start."
}
$repo = Find-Repo $PSScriptRoot
$scratch = Join-Path $repo 'node_modules\.gemini-bedwars-tmp'
$client = Join-Path $PSScriptRoot 'bedwars-client.mjs'
$statusFile = Join-Path $scratch 'bedwars-status.json'
$pidFile = Join-Path $scratch 'bedwars.pid'
$cmdFile = Join-Path $scratch 'bedwars-cmd.txt'

New-Item -ItemType Directory -Force -Path $scratch | Out-Null

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Note($text) { Write-Host "    $text" -ForegroundColor Gray }

if ($Status) {
    $id = Get-Content $pidFile -ErrorAction SilentlyContinue
    $alive = $id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)
    Note "Bed Wars Client PID: $(if ($id) { $id } else { 'none' }) (alive: $([bool]$alive))"
    if (Test-Path $statusFile) {
        $s = Get-Content $statusFile -Raw | ConvertFrom-Json
        $bw = $s.bedwars
        if ($bw) {
            Note "Team:      $($bw.team)"
            Note "Phase:     $($bw.phase)"
            Note "Our Bed:   $(if ($bw.beds.($bw.team)) { 'Intact' } else { 'Destroyed' })"
        }
    }
    exit 0
}

if ($Code -notmatch '^\d{4}$') {
    throw "Provide a 4-digit Bed Wars lobby code; received '$Code'."
}

# 1. Check share health
Step "Checking Share service"
try {
    $health = Invoke-RestMethod -Uri 'http://localhost:3000/api/share/health' -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($health) { Note "Share service active (rooms: $($health.rooms), guests: $($health.guests))" }
} catch {}

# 2. Stop old Bed Wars client
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'bedwars-client.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Remove-Item $statusFile, $cmdFile -ErrorAction SilentlyContinue

# 3. Start Bed Wars client
Step "Starting Bed Wars client for lobby $Code (Team: $Team, Strategy: $Strategy)"
$autopilotVal = if ($Manual) { 'false' } else { 'true' }
$started = Start-Process -FilePath 'node' `
    -ArgumentList "`"$client`"", '--code', $Code, '--name', $Name, '--team', $Team, '--difficulty', $Difficulty, '--strategy', $Strategy, '--autopilot', $autopilotVal, '--url', $Url `
    -WorkingDirectory $repo -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $scratch 'out.log') `
    -RedirectStandardError (Join-Path $scratch 'err.log') `
    -PassThru

$started.Id | Set-Content $pidFile
Note "Process ID: $($started.Id)"

# 4. Wait for match join
Step "Waiting for Bed Wars lobby join and team island spawn..."
$deadline = (Get-Date).AddSeconds(25)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 600
    if (-not (Get-Process -Id $started.Id -ErrorAction SilentlyContinue)) {
        $err = Get-Content (Join-Path $scratch 'err.log') -Raw -ErrorAction SilentlyContinue
        throw "Bed Wars client exited unexpectedly:`n$err"
    }
    if (Test-Path $statusFile) {
        $ready = $true
        break
    }
}

if (-not $ready) {
    throw "Timed out waiting for lobby join. Ensure the host is in Bed Wars lobby $Code."
}

$s = Get-Content $statusFile -Raw | ConvertFrom-Json
$bw = $s.bedwars
Step "JOINED BED WARS MATCH: $Code"
Note "Team Assigned: $($bw.team)"
Note "Phase:         $($bw.phase)"
Note "Action Queue:  $cmdFile"
$autoStatus = if ($Manual) { 'DISABLED' } else { 'ACTIVE' }
Note "Autopilot is $autoStatus. Queue actions in $cmdFile :"
Note '  {"action":"collect_resources","target":"forge","count":16}'
Note '  {"action":"buy","item":"wool","count":16}'
Note '  {"action":"buy","item":"stone_sword"}'
Note "  {`"action`":`"bridge_to`",`"team`":`"red`",`"block`":`"wool`"}"
Note "  {`"action`":`"break_bed`",`"team`":`"red`"}"
