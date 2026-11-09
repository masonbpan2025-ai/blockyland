<#
    Join the player's Blockyland Agent Terminal over Agent Control, in one command.

        .\scripts\join-agent-control.ps1 -Code 215537     # join (or re-join) and verify
        .\scripts\join-agent-control.ps1 -Status          # is a client alive / paired / answering?

    Why each step exists (this is the part that took a while to learn):

      1. FREE PORT 47615. The game tab dials OUT to 127.0.0.1:47615 and to nothing else, so exactly one MCP server
         can own that port. Another AI app on this machine (agy.exe / Antigravity, running
         scripts/antigravity-mcp-server.mjs or packages/blockyland-mcp) parks a server there and re-spawns it in
         well under a second, so killing the server alone loses the race -- its parent has to be stopped too.
      2. START THE CLIENT DETACHED (scripts/agent-control-client.mjs) with logs in .dsh-tmp. A harness
         background job is reaped at the end of a turn (and a killed script takes its Start-Process children with
         it); a child started by a command that has already *completed* keeps running.
      3. WAIT FOR THE TAB. The page reconnects by itself and keeps its 6-digit code, so nobody has to press
         anything in the game. The new server logs `paired with a game tab`.
      4. PAIR with the code. The handshake can take ~25 s (the server waits for the tab to settle). One-time.
      5. PROVE IT with `get_state`: the position/mode printed at the end are read back from the tab, not assumed.

    Serving requests afterwards: the client parks in wait_for_player_message (delivery in milliseconds). Queue one
    JSON object per line into node_modules/.dsh-tmp/mcp-cmd.txt; fs.watch runs it immediately (2 s fallback):

        {"tool":"run_plan","args":{"plan":{...}}}   build / edit
        {"tool":"get_state","args":{}}              inspect
        {"tool":"say","args":{"text":"..."}}        answer (ENDS the request)
        {"control":"done"}                          end a request without answering

    Health rules:
      * A hung queued call blocks the queue (the client serialises them). If a queued call is not in the log within
        ~30 s, restart the client -- restarting is cheap: the tab keeps its code and re-pairs with the same code.
      * The page spends its code only on a reload, "New code", or another game tab connecting. ANY edit under src/
        reloads the tab (nothing in src/ accepts HMR), so code edits cost a re-pair.
      * The client must stay idle in wait_for_player_message while it works: the game reads `ai_waiting` as
        "finished" (src/agentControl/requestTracker.js), which is what printed "Done in 0 s".
      * The tab must be on: press C in the game, switch Offline Mode OFF, open Connect AI. It says "Looking for your
        AI app" until a server listens.
#>
param(
    [string]$Code,
    [int]$Port = 47615,
    [switch]$Status,
    [switch]$KeepOtherApps,
    # Kill whatever holds the port even when it is not recognisable as an Agent Control server. Off by default:
    # the script would rather stop with a message than shoot a process it does not know (see the README table).
    [switch]$ForceOccupant,
    # Regex for the command line of whatever may be listening on the port. Add your own app's server here (see the
    # README's "the occupant is not Antigravity" table).
    [string]$ServerPattern = 'blockyland-mcp|antigravity-mcp-server|mcp-connect|agent-control-client',
    # Regex for the process that re-spawns it. Antigravity (agy.exe) does this; another app may not respawn at all,
    # in which case leave it empty.
    [string]$RespawnerPattern = 'agy\.exe'
)

$ErrorActionPreference = 'Stop'
# Walk up to the checkout: this script may be copied to another folder, so parent-counting breaks.
function Find-Repo([string]$start) {
    $at = $start
    for ($i = 0; $i -lt 10; $i++) {
        if (Test-Path (Join-Path $at 'packages\blockyland-mcp\server.mjs')) { return $at }
        $up = Split-Path -Parent $at
        if (-not $up -or $up -eq $at) { break }
        $at = $up
    }
    throw "Could not find the Blockyland checkout above $start (looked for packages\blockyland-mcp\server.mjs)."
}
$repo = Find-Repo $PSScriptRoot
$scratch = Join-Path $repo 'node_modules\.dsh-tmp'
$client = Join-Path $PSScriptRoot 'agent-control-client.mjs'
$log = Join-Path $scratch 'connect4.out.log'
$err = Join-Path $scratch 'connect4.err.log'
$pidFile = Join-Path $scratch 'connect.pid'
$cmdFile = Join-Path $scratch 'mcp-cmd.txt'
$joinLog = Join-Path $scratch 'join-agent-control.log'

New-Item -ItemType Directory -Force -Path $scratch | Out-Null
Set-Content -Path $joinLog -Value "join-agent-control $(Get-Date -Format o)" -Encoding utf8

# Progress goes to the console AND to a file: a caller that pipes this script's output through something that
# buffers (Select-Object -Last, an IDE, a job) would otherwise show nothing until the end.
function Step($text) {
    $line = "==> $text"
    Write-Host $line
    Add-Content -Path $joinLog -Value $line -Encoding utf8
}
function Note($text) { Write-Host "    $text"; Add-Content -Path $joinLog -Value "    $text" -Encoding utf8 }
function PortOwner { (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).OwningProcess }
function LogText { Get-Content $log -Raw -ErrorAction SilentlyContinue }
function ClientAlive { $id = Get-Content $pidFile -ErrorAction SilentlyContinue; $id -and (Get-Process -Id $id -ErrorAction SilentlyContinue) }

