"""Source change monitoring for GreenPath's RAG corpus (judge gap: freshness).

WHY (policy volatility)
-----------------------
Immigration fees, forms, and filing windows change on an event-driven cadence -
a 90-day age gate (``freshness.py``) catches slow staleness but can miss a fee
change that happened yesterday. This module adds *content* monitoring on top of
*age* monitoring: it watches the actual bytes of core USCIS / Dept. of State /
DOJ pages and trips when a watched page changes but the curated quote has not
been re-reviewed.

HOW
---
Every ingested corpus entry carries a SHA-256 ``checksum`` of the cleaned page
text and the ``retrieved_at`` date it was verified (see ``retrieval/ingest.py``).
``check()`` re-fetches each watched URL, recomputes the checksum, and classifies
each source as:

  * ``unchanged``      - live checksum == stored checksum (quote still verbatim).
  * ``changed``        - live checksum != stored checksum: the page moved under
                         us. The stored quote MUST be re-reviewed (re-run
                         ``python -m retrieval.ingest``) before we keep trusting
                         it. This is a CI-failing condition.
  * ``fetch-error``    - could not fetch (network/HTTP). Not a content change, so
                         it does NOT fail CI by itself; reported as a warning.
  * ``unwatched``      - corpus entry without a checksum (curated-only); skipped.

CI CONTRACT
-----------
``python -m retrieval.monitor`` exits:
  0  - no watched page changed (fetch errors allowed; reported)
  2  - at least one watched page changed and its quote is not re-reviewed
  3  - could not fetch ANY watched page (network down) -> inconclusive; CI should
       treat this as a soft warning, not a hard failure (documented in ci.yml).

The pure comparison (``classify``) is unit-tested offline with a stub fetcher;
the network round-trip is exercised only when an operator/CI runs the module.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
_CORPUS_PATH = os.path.join(_ROOT, "datasets", "uscis_sources.json")


def _checksum(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def watched_entries(corpus):
    """Corpus entries that carry a stored checksum + canonical URL (the ones the
    ingestion pipeline produced and that we can therefore monitor)."""
    out = []
    for e in corpus:
        if isinstance(e, dict) and e.get("checksum") and (e.get("canonical_url") or e.get("url")):
            out.append(e)
    return out


def classify(entry, live_text):
    """Classify one watched entry against freshly fetched page text. Pure: no I/O.
    ``live_text`` is the cleaned page text (or None when the fetch failed)."""
    url = entry.get("canonical_url") or entry.get("url")
    if live_text is None:
        return {"id": entry.get("id"), "url": url, "status": "fetch-error"}
    live = _checksum(live_text)
    stored = entry.get("checksum")
    if live == stored:
        return {"id": entry.get("id"), "url": url, "status": "unchanged"}
    return {"id": entry.get("id"), "url": url, "status": "changed",
            "stored_checksum": stored[:12] if stored else None,
            "live_checksum": live[:12],
            "reviewed_at": entry.get("retrieved_at")}


def check(corpus=None, fetch_fn=None, clean_fn=None):
    """Re-fetch and classify every watched source. Returns (results, summary).
    ``fetch_fn``/``clean_fn`` default to the ingestion pipeline's real network
    fetch + HTML cleaner; tests inject stubs so no network is used."""
    if corpus is None:
        with open(_CORPUS_PATH, "r", encoding="utf-8") as fh:
            corpus = json.load(fh)
    if fetch_fn is None or clean_fn is None:
        from retrieval import ingest
        fetch_fn = fetch_fn or ingest.fetch
        clean_fn = clean_fn or ingest.clean_text

    results = []
    for e in watched_entries(corpus):
        url = e.get("canonical_url") or e.get("url")
        try:
            text = clean_fn(fetch_fn(url))
        except Exception:
            text = None
        results.append(classify(e, text))

    summary = {
        "watched": len(results),
        "changed": sum(1 for r in results if r["status"] == "changed"),
        "unchanged": sum(1 for r in results if r["status"] == "unchanged"),
        "errors": sum(1 for r in results if r["status"] == "fetch-error"),
    }
    return results, summary


def main(argv=None):
    ap = argparse.ArgumentParser(description="Monitor watched official sources for content drift")
    ap.add_argument("--corpus", default=_CORPUS_PATH)
    args = ap.parse_args(argv)

    with open(args.corpus, "r", encoding="utf-8") as fh:
        corpus = json.load(fh)
    results, summary = check(corpus)

    print(f"Watched sources: {summary['watched']}  "
          f"changed={summary['changed']} unchanged={summary['unchanged']} "
          f"errors={summary['errors']}")
    for r in results:
        line = f"  [{r['status']:>12}] {r['id']}  {r['url']}"
        if r["status"] == "changed":
            line += (f"\n      stored={r['stored_checksum']} live={r['live_checksum']} "
                     f"reviewed_at={r['reviewed_at']}  -> RE-REVIEW the quote: "
                     f"python -m retrieval.ingest")
        print(line)

    if summary["changed"]:
        print(f"\nFAIL: {summary['changed']} watched page(s) changed and the curated "
              f"quote has not been re-reviewed.", file=sys.stderr)
        return 2
    if summary["watched"] and summary["errors"] == summary["watched"]:
        print("\nINCONCLUSIVE: could not fetch any watched page (network down). "
              "Treat as a soft warning, not a failure.", file=sys.stderr)
        return 3
    print("\nOK: no watched page changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
