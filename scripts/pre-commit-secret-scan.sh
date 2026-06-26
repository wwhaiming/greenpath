#!/usr/bin/env bash
# pre-commit-secret-scan.sh
# Blocks a commit when staged content contains live API-key patterns or a tracked .env.
# Enable with:  git config core.hooksPath .githooks
# (the .githooks/pre-commit wrapper calls this script).
set -euo pipefail

fail=0

# Patterns for live keys (OpenAI sk-..., Groq gsk_...).
key_regex='(sk-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]{20,})'

# 1) Refuse to commit a tracked .env file.
if git diff --cached --name-only --diff-filter=AM | grep -qxE '(.*/)?\.env'; then
  echo "ERROR: .env is staged for commit. The .env file must never be tracked." >&2
  echo "       Run: git rm --cached .env   (and keep it in .gitignore)" >&2
  fail=1
fi

# 2) Scan staged additions for live key patterns.
staged_files=$(git diff --cached --name-only --diff-filter=AM)
for f in $staged_files; do
  # Skip the example/template file and this scanner itself.
  case "$f" in
    .env.example|scripts/pre-commit-secret-scan.sh) continue ;;
  esac
  [ -f "$f" ] || continue
  # Only inspect the staged additions (+ lines), not context.
  if git diff --cached -U0 -- "$f" | grep -E '^\+' | grep -qE "$key_regex"; then
    echo "ERROR: possible live API key detected in staged changes to: $f" >&2
    git diff --cached -U0 -- "$f" | grep -E '^\+' | grep -nE "$key_regex" >&2 || true
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "Commit blocked by secret scan. Remove the secret (rotate it if it was ever pushed)," >&2
  echo "or, only if you are certain this is a false positive, bypass with: git commit --no-verify" >&2
  exit 1
fi

exit 0
