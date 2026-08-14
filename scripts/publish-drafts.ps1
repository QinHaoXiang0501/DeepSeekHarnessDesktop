# scripts/publish-drafts.ps1
# 修复 electron-builder 对 NSIS+portable 双 target 发布时产生的重复 draft Release：
#  - 同一 tag 下保留 assets 最多的那个 draft，删除其余重复项；
#  - 把保留的 draft 发布（draft=false），electron-updater 才能读到 latest.yml。
# 本地：powershell -File scripts\publish-drafts.ps1 -Token <你的token>
# CI  ：GH_TOKEN 环境变量会自动注入。

param(
  [string]$Token = $env:GH_TOKEN,
  [string]$Repo = "QinHaoXiang0501/DeepSeekHarnessDesktop"
)

if (-not $Token) { Write-Error "缺少 Token（-Token 或 GH_TOKEN 环境变量）"; exit 1 }

$api = "https://api.github.com/repos/$Repo/releases"
$headers = @{ Authorization = "Bearer $Token"; "User-Agent" = "dsh-desktop-ci" }

$releases = Invoke-RestMethod -Uri $api -Headers $headers
$drafts = @($releases | Where-Object { $_.draft })
if ($drafts.Count -eq 0) {
  Write-Output "没有 draft release，无需处理。"
  exit 0
}

foreach ($group in ($drafts | Group-Object tag_name)) {
  $sorted = @($group.Group | Sort-Object { $_.assets.Count } -Descending)
  $keep = $sorted[0]
  foreach ($r in ($sorted | Select-Object -Skip 1)) {
    Invoke-RestMethod -Method Delete -Uri "$api/$($r.id)" -Headers $headers | Out-Null
    Write-Output "已删除重复 draft：id=$($r.id) tag=$($group.Name)"
  }
  $body = '{"draft":false}'
  Invoke-RestMethod -Method Patch -Uri "$api/$($keep.id)" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
  Write-Output "已发布：tag=$($group.Name) id=$($keep.id) assets=$($keep.assets.Count)"
}
