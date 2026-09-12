#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "${script_dir}/.." && pwd)

cd "${repo_root}"

declare -a over_1000=()
declare -a over_500=()
declare -a over_200=()

code_glob='*.{ts,tsx,js,jsx,vue,svelte,astro,mjs,cjs,mts,cts,css,scss,sass,less,html,sql,sh,py}'

while IFS= read -r -d '' file; do
  [[ -f "${file}" ]] || continue

  lines=$(wc -l < "${file}")
  entry="${lines}"$'\t'"${file}"

  if (( lines > 1000 )); then
    over_1000+=("${entry}")
  elif (( lines > 500 )); then
    over_500+=("${entry}")
  elif (( lines > 200 )); then
    over_200+=("${entry}")
  fi
done < <(
  rg --files --hidden --null \
    --glob "${code_glob}" \
    --glob '!.git/**' \
    --glob '!docs/**' \
    --glob '!.agents/**' \
    --glob '!**/migrations/**' \
    --glob '!**/*.generated.*' \
    --glob '!**/*.codegen.*'
)

print_group() {
  local heading=$1
  shift

  printf '%s\n' "${heading}"

  if (( $# == 0 )); then
    printf '  (none)\n\n'
    return
  fi

  printf '%s\n' "$@" |
    LC_ALL=C sort --field-separator=$'\t' --key=1,1nr --key=2,2 |
    while IFS=$'\t' read -r lines file; do
      printf '  %s lines  %s\n' "${lines}" "${file}"
    done

  printf '\n'
}

printf 'Refactorable code files grouped by line count\n\n'
print_group '>1000 lines' "${over_1000[@]}"
print_group '>500 and <=1000 lines' "${over_500[@]}"
print_group '>200 and <=500 lines' "${over_200[@]}"
