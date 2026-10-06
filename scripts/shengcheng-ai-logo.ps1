# 生成小程序端 AI 徽章图片：把根目录的 AIlogo.png（网页端 AI 徽章用的原图，1033×1373、约 1.4 MB）
# 等比缩成小程序够用的大小，输出到 xcx/common/images/ailogo.png。
# 同步脚本 scripts/tongbu-xcx.mjs 会把它分发到三端工程的 images/，视图里统一用 /images/ailogo.png 引用，
# 所以「换 AI 形象」只需要替换根目录 AIlogo.png，然后依次跑：本脚本 → npm run xcx:tongbu。
#
# 用法（Windows PowerShell，需 .NET 的 System.Drawing）：
#   powershell -ExecutionPolicy Bypass -File scripts/shengcheng-ai-logo.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/shengcheng-ai-logo.ps1 -Gao 256   # 指定导出高度（像素）
#
# 注意：本文件必须保存为「UTF-8 带 BOM」。Windows PowerShell 5.1 读无 BOM 的 .ps1 会按 GBK 解码，
# 中文注释和提示串会被解坏并报「字符串缺少终止符」，脚本直接跑不起来。用 VS Code 保存时选
# 「UTF-8 with BOM」，或执行：
#   $t = Get-Content -Raw -Encoding UTF8 scripts/shengcheng-ai-logo.ps1
#   [System.IO.File]::WriteAllText((Resolve-Path scripts/shengcheng-ai-logo.ps1), $t, (New-Object System.Text.UTF8Encoding($true)))
param(
  # 导出高度（像素）。视图里最大用到 112rpx ≈ 56px 逻辑像素，按 3 倍屏留余量取 256 足够
  [int]$Gao = 256
)

Add-Type -AssemblyName System.Drawing

$gen = Split-Path -Parent $PSScriptRoot          # 仓库根目录
$yuan = Join-Path $gen 'AIlogo.png'
$mu = Join-Path $gen 'xcx\common\images\ailogo.png'

if (-not (Test-Path $yuan)) { throw "找不到原图：$yuan（网页端 AI 徽章用的就是它）" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $mu) | Out-Null

$src = [System.Drawing.Image]::FromFile($yuan)
$kuan = [int][math]::Round($src.Width * $Gao / $src.Height)
$bmp = New-Object System.Drawing.Bitmap($kuan, $Gao, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
# SourceCopy + 32bppArgb：保留原图透明通道，避免缩放后边缘出现半透明黑边
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage(
  $src,
  (New-Object System.Drawing.Rectangle(0, 0, $kuan, $Gao)),
  (New-Object System.Drawing.Rectangle(0, 0, $src.Width, $src.Height)),
  [System.Drawing.GraphicsUnit]::Pixel
)
$g.Dispose()
$src.Dispose()
$bmp.Save($mu, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$kb = [math]::Round((Get-Item $mu).Length / 1024, 1)
Write-Output "已生成 $mu（$kuan x $Gao，$kb KB）"
Write-Output '接着跑：node scripts/tongbu-xcx.mjs   # 分发到三端 images/'
