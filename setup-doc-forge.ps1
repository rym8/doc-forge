Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $baseDir "app"

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$CommandName)

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "[ERROR] '$CommandName' コマンドが見つかりません。先にインストールしてください。"
    }
}

function Get-MajorVersion {
    param([Parameter(Mandatory = $true)][string]$Version)

    return [int]($Version.Split(".")[0])
}

Write-Host "Doc Forge 初回セットアップを開始します。"

Test-CommandExists -CommandName "node"
Test-CommandExists -CommandName "npm"

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20 -or $nodeMajor -ge 26) {
    throw "[ERROR] Node.js $nodeMajor.x は非対応です。Node.js 20-25 を使ってください。"
}

$npmVersion = (npm -v).Trim()
$npmMajor = Get-MajorVersion -Version $npmVersion
if ($npmMajor -lt 10) {
    throw "[ERROR] npm $npmMajor.x は非対応です。npm 10 以上を使ってください。"
}
if ($npmMajor -ge 11) {
    Write-Warning "npm $npmMajor.x は README 想定外ですが続行します。問題が出る場合は npm 10.x を推奨します。"
}

Push-Location $appDir
try {
    Write-Host "[1/2] 依存関係をインストールします..."
    npm ci

    Write-Host "[2/2] 環境変数ファイルを確認します..."
    if (-not (Test-Path ".env.local")) {
        Copy-Item ".env.local.example" ".env.local"
        Write-Host "  .env.local を新規作成しました。"
    }
    else {
        Write-Host "  .env.local は既に存在するためそのまま使います。"
    }
}
finally {
    Pop-Location
}

Write-Host "セットアップ完了。次回からは起動コマンドだけで使えます。"
