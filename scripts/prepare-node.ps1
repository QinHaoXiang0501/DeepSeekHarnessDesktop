# scripts/prepare-node.ps1
# 下载并解压内置 Node 运行时（node-runtime/node.exe）。
# 打包时 electron-builder 会通过 build.extraResources 把它内置进安装包。
# 仅在全新环境首次构建前需要执行一次。GitHub 不可用时用 npmmirror 镜像。
param(
  [string]$Version = "24.14.0",
  [string]$Mirror = "https://npmmirror.com/mirrors/node"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root "node-runtime"
$zip = Join-Path $root "_node-runtime.zip"
$url = "$Mirror/v$Version/node-v$Version-win-x64.zip"
$inner = "node-v$Version-win-x64/node.exe"

Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

Write-Host "Extracting node.exe ..."
New-Item -ItemType Directory -Force $runtimeDir | Out-Null
tar --strip-components=1 -xf $zip -C $runtimeDir $inner

Remove-Item $zip -Force -ErrorAction SilentlyContinue

$nodeExe = Join-Path $runtimeDir "node.exe"
Write-Host "Done: $nodeExe"
& $nodeExe --version
