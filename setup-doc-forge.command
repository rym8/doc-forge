#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if bash "$BASE_DIR/setup-doc-forge.sh"; then
  echo
  read -r -p "セットアップが完了しました。Enterで終了します。" _
else
  exit_code=$?
  echo
  echo "セットアップに失敗しました (exit: $exit_code)。"
  read -r -p "内容を確認したらEnterで終了してください。" _
  exit "$exit_code"
fi
