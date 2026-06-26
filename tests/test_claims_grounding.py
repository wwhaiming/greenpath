"""Regression tests for retrieval.claims.citations_from_report (council gap #2).

A citation must imply real support. When the model DID return structured claims
but ALL of them fail verbatim-quote validation, the verified-citation path must
return NO citations - otherwise a citation sits next to an ungrounded claim and
falsely implies support. The legacy all-sources fallback applies ONLY when there
were no structured claims at all (total == 0).
"""
from retrieval import claims as claim_grounding


SOURCES = [
    {"title": "USCIS Form I-485", "url": "https://uscis.gov/i-485",
     "quote": "File Form I-485 to apply to register permanent residence."},
    {"title": "USCIS Fees", "url": "https://uscis.gov/fees",
     "quote": "The filing fee for Form I-485 is listed on the fee schedule."},
]


def _as_citation(s):
    return {"title": s["title"], "url": s["url"]}


def test_structured_claims_all_fail_validation_returns_no_citations():
    # Model returned structured claims, but every quote_used is NOT a verbatim
    # substring of any cited source quote -> all unsupported.
    claims = [
        {"text": "The fee is $1,440.", "source_ids": [2],
         "quote_used": "the fee is exactly one thousand four hundred forty dollars"},
        {"text": "You must file within 30 days.", "source_ids": [1],
         "quote_used": "applicants must file within thirty days of arrival"},
    ]
    report = claim_grounding.validate(claims, SOURCES)
    assert report["total"] == 2
    assert report["supported"] == 0
    assert report["used_source_indexes"] == []

    cites = claim_grounding.citations_from_report(report, SOURCES, _as_citation)
    assert cites == []


def test_structured_claims_partially_supported_cites_only_used_sources():
    claims = [
        {"text": "File Form I-485 to register permanent residence.",
         "source_ids": [1],
         "quote_used": "File Form I-485 to apply to register permanent residence."},
        {"text": "The fee is $9,999.", "source_ids": [2],
         "quote_used": "the fee is nine thousand nine hundred ninety nine dollars"},
    ]
    report = claim_grounding.validate(claims, SOURCES)
    assert report["supported"] == 1
    assert report["used_source_indexes"] == [0]

    cites = claim_grounding.citations_from_report(report, SOURCES, _as_citation)
    assert cites == [_as_citation(SOURCES[0])]


def test_no_structured_claims_falls_back_to_all_sources():
    # Legacy/unstructured reply: validate sees zero claims -> total == 0, so the
    # all-sources fallback still applies (citations remain authoritative corpus
    # quotes, just not narrowed by a per-claim mapping that does not exist).
    report = claim_grounding.validate([], SOURCES)
    assert report["total"] == 0
    assert report["used_source_indexes"] == []

    cites = claim_grounding.citations_from_report(report, SOURCES, _as_citation)
    assert cites == [_as_citation(SOURCES[0]), _as_citation(SOURCES[1])]
