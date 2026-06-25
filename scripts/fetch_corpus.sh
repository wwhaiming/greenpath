#!/usr/bin/env bash
# Download GreenPath's Tier-1 grounding corpus (verified-live public PDFs).
#
# USCIS HTML pages sit behind a WAF that 403s default fetchers, but the static
# /sites/default/files/document/forms/*.pdf files serve fine WITH a browser
# User-Agent. This script pulls the core forms + instructions + fee schedule +
# the latest Visa Bulletin into ./corpus/ for chunking/embedding.
#
# Usage: bash scripts/fetch_corpus.sh
# Re-run periodically: USCIS rejects outdated form editions, so refresh.

set -euo pipefail

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
OUT="$(cd "$(dirname "$0")/.." && pwd)/corpus"
mkdir -p "$OUT"

USCIS_FORMS_BASE='https://www.uscis.gov/sites/default/files/document/forms'

# form-stem list: pulls both the fillable form and its instruction booklet
FORMS=(i-130 i-130instr i-485 i-485instr i-765 i-765instr i-131 i-131instr n-400 n-400instr g-1055)

fetch() {  # fetch <url> <outfile>
  local url="$1" dest="$2"
  if curl -fsSL -A "$UA" "$url" -o "$dest"; then
    printf '  ok   %s (%s bytes)\n' "$(basename "$dest")" "$(wc -c <"$dest" | tr -d ' ')"
  else
    printf '  FAIL %s  <- %s\n' "$(basename "$dest")" "$url"
  fi
}

echo "Downloading USCIS forms + instructions -> $OUT"
for f in "${FORMS[@]}"; do
  fetch "$USCIS_FORMS_BASE/$f.pdf" "$OUT/$f.pdf"
done

echo "Downloading latest DOS Visa Bulletin (edit month as needed)"
# Visa Bulletin filenames are visabulletin_<Month><Year>.pdf
fetch 'https://travel.state.gov/content/dam/visas/Bulletins/visabulletin_June2026.pdf' "$OUT/visabulletin_latest.pdf"

cat <<'NOTE'

Done. Next steps for retrieval RAG (optional):
  1. Extract text from each PDF (pdf.js, pdfplumber, or `pdftotext`).
  2. Chunk by section (~500-1000 tokens), keep the source filename + page.
  3. Embed chunks (e.g. text-embedding-3-small) into a small vector store.
  4. At query time, retrieve top-k and inject into the feature's system prompt.
  5. NEVER hardcode fees/dates from these — cite them as links to verify.

Also available as live APIs (no download): eCFR Title 8, Federal Register,
govinfo US Code Title 8 — see DATASETS.md.
NOTE
