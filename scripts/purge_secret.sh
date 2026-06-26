#!/usr/bin/env bash
# Purge the historically-committed OpenAI API key from git history.
#
# THIS REWRITES GIT HISTORY AND REQUIRES A FORCE-PUSH. It is destructive and
# can only be completed by the repository owner (it force-pushes to the remote
# and every collaborator must then re-clone). It is provided as a runnable,
# documented procedure — it does NOT run automatically.
#
# Prerequisites:
#   * pip install git-filter-repo        (https://github.com/newren/git-filter-repo)
#   * A FRESH clone of the repo (git-filter-repo refuses to run on a repo with
#     existing remotes unless freshly cloned, by design).
#
# Steps performed:
#   1. Replace the exposed key string everywhere in history with a placeholder.
#   2. (Manual) Force-push the rewritten history.
#   3. (Manual) Rotate the key in the OpenAI dashboard and reset deploy env vars.
#
# After this and a force-push, remove the key's allowlist line in .gitleaks.toml
# so the scanner would catch any reintroduction.
set -euo pipefail

# The secret is supplied at RUNTIME and is intentionally NOT stored in this repo.
# Provide it via the EXPOSED env var (recover it from old git history or your
# records), e.g.:
#     EXPOSED='sk-proj-...the old key...' ./scripts/purge_secret.sh
EXPOSED="${EXPOSED:?Set EXPOSED to the leaked key string (not stored in repo): EXPOSED=sk-proj-... ./scripts/purge_secret.sh}"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "ERROR: git-filter-repo not found. Install with: pip install git-filter-repo" >&2
  exit 1
fi

echo "This rewrites ALL of git history and will require a force-push."
read -r -p "Type 'PURGE' to continue: " confirm
[ "$confirm" = "PURGE" ] || { echo "Aborted."; exit 1; }

# 1. Strip the secret from every blob in history.
printf '%s==>OPENAI_API_KEY=PURGED_ROTATE_ME\n' "$EXPOSED" > /tmp/greenpath-secret-replacements.txt
git filter-repo --replace-text /tmp/greenpath-secret-replacements.txt
rm -f /tmp/greenpath-secret-replacements.txt

cat <<'EOF'

History rewritten locally. REMAINING MANUAL STEPS (owner only):
  1. Re-add the remote if filter-repo removed it:
       git remote add origin <REPO_URL>
  2. Force-push every branch and tag:
       git push --force --all origin
       git push --force --tags origin
  3. Rotate the key at https://platform.openai.com/api-keys and set the NEW key
     only as a deploy env var (Render dashboard) + local .env (gitignored).
  4. Invalidate old deploy env vars that held the old key.
  5. Ask all collaborators to re-clone (old clones still contain the secret).
  6. Remove the key's allowlist line from .gitleaks.toml and commit.
EOF
