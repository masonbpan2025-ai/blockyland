<#
    Join a shared Blockyland world as a co-op guest player for Gemini / Antigravity.

        .\join-base-game.ps1 -Code 8789                     # Join host's shared world
        .\join-base-game.ps1 -Code 8789 -Name "BuilderGem"  # Join with custom player name
        .\join-base-game.ps1 -Status                        # Check current guest status
#>
param(
    [string]$Code,
    [string]$Name = 'Gemini',
    [switch]$Autopilot,
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
$scratch = Join-Path $repo 'node_modules\.gemini-base-tmp'
$client = Join-Path $PSScriptRoot 'base-game-client.mjs'
$statusFile = Join-Path $scratch 'status.json'
$pidFile = Join-Path $scratch 'guest.pid'
$cmdFile = Join-Path $scratch 'base-cmd.txt'
$logFile = Join-Path $scratch 'base.log'

New-Item -ItemType Directory -Force -Path $scratch | Out-Null

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Note($text) { Write-Host "    $text" -ForegroundColor Gray }

if ($Status) {
    $id = Get-Content $pidFile -ErrorAction SilentlyContinue
    $alive = $id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)
    Note "Guest PID: $(if ($id) { $id } else { 'none' }) (alive: $([bool]$alive))"
    if (Test-Path $statusFile) {
        $s = Get-Content $statusFile -Raw | ConvertFrom-Json
        Note "Position: $($s.position -join ', ')"
        Note "Health:   $($s.health) / 20"
        Note "Players:  $($s.players.Count) nearby"
    }
    exit 0
}

if ($Code -notmatch '^\d{4}$') {
    throw "The room code must be the 4 digits from Share World (press M in-game); received '$Code'."
}

# 1. Health check on share service
Step "Checking Share service health"
try {
    $health = Invoke-RestMethod -Uri 'http://localhost:3000/api/share/health' -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($health) {
        Note "Share service OK (rooms: $($health.rooms), guests: $($health.guests))"
    }
} catch {
    Note "Share service health endpoint unavailable, proceeding with WebSocket attempt directly."
}

# 2. Stop any previous base game client
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'base-game-client.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Remove-Item $statusFile, $cmdFile -ErrorAction SilentlyContinue

# 3. Start client detached
Step "Starting Gemini guest player '$Name' for room $Code"
$argsList = @("`"$client`"", '--code', $Code, '--name', $Name, '--url', $Url)
if ($Autopilot) { $argsList += '--autopilot', 'true' }

$started = Start-Process -FilePath 'node' `
    -ArgumentList $argsList `
    -WorkingDirectory $repo -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $scratch 'out.log') `
    -RedirectStandardError (Join-Path $scratch 'err.log') `
    -PassThru

$started.Id | Set-Content $pidFile
Note "Process ID: $($started.Id)"

# 4. Wait for spawn
Step "Waiting for world spawn and sync..."
$deadline = (Get-Date).AddSeconds(25)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 600
    if (-not (Get-Process -Id $started.Id -ErrorAction SilentlyContinue)) {
        $err = Get-Content (Join-Path $scratch 'err.log') -Raw -ErrorAction SilentlyContinue
        throw "Guest client exited. Error:`n$err"
    }
    if (Test-Path $statusFile) {
        $ready = $true
        break
    }
}

if (-not $ready) {
    throw "Did not receive world status within 25 seconds. Verify room code $Code in the host tab."
}

$s = Get-Content $statusFile -Raw | ConvertFrom-Json
Step "JOINED AS GUEST PLAYER: $Name"
Note "Spawn Position: ($($s.position -join ', '))"
Note "Health:         $($s.health) / 20"
Note "Command queue:  $cmdFile"
Note "To command your player, write JSON to $cmdFile :"
Note '  {"action":"goto","position":[10,64,15],"bridge":true}'
Note '  {"action":"chat","message":"Hello from Gemini!"}'
Note '  {"tool":"leave_game"}'
