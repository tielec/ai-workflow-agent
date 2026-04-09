#!/usr/bin/env bash
set -euo pipefail

echo "[INFO] Codex auth.json 手動検証ヘルパー"
echo "[INFO] 現在のユーザー: $(id)"
echo "[INFO] CODEX_HOME: ${CODEX_HOME:-<unset>}"
echo "[INFO] HOME: ${HOME:-<unset>}"

paths=()
if [[ -n "${CODEX_HOME:-}" ]]; then
  paths+=("${CODEX_HOME}/auth.json")
fi
if [[ -n "${HOME:-}" ]]; then
  paths+=("${HOME}/.codex/auth.json")
fi

if [[ ${#paths[@]} -eq 0 ]]; then
  echo "[WARN] CODEX_HOME/HOME が未設定のため確認対象がありません"
  exit 0
fi

for path in "${paths[@]}"; do
  echo "[INFO] 参照: ${path}"
  if [[ -e "$path" ]]; then
    ls -la "$path"
    if command -v stat >/dev/null 2>&1; then
      stat -c 'mode=%a uid=%u gid=%g size=%s' "$path" || true
    fi
    echo "[INFO] 内容の存在確認のみ実施 (出力しません)"
    head -n 1 "$path" >/dev/null 2>&1 || true
  else
    echo "[WARN] ファイルが存在しません"
  fi
  echo ""
done
