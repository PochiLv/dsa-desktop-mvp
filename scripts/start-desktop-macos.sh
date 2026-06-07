#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/dsa-web"
DESKTOP_DIR="${ROOT_DIR}/apps/dsa-desktop"
VENV_PYTHON="${ROOT_DIR}/.venv/bin/python"
CODEX_NODE_DIR="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
CODEX_PYTHON="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

die() {
  printf '\n启动失败：%s\n' "$*" >&2
  exit 1
}

ensure_node() {
  if [[ -x "${CODEX_NODE_DIR}/npm" ]]; then
    export PATH="${CODEX_NODE_DIR}:${PATH}"
  fi

  command -v node >/dev/null 2>&1 || die "找不到 node。请先安装 Node.js，或在 Codex 环境里运行本脚本。"
  command -v npm >/dev/null 2>&1 || die "找不到 npm。请先安装 Node.js，或在 Codex 环境里运行本脚本。"
}

python_is_compatible() {
  "$1" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
}

find_bootstrap_python() {
  local candidate
  for candidate in "${DSA_BOOTSTRAP_PYTHON:-}" python3.12 "${CODEX_PYTHON}" python3; do
    [[ -n "${candidate}" ]] || continue
    if command -v "${candidate}" >/dev/null 2>&1 && python_is_compatible "${candidate}"; then
      command -v "${candidate}"
      return 0
    fi
    if [[ -x "${candidate}" ]] && python_is_compatible "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  return 1
}

ensure_python_env() {
  if [[ -x "${VENV_PYTHON}" ]]; then
    if python_is_compatible "${VENV_PYTHON}"; then
      return 0
    fi
    die ".venv 里的 Python 版本低于 3.10，请先删除 .venv 后重新运行脚本。"
  fi

  local bootstrap_python
  bootstrap_python="$(find_bootstrap_python)" || die "找不到 Python 3.10+。建议安装 Python 3.12 后重新运行。"

  log "创建 Python 虚拟环境：.venv"
  "${bootstrap_python}" -m venv "${ROOT_DIR}/.venv"

  log "安装后端依赖，这一步首次运行会花一点时间"
  "${VENV_PYTHON}" -m pip install --upgrade pip
  "${VENV_PYTHON}" -m pip install -r "${ROOT_DIR}/requirements.txt"
}

package_lock_hash() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file}" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
  else
    die "找不到 shasum 或 sha256sum，无法检查前端依赖状态。"
  fi
}

ensure_npm_deps() {
  local dir="$1"
  local label="$2"
  local marker="${dir}/node_modules/.dsa-package-lock.sha256"
  local expected
  expected="$(package_lock_hash "${dir}/package-lock.json")"

  if [[ ! -d "${dir}/node_modules" ]] || [[ ! -f "${marker}" ]] || [[ "$(tr -d '[:space:]' < "${marker}" 2>/dev/null || true)" != "${expected}" ]]; then
    log "安装 ${label} 依赖"
    (cd "${dir}" && npm ci)
    mkdir -p "${dir}/node_modules"
    printf '%s\n' "${expected}" > "${marker}"
  fi
}

web_static_needs_build() {
  [[ ! -f "${ROOT_DIR}/static/index.html" ]] && return 0
  find "${WEB_DIR}/src" "${WEB_DIR}/index.html" "${WEB_DIR}/package.json" "${WEB_DIR}/package-lock.json" \
    -type f -newer "${ROOT_DIR}/static/index.html" | grep -q .
}

ensure_web_static() {
  if web_static_needs_build; then
    ensure_npm_deps "${WEB_DIR}" "Web"
    log "构建 WebUI 静态资源"
    (cd "${WEB_DIR}" && npm run build)
  fi
}

start_desktop() {
  ensure_npm_deps "${DESKTOP_DIR}" "桌面端"

  export DSA_PYTHON="${VENV_PYTHON}"
  export PYTHONUTF8="1"
  export PYTHONIOENCODING="utf-8"

  log "启动桌面端。关闭应用窗口后，这个终端可以一起关掉。"
  cd "${DESKTOP_DIR}"
  npm run dev
}

cd "${ROOT_DIR}"
ensure_node
ensure_python_env
ensure_web_static
start_desktop
