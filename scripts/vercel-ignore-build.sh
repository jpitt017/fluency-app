#!/bin/sh
# Vercel Ignored Build Step: decides whether a push needs a deployment.
#
# Vercel's contract for `ignoreCommand` (vercel.json) is:
#   exit 0  -> skip the build (deployment is CANCELED)
#   exit 1+ -> run the build
#
# The rule is a *skip list*: the build is skipped only when every changed path is
# known not to affect the deployed site. Anything unrecognised builds. A missed
# entry therefore costs one unnecessary build, whereas an allow-list that misses
# a path ships stale code with nothing red to notice. Every uncertain case — no
# previous deployment, a base commit outside Vercel's shallow clone, a git error —
# also builds.
#
# The base is VERCEL_GIT_PREVIOUS_SHA ("the git SHA of the last successful
# deployment for the project and branch"), not HEAD^. Vercel only builds the tip
# of a push, so diffing HEAD^ asks "did the last commit touch this?" when the real
# question is "did anything since the last deploy touch this?". A docs-only commit
# stacked on top of a real change must still build.
#
# What deliberately always builds:
#   supabase-b1-b2/content/**   imported at build time (lib/curriculum/*.ts)
#   lib/ src/ components/ public/   the app itself
#   scripts/                    kept conservative; cheap to build
#   package.json, lockfile, next/postcss/tsconfig/eslint config, vercel.json,
#   .vercelignore
# Run `node --test tests/unit/vercel-ignore-build.test.mjs` after editing this file.

set -eu

log() { printf 'vercel-ignore-build: %s\n' "$*"; }

# Changes under these paths never change the deployed output. Root-anchored:
# `docs/x.md` matches, `src/docs/x.md` does not.
SKIP_PREFIXES='docs/ tests/ .github/ supabase-b1-b2/scripts/ supabase-b1-b2/migrations/'
SKIP_FILES='AGENTS.md README.md supabase-b1-b2/README.md'

is_skippable() {
  path=$1
  for file in $SKIP_FILES; do
    [ "$path" = "$file" ] && return 0
  done
  for prefix in $SKIP_PREFIXES; do
    case "$path" in
      "$prefix"*) return 0 ;;
    esac
  done
  return 1
}

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  log 'not a git checkout: building'
  exit 1
}

base=${VERCEL_GIT_PREVIOUS_SHA:-}
if [ -z "$base" ]; then
  log 'no previous deployment for this branch: building'
  exit 1
fi

if ! git -C "$repo_root" cat-file -e "${base}^{commit}" 2>/dev/null; then
  log "base commit $base is not in the clone (shallow checkout): building"
  exit 1
fi

if ! changed=$(git -C "$repo_root" diff --name-only "$base" HEAD); then
  log 'could not diff against the base commit: building'
  exit 1
fi

if [ -z "$changed" ]; then
  log "nothing changed since $base: skipping"
  exit 0
fi

count=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  if ! is_skippable "$path"; then
    log "build input changed: $path -> building"
    exit 1
  fi
  count=$((count + 1))
done <<EOF
$changed
EOF

log "$count changed file(s), all docs/tests/config-only since $base: skipping"
exit 0
