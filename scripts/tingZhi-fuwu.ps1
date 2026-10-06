# 停止常驻的自有服务端（npm run fuwu:stop）：
# 按端口找到监听进程并结束，顺带打印结束结果。端口可用 -DuanKou 覆盖。
param(
  [int]$DuanKou = 8787
)

$zhan = Get-NetTCPConnection -LocalPort $DuanKou -State Listen -ErrorAction SilentlyContinue
if (-not $zhan) {
  Write-Output "端口 $DuanKou 上没有正在运行的服务端"
  exit 0
}
foreach ($p in ($zhan | Select-Object -ExpandProperty OwningProcess -Unique)) {
  try {
    Stop-Process -Id $p -Force -ErrorAction Stop
    Write-Output "已停止服务端进程 PID $p（端口 $DuanKou）"
  } catch {
    Write-Output "停止 PID $p 失败：$($_.Exception.Message)"
    exit 1
  }
}
