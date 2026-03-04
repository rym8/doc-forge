#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set +e
bash "$BASE_DIR/start-doc-forge.sh"
exit_code=$?
set -e

echo
if [[ $exit_code -eq 0 || $exit_code -eq 130 ]]; then
  echo "Doc Forge を停止しました。"
  read -r -p "Enterで終了します。" _
  exit 0
fi

echo "起動処理が異常終了しました (exit: $exit_code)。"
read -r -p "内容を確認したらEnterで終了してください。" _
exit "$exit_code"
