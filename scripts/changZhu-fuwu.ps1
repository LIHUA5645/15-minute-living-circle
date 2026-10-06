# 让自有服务端「常驻后台」——不用每次演示前手动开着那个终端。
# 起法：npm run fuwu:bg   （等价 powershell -ExecutionPolicy Bypass -File scripts/changZhu-fuwu.ps1）
# 行为：
#   ① 已经在跑就不重复起（按端口判断），直接回报
#   ② 后台隐藏窗口启动，日志追加到 fuwuqi/fuwu.log
#   ③ 打印本机可用的服务端地址（开发者工具用 127.0.0.1，真机预览用内网 IP）
# 停止：npm run fuwu:stop（或 taskkill 对应进程）
#
# 想「开机自启」：把下面这条做成快捷方式丢进「启动」文件夹（Win+R 输入 shell:startup）：
#   powershell -ExecutionPolicy Bypass -File "D:\比赛专用\scripts\changZhu-fuwu.ps1"
param(
  [int]$DuanKou = 8787
)

$gen = Split-Path -Parent $PSScriptRoot
$ruKou = Join-Path $gen 'fuwuqi\fuwu-qi.mjs'
$riZhi = Join-Path $gen 'fuwuqi\fuwu.log'

if (-not (Test-Path $ruKou)) { throw "找不到服务端入口：$ruKou" }

# ① 已在监听就不再起（避免演示时起出好几个，端口冲突还看不出来）
$zhan = Get-NetTCPConnection -LocalPort $DuanKou -State Listen -ErrorAction SilentlyContinue
if ($zhan) {
  Write-Output "服务端已在运行（端口 $DuanKou，PID $($zhan[0].OwningProcess)），无需重复启动"
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $riZhi) | Out-Null
  Start-Process node -ArgumentList $ruKou -WindowStyle Hidden `
    -RedirectStandardOutput $riZhi -RedirectStandardError ($riZhi + '.err') | Out-Null
  Start-Sleep -Seconds 3
  $zhan2 = Get-NetTCPConnection -LocalPort $DuanKou -State Listen -ErrorAction SilentlyContinue
  if ($zhan2) { Write-Output "服务端已启动（端口 $DuanKou），日志：$riZhi" }
  else { Write-Output "启动失败或还没起来，请看日志：$riZhi" }
}

# ③ 给出可用地址：小程序端「我的」页可手动填（真机必须内网 IP 或 HTTPS 域名）
$lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress -Unique
Write-Output ''
Write-Output '小程序端可填的服务端地址：'
Write-Output "  开发者工具：http://127.0.0.1:$DuanKou"
foreach ($ip in $lan) { Write-Output "  真机预览：  http://${ip}:$DuanKou" }
Write-Output ''
Write-Output ("健康检查：浏览器打开 http://127.0.0.1:$DuanKou/jianKang")
