#!/usr/bin/env bash
# devcontainer 作成後に一度だけ実行されるセットアップ処理
set -euo pipefail

# 名前付きボリュームは root 所有で作られるため、remoteUser (vscode) が書き込めるよう所有者を直す。
# これをしないと claude のログイン情報 (.credentials.json など) が保存できない。
fix_owner() {
  local dir="$1"
  sudo mkdir -p "$dir"
  sudo chown -R "$(id -u):$(id -g)" "$dir"
}

fix_owner "$HOME/.claude"
fix_owner "$HOME/.config/gh"
# ~/.config がイメージに無いと、Docker がボリュームのマウント先を作るときに親の ~/.config も root 所有で作る
sudo chown "$(id -u):$(id -g)" "$HOME/.config"

# ~/.gitconfig はボリュームに入らないので、git push で gh のトークンを使う設定をリビルドのたびに入れ直す
if gh auth status >/dev/null 2>&1; then
  gh auth setup-git
fi

# Playwright MCP (.mcp.json) が使う Chromium は、.devcontainer/Dockerfile がイメージに入れてある。
npm ci
