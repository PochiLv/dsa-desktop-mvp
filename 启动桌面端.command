#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

"${ROOT_DIR}/scripts/start-desktop-macos.sh"
STATUS=$?

printf '\n'
if [[ ${STATUS} -eq 0 ]]; then
  printf '桌面端已退出。\n'
else
  printf '桌面端启动失败，错误码：%s\n' "${STATUS}"
fi

printf '按回车关闭这个窗口...'
read -r _
exit "${STATUS}"
