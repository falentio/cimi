#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "${script_dir}/.." && pwd)

cd "${repo_root}"

if ! command -v vp >/dev/null 2>&1; then
  printf 'error: vp is not installed. See AGENTS.md for the required toolchain.\n' >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  printf 'error: pnpm is not installed. See AGENTS.md for the required toolchain.\n' >&2
  exit 1
fi

printf 'Installing workspace dependencies...\n'
vp install

data_dir="${repo_root}/.cimi"

if [[ ! -f .env ]]; then
  printf 'Creating .env from .env.example...\n'
  secret=$(openssl rand -base64 32)
  sed "s|replace-me|${secret}|" .env.example > .env
fi

if ! grep -q '^CIMI_DATA_DIR=' .env; then
  printf 'CIMI_DATA_DIR=%s\n' "${data_dir}" >> .env
elif [[ "$(grep '^CIMI_DATA_DIR=' .env | cut -d= -f2-)" != "${data_dir}" ]]; then
  printf 'Pointing CIMI_DATA_DIR at %s so the dev server finds it from apps/web...\n' "${data_dir}"
  sed -i "s|^CIMI_DATA_DIR=.*|CIMI_DATA_DIR=${data_dir}|" .env
fi

mkdir -p "${data_dir}"

printf '\nDev environment ready.\n'
printf 'Start the web dev server (it also serves the API):\n'
printf '  vp run --filter ./apps/web dev --dotenv ../../.env\n'
