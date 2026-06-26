#!/usr/bin/env bash
# 啟動步道誌 App（本機預覽）
set -e
cd "$(dirname "$0")"

# 1) 更新步道資料（可選，失敗不影響既有資料）
if [ "$1" = "--refresh" ]; then
  echo "→ 更新步道資料…"
  python3 data/build_data.py || echo "（更新失敗，沿用既有資料）"
fi

PORT="${PORT:-8765}"
echo "→ 步道誌啟動於 http://localhost:${PORT}"
echo "  手機測試：與電腦同網段時開 http://<電腦IP>:${PORT}"
echo "  （Ctrl+C 結束）"
cd web && python3 -m http.server "$PORT"
