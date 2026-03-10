#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ ! -d node_modules ]]; then
  echo "node_modules が見つからないため、初回セットアップを自動実行します。"
  bash ./scripts/setup-local.sh
fi

if [[ ! -f .env.local ]]; then
  cp .env.local.example .env.local
  echo ".env.local が無かったため自動作成しました。"
fi

echo "Doc Forge を起動します。"
echo "ブラウザで http://localhost:3000 を開いてください。"
exec npm run dev
