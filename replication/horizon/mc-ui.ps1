# Drive the official Minecraft window from a script: bring it to the front, click a point of its picture, press a key,
# type text, capture a screenshot. Used to open a ReplayMod replay and start a render with no person at the mouse.
# Coordinates are pixels of the window's picture (its client area), as the screenshot shows them. It moves the real
# mouse: nobody should use the mouse while it runs.
#
#   powershell -File mc-ui.ps1 shot  -Out C:\path\shot.png
#   powershell -File mc-ui.ps1 click -X 640 -Y 360 [-Double]
#   powershell -File mc-ui.ps1 move  -X 640 -Y 360           (hover, for tooltips)
#   powershell -File mc-ui.ps1 key   -Key ESCAPE          (a System.Windows.Forms.Keys name)
#   powershell -File mc-ui.ps1 info
param([Parameter(Position = 0)][string]$Do = 'info', [int]$X, [int]$Y, [switch]$Double, [string]$Key, [string]$Out, [string]$Title = 'Minecraft*')

Add-Type -Namespace MC -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool SetWindowText(IntPtr h, string s);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
[DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, IntPtr e);
[DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint type);
public struct POINT { public int X, Y; }
public struct RECT { public int L, T, R, B; }
'@
[MC.U]::SetProcessDPIAware() | Out-Null
$p = Get-Process javaw -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output 'no Minecraft window'; exit 3 }
$h = $p.MainWindowHandle
$wTitle = "MC Replay"
[MC.U]::SetWindowText($h, $wTitle) | Out-Null

function Front { [MC.U]::ShowWindow($h, 9) | Out-Null; [MC.U]::MoveWindow($h, 40, 40, 1296, 759, $true) | Out-Null; [MC.U]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 350 }
function Screen($cx, $cy) { $pt = New-Object MC.U+POINT; $pt.X = $cx; $pt.Y = $cy; [MC.U]::ClientToScreen($h, [ref]$pt) | Out-Null; $pt }

switch ($Do) {
  'info' { Front; $r = New-Object MC.U+RECT; [MC.U]::GetClientRect($h, [ref]$r) | Out-Null; $o = Screen 0 0; "title '$wTitle', picture $($r.R)x$($r.B) at $($o.X),$($o.Y)" }
  'shot' { Front; & ffmpeg -y -v error -f gdigrab -draw_mouse 1 -i "title=$wTitle" -frames:v 1 $Out; "saved $Out" }
  'click' {
    Front; $s = Screen $X $Y; [MC.U]::SetCursorPos($s.X, $s.Y) | Out-Null; Start-Sleep -Milliseconds 120
    $n = 1; if ($Double) { $n = 2 }
    for ($i = 0; $i -lt $n; $i++) { [MC.U]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 40; [MC.U]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 80 }
    "clicked $X,$Y"
  }
  'move' { Front; $s = Screen $X $Y; [MC.U]::SetCursorPos($s.X, $s.Y) | Out-Null; 'moved to ' + $X + ',' + $Y }
  'key' {
    Add-Type -AssemblyName System.Windows.Forms
    Front; $vk = [byte][System.Windows.Forms.Keys]::$Key; $scan = [byte][MC.U]::MapVirtualKey($vk, 0)
    [MC.U]::keybd_event($vk, $scan, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 60; [MC.U]::keybd_event($vk, $scan, 2, [IntPtr]::Zero)
    "pressed $Key"
  }
}