if ($Status) {
    $id = Get-Content $pidFile -ErrorAction SilentlyContinue
    $alive = [bool](ClientAlive)
    $owner = PortOwner
    $paired = [bool]((LogText) -match 'paired with a game tab')
    Note "client pid $id alive: $alive"
    Note "port $Port owner: $(if ($owner) { $owner } else { 'free' })"
    Note "paired with a tab: $paired"
    $last = Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($last) { Note "last log line: $last" }
    if (-not $alive) { exit 1 }
    exit 0
}

if ($Code -notmatch '^\d{6}$') { throw "The code is the 6 digits in the game's Connect AI panel; got '$Code'." }
if (-not (Test-Path $client)) { throw "Missing client: $client" }
$deadlineAll = (Get-Date).AddSeconds(150)

# --- 1. free the port ------------------------------------------------------------------------------------------
Step "freeing port $Port"
for ($i = 0; $i -lt 6; $i++) {
    $owner = PortOwner
    if (-not $owner) { break }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue
    if (-not $proc) { Start-Sleep -Milliseconds 300; continue }
    if ($proc.CommandLine -notmatch $ServerPattern) {
        if (-not $ForceOccupant) {
            throw "Port $Port is held by pid $owner ($($proc.Name)), which does not match -ServerPattern '$ServerPattern': $($proc.CommandLine). Stop it yourself, pass -ForceOccupant, or move to another port (game: ?agent-control-port=N, client: --port N)."
        }
        Note "WARNING: stopping an unrecognised occupant by request (-ForceOccupant): $($proc.CommandLine)"
    }
    Note "stopping $owner ($($proc.CommandLine.Substring(0, [Math]::Min(70, $proc.CommandLine.Length))))"
    if (-not $KeepOtherApps -and $RespawnerPattern) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
        if ($parent -and ($parent.Name -match $RespawnerPattern -or $parent.CommandLine -match $RespawnerPattern)) {
            Note "stopping the respawner: $($parent.ProcessId) ($($parent.Name))"
            Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}
if (PortOwner) { throw "Port $Port is still busy." }

# --- 2. start the client ----------------------------------------------------------------------------------------
Step 'starting the client (detached)'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'mcp-connect|agent-control-client' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item $log, $err, $cmdFile -ErrorAction SilentlyContinue
$started = Start-Process -FilePath 'node' `
    -ArgumentList "`"$client`"", '--port', $Port `
    -WorkingDirectory $repo -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
$started.Id | Set-Content $pidFile
Note "pid $($started.Id)"

# --- 3. wait for the tab ------------------------------------------------------------------------------------------
Step 'waiting for the game tab (press C in the game, Offline Mode OFF, Connect AI)'
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-Process -Id $started.Id -ErrorAction SilentlyContinue)) { throw "The client exited; see $err" }
    if ((LogText) -match 'could not listen') { throw "The server could not bind port $Port (another app took it back). Re-run." }
    if ((LogText) -match 'paired with a game tab') { break }
}
if ((LogText) -notmatch 'paired with a game tab') {
    throw "No game tab reached the server in 60 s. In the game: press C, switch Offline Mode off, open Connect AI (it should say 'Looking for your AI app'), then re-run."
}
Note 'tab connected'

# --- 4. pair ------------------------------------------------------------------------------------------------------
Step "pairing with $Code (up to ~25 s)"
@("{`"tool`":`"connect`",`"args`":{`"code`":`"$Code`"}}") | Set-Content $cmdFile -Encoding utf8
$deadline = (Get-Date).AddSeconds(45)
$connected = $false
while ((Get-Date) -lt $deadline -and (Get-Date) -lt $deadlineAll) {
    Start-Sleep -Milliseconds 500
    if ((LogText) -match '"connected":true') { $connected = $true; break }
    if ((LogText) -match 'No game is waiting with code') { break }
}
if (-not $connected) {
    $tail = (Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 6) -join "`n"
    throw "Pairing did not complete.`n$tail`nThe code changes after a game-tab reload, 'New code', or another tab: read it again and re-run."
}
Note 'paired'

# --- 5. prove it ----------------------------------------------------------------------------------------------------
Step 'verifying the tab answers'
Start-Sleep -Milliseconds 400
'{"tool":"get_state","args":{}}' | Set-Content $cmdFile -Encoding utf8
$deadline = (Get-Date).AddSeconds(20)
$line = $null
while ((Get-Date) -lt $deadline -and -not $line) {
    Start-Sleep -Milliseconds 500
    $line = Get-Content $log -ErrorAction SilentlyContinue | Where-Object { $_ -match 'tool get_state \(' } | Select-Object -Last 1
}
if (-not $line) { throw "Paired, but get_state did not answer within 20 s; check $log" }
$json = $line.Substring($line.IndexOf('{"'))
$s = $json | ConvertFrom-Json
$room = if ($s.roomCode) { $s.roomCode } else { 'local' }
Step "JOINED: $($s.gameMode) at ($($s.position -join ', ')), health $($s.health), room $room"
Note "client pid $($started.Id) | log $log | queue $cmdFile"



