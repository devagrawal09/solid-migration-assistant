#!/bin/sh
# Lints the target with eslint-plugin-solid's v2 config and prints a summary
# as one JSON line on stdout, which the workflow reads from the step's
# output. Everything else goes to stderr. The tools live in a cache
# directory outside the target and are installed once; $1 names the report.
set -eu
key="$1"
here=$(cd "$(dirname "$0")" && pwd)
tools="${SOLID_LINT_TOOLS:-${XDG_CACHE_HOME:-$HOME/.cache}/solid-migration-assistant/eslint-solid-0.19.0}"
if [ ! -x "$tools/node_modules/.bin/eslint" ]; then
  mkdir -p "$tools"
  (cd "$tools" && npm init -y >/dev/null && npm install --silent --no-audit --no-fund \
    eslint@9 eslint-plugin-solid@0.19.0 typescript-eslint@8) >&2
fi
cp "$here/eslint.config.mjs" "$tools/eslint.config.mjs"
"$tools/node_modules/.bin/eslint" --config "$tools/eslint.config.mjs" --format json . >"$tools/$key.json" || true
node "$here/summarize.mjs" "$tools/$key.json" "$PWD"
