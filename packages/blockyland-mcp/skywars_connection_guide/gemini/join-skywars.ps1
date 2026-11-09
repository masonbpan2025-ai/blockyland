<#
    Join a Blockyland SkyWars match as a competitor for Gemini / Antigravity.

        .\join-skywars.ps1 -Code 5659                               # Join with default settings
        .\join-skywars.ps1 -Code 5659 -Strategy rusher -Difficulty hard
        .\join-skywars.ps1 -Status                                  # Inspect match phase and status
#>
param(
    [string]$Code,
    [string]$Name = 'Gemini',
    [ValidateSet('easy', 'normal', 'hard')]
    [string]$Difficulty = 'normal',
    [ValidateSet('auto', 'aggressive', 'rusher', 'defender', 'coop', 'pvp')]
    [string]$Strategy = 'auto',
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
$scratch = Join-Path $repo 'node_modules\.gemini-skywars-tmp'
$client = Join-Path $PSScriptRoot 'skywars-client.mjs'
$statusFile = Join-Path $scratch 'match-status.json'
$pidFile = Join-Path $scratch 'skywars.pid'
$cmdFile = Join-Path $scratch 'skywars-cmd.txt'

New-Item -ItemType Directory -Force -Path $scratch | Out-Null

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Note($text) { Write-Host "    $text" -ForegroundColor Gray }

if ($Status) {
    $id = Get-Content $pidFile -ErrorAction SilentlyContinue
    $alive = $id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)
    Note "SkyWars Client PID: $(if ($id) { $id } else { 'none' }) (alive: $([bool]$alive))"
    if (Test-Path $statusFile) {
        $s = Get-Content $statusFile -Raw | ConvertFrom-Json
        $sw = $s.skywars
        if ($sw) {
            Note "Phase:  $($sw.phase)"
            Note "Round:  $($sw.round)"
            Note "Island: $($sw.me.slot)"
            Note "Alive:  $($sw.me.alive)"
            Note "Kills:  $($sw.me.kills)"
        }
    }
    exit 0
}

if ($Code -notmatch '^\d{4}$') {
    throw "Provide a 4-digit SkyWars lobby code; received '$Code'."
}

# 1. Check share health
Step "Checking Share service"
try {
    $health = Invoke-RestMethod -Uri 'http://localhost:3000/api/share/health' -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($health) { Note "Share service active (rooms: $($health.rooms), guests: $($health.guests))" }
} catch {}

# 2. Stop old SkyWars client
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'skywars-client.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Remove-Item $statusFile, $cmdFile -ErrorAction SilentlyContinue

# 3. Start SkyWars client
Step "Starting SkyWars client for lobby $Code (Strategy: $Strategy, Difficulty: $Difficulty)"
$autopilotVal = if ($Manual) { 'false' } else { 'true' }
$started = Start-Process -FilePath 'node' `
    -ArgumentList "`"$client`"", '--code', $Code, '--name', $Name, '--difficulty', $Difficulty, '--strategy', $Strategy, '--autopilot', $autopilotVal, '--url', $Url `
    -WorkingDirectory $repo -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $scratch 'out.log') `
    -RedirectStandardError (Join-Path $scratch 'err.log') `
    -PassThru

$started.Id | Set-Content $pidFile
Note "Process ID: $($started.Id)"

# 4. Wait for lobby join
Step "Waiting for SkyWars lobby join and island assignment..."
$deadline = (Get-Date).AddSeconds(25)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 600
    if (-not (Get-Process -Id $started.Id -ErrorAction SilentlyContinue)) {
        $err = Get-Content (Join-Path $scratch 'err.log') -Raw -ErrorAction SilentlyContinue
        throw "SkyWars client exited unexpectedly:`n$err"
    }
    if (Test-Path $statusFile) {
        $ready = $true
        break
    }
}

if (-not $ready) {
    throw "Timed out waiting for lobby join. Ensure the host is in SkyWars lobby $Code."
}

$s = Get-Content $statusFile -Raw | ConvertFrom-Json
$sw = $s.skywars
Step "JOINED SKYWARS LOBBY: $Code"
Note "Match Phase:   $($sw.phase)"
Note "Island Slot:   $($sw.me.slot)"
Note "Action Queue:  $cmdFile"
$autoStatus = if ($Manual) { 'DISABLED' } else { 'ACTIVE' }
Note "Autopilot is $autoStatus. Queue manual actions in $cmdFile :"
Note '  {"action":"loot_chest","position":[3,31,25]}'
Note '  {"action":"bridge_to","position":[0,31,1],"block":"oak_planks"}'
Note '  {"action":"attack","target":"Player-1","count":30}'
