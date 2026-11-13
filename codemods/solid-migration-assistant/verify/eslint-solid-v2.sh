#!/bin/sh
# Lints the target with eslint-plugin-solid's v2 config and records a summary
# as workflow state under the key given as $1. The tools live in a cache
# directory outside the target and are installed once.
set -eu
key="$1"
tools="${SOLID_LINT_TOOLS:-${XDG_CACHE_HOME:-$HOME/.cache}/solid-migration-assistant/eslint-solid-0.19.0}"
if [ ! -x "$tools/node_modules/.bin/eslint" ]; then
  mkdir -p "$tools"
  (cd "$tools" && npm init -y >/dev/null && npm install --silent --no-audit --no-fund \
    eslint@9 eslint-plugin-solid@0.19.0 typescript-eslint@8)
fi
cp "$CODEMOD_PATH/verify/eslint.config.mjs" "$tools/eslint.config.mjs"
"$tools/node_modules/.bin/eslint" --config "$tools/eslint.config.mjs" --format json . >"$tools/$key.json" || true
node "$CODEMOD_PATH/verify/summarize.mjs" "$tools/$key.json" "$PWD" "$key" >>"$STATE_OUTPUTS"
node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8").split("=").slice(1).join("="));console.log(`${s.total} eslint-plugin-solid v2 messages`);for(const[r,n]of Object.entries(s.byRule))console.log(`  ${n}  ${r}`)' <<SUMMARY
$(tail -1 "$STATE_OUTPUTS")
SUMMARY
