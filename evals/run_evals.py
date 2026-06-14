#!/usr/bin/env python3
"""
GreenPath AI accuracy eval.

Measures the two structured-output features against labeled cases by calling the
SAME model and the SAME production system prompts the live app uses. It imports
PW_SYSTEM / DR_SYSTEM / _ground / client / QUALITY_MODEL directly from server.py,
so a passing score here is the score of the deployed app -- not a re-implementation.

Run:
    OPENAI_API_KEY=... python evals/run_evals.py
    python evals/run_evals.py --min 0.8        # exit 1 if either suite below 0.8

Outputs evals/results.json (machine) and evals/RESULTS.md (human) and prints a table.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Reuse the live app's client + prompts so the eval tests production, not a copy.
import server  # noqa: E402

CASES = json.loads((Path(__file__).resolve().parent / "cases.json").read_text())
MODEL = server.QUALITY_MODEL


def _complete(system, user, max_tokens=1000):
    """One chat call with light retry on transient errors."""
    for attempt in range(4):
        try:
            r = server.client.chat.completions.create(
                model=MODEL,
                max_tokens=max_tokens,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
            )
            return r.choices[0].message.content
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    return ""


def _parse_json(raw):
    raw = raw.strip().lstrip("`").rstrip("`")
    if raw.startswith("json"):
        raw = raw[4:].strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start >= 0 and end > start:
        raw = raw[start:end + 1]
    return json.loads(raw)


def _norm(s):
    return (s or "").lower().strip()


def run_pathway():
    rows = []
    for c in CASES["pathway"]:
        out = _parse_json(_complete(server._ground(server.PW_SYSTEM), c["input"]))
        got = out.get("primaryPathway", "")
        conf = _norm(out.get("confidence"))
        expected = c["expect"]
        ok = any(_norm(e) in _norm(got) or _norm(got) in _norm(e) for e in expected)
        # "Unclear" cases also pass if the model honestly flags low confidence.
        if not ok and any("unclear" in _norm(e) for e in expected) and conf == "low":
            ok = True
        rows.append({"id": c["id"], "expected": expected, "got": got,
                     "confidence": conf, "pass": ok})
        print(f"  [{'PASS' if ok else 'FAIL'}] {c['id']:28s} got='{got}' ({conf})")
    return rows


def run_review():
    rows = []
    for c in CASES["review"]:
        out = _parse_json(_complete(server.DR_SYSTEM, c["input"], max_tokens=1200))
        status = _norm(out.get("overallStatus"))
        blob = _norm(json.dumps(out.get("issues", [])) + json.dumps(out.get("reminders", [])))
        status_ok = status in [_norm(s) for s in c["expectStatus"]]
        kws = c["expectKeywords"]
        kw_ok = (not kws) or any(_norm(k) in blob for k in kws)
        ok = status_ok and kw_ok
        rows.append({"id": c["id"], "expectStatus": c["expectStatus"], "got": status,
                     "keywordHit": kw_ok, "pass": ok})
        print(f"  [{'PASS' if ok else 'FAIL'}] {c['id']:28s} status='{status}' kw={kw_ok}")
    return rows


def acc(rows):
    return round(sum(r["pass"] for r in rows) / len(rows), 3) if rows else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min", type=float, default=0.0,
                    help="fail (exit 1) if either suite is below this accuracy")
    ap.add_argument("--date", default="", help="stamp results with this ISO date")
    args = ap.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY (server.py loads it from .env).", file=sys.stderr)
        sys.exit(2)

    print(f"Model under test: {MODEL}\n")
    print("Pathway Finder (/api/pathway):")
    pw = run_pathway()
    print("\nDocument Review (/api/document-review):")
    rv = run_review()

    pw_acc, rv_acc = acc(pw), acc(rv)
    n = len(pw) + len(rv)
    overall = round((sum(r["pass"] for r in pw) + sum(r["pass"] for r in rv)) / n, 3)

    results = {
        "model": MODEL,
        "date": args.date,
        "grounding": "Visa Bulletin brief injected" if server.VISA_BRIEF else "none",
        "pathway": {"accuracy": pw_acc, "n": len(pw), "cases": pw},
        "review": {"accuracy": rv_acc, "n": len(rv), "cases": rv},
        "overall_accuracy": overall, "total_cases": n,
    }
    out_dir = Path(__file__).resolve().parent
    (out_dir / "results.json").write_text(json.dumps(results, indent=2))

    md = (
        f"# GreenPath AI Eval Results\n\n"
        f"Model: `{MODEL}` | Grounding: {results['grounding']}"
        + (f" | Date: {args.date}\n\n" if args.date else "\n\n")
        + f"| Suite | Cases | Accuracy |\n|---|---|---|\n"
        f"| Pathway Finder (`/api/pathway`) | {len(pw)} | **{pw_acc*100:.0f}%** |\n"
        f"| Document Review (`/api/document-review`) | {len(rv)} | **{rv_acc*100:.0f}%** |\n"
        f"| **Overall** | **{n}** | **{overall*100:.0f}%** |\n\n"
        "## Methodology\n\n"
        "Each case is graded against the **production** system prompts imported "
        "directly from `server.py` and the same `gpt-4o-mini` model the live app "
        "calls — so this is the deployed app's score, not a re-implementation. The "
        "suite includes a deliberate **hard tier**: situations with no direct "
        "green-card path (TPS-only, DACA-only, tourist with no basis), multi-pathway "
        "cases, and traps a keyword system would miss (EB-1C transfer, widow "
        "self-petition, missing certified translation, late conditional-removal).\n\n"
        "Pathway is correct when `primaryPathway` matches the labeled category "
        "(\"unclear\" cases also pass if the model honestly returns low confidence). "
        "Document Review is correct when `overallStatus` is in the expected set **and** "
        "the flagged issue mentions the real problem.\n\n"
        "## Honest limitations\n\n"
        "- This measures **classification and issue-spotting**, not the legal "
        "correctness of downstream prose. It is a regression guard, not a claim of "
        "legal infallibility.\n"
        "- Grading is intentionally lenient on genuinely multi-pathway cases (either "
        "valid answer passes), reflecting that real cases have more than one route.\n"
        "- Free-text inputs outside this set can still fail; the set should grow.\n"
        "- The product's own guardrail is that uncertain cases return "
        "\"Unclear — needs attorney review\" rather than a forced guess.\n\n"
        "Reproduce: `OPENAI_API_KEY=... python evals/run_evals.py --date YYYY-MM-DD`\n"
    )
    (out_dir / "RESULTS.md").write_text(md)

    print(f"\nPathway:  {pw_acc*100:.0f}%   Document Review: {rv_acc*100:.0f}%   "
          f"Overall: {overall*100:.0f}%  ({n} cases)")
    print("Wrote evals/results.json and evals/RESULTS.md")

    if args.min and (pw_acc < args.min or rv_acc < args.min):
        sys.exit(1)


if __name__ == "__main__":
    main()
