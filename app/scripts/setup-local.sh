#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[ERROR] '$cmd' コマンドが見つかりません。先にインストールしてください。"
    exit 1
  fi
}

check_node_and_npm() {
  require_command node
  require_command npm

  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if (( node_major < 20 || node_major >= 26 )); then
    echo "[ERROR] Node.js $node_major.x は非対応です。Node.js 20-25 を使ってください。"
    exit 1
  fi

  local npm_major
  npm_major="$(npm -v | cut -d. -f1)"
  if (( npm_major < 10 )); then
    echo "[ERROR] npm $npm_major.x は非対応です。npm 10 以上を使ってください。"
    exit 1
  fi
  if (( npm_major >= 11 )); then
    echo "[WARN] npm $npm_major.x は README 想定外ですが続行します。問題が出る場合は npm 10.x を推奨します。"
  fi
}

echo "Doc Forge 初回セットアップを開始します。"
check_node_and_npm

echo "[1/2] 依存関係をインストールします..."
npm ci

echo "[2/2] 環境変数ファイルを確認します..."
if [[ ! -f .env.local ]]; then
  cp .env.local.example .env.local
  echo "  .env.local を新規作成しました。"
else
  echo "  .env.local は既に存在するためそのまま使います。"
fi

echo "セットアップ完了。次回からは起動コマンドだけで使えます。"
