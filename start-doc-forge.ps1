Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $baseDir "app"
$setupScript = Join-Path $baseDir "setup-doc-forge.ps1"

Push-Location $appDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "node_modules が見つからないため、初回セットアップを自動実行します。"
        & $setupScript
    }

    if (-not (Test-Path ".env.local")) {
        Copy-Item ".env.local.example" ".env.local"
        Write-Host ".env.local が無かったため自動作成しました。"
    }

    Write-Host "Doc Forge を起動します。"
    Write-Host "ブラウザで http://localhost:3000 を開いてください。"
    npm run dev
}
finally {
    Pop-Location
}
