"""Seeded offline demo mode for GreenPath's AI flows.

Hackathon judging is live-demo biased: if the OpenAI endpoint returns 401/503
during judging, the AI features look broken even though every safety and data
path still works. Demo mode removes that single point of failure WITHOUT faking a
live model.

When ``GREENPATH_DEMO=1`` (and no usable ``OPENAI_API_KEY``), each AI route
returns a recorded, deterministic, source-backed example instead of a 503. The
responses:
  * use the SAME JSON shapes the live routes return,
  * are grounded in the real on-disk corpus (stage-qa/pathway citations come from
    ``rag``, so they are verbatim, not invented),
  * are clearly marked ``"demo": true`` so nothing is passed off as a live model
    answer,
  * never give legal advice and keep the attorney-handoff stop in front of them
    (the route runs handoff detection BEFORE consulting demo mode).

This is an honest fallback for offline judging, not a replacement for the model.
"""
import os

import rag

_VERIFY = "Always verify current requirements at uscis.gov before taking action."


def enabled():
    """Demo mode is on only when explicitly requested via the env flag."""
    return (os.environ.get("GREENPATH_DEMO") or "").strip().lower() in ("1", "true", "yes", "on")


def _citations_for(*parts):
    sources = rag.retrieve(" ".join(p for p in parts if p), k=3)
    return [rag.as_citation(s) for s in sources], sources


def chat(messages, model=None):
    text = ("(Demo mode) GreenPath's live AI is not configured in this "
            "environment, so this is a recorded, safe sample answer. GreenPath "
            "gives general U.S. immigration information only - never legal advice. "
            + _VERIFY)
    return {
        "content": [{"type": "text", "text": text}],
        "choices": [{"message": {"role": "assistant", "content": text}}],
        "model": model or "demo",
        "demo": True,
    }


def stage_qa(question, pathway="General", stage="General"):
    citations, sources = _citations_for(question, pathway, stage)
    if citations:
        answer = ("(Demo mode sample) Based on the official sources below, here is "
                  "general information about your question. The cited USCIS/Dept. "
                  "of State material is the authority - read it in full. This is "
                  "general information, not legal advice. " + _VERIFY)
    else:
        answer = ("(Demo mode sample) Our offline sources do not directly cover "
                  "this question, so GreenPath will not guess. Please verify at "
                  "uscis.gov and consider speaking with a licensed attorney. " + _VERIFY)
    return {"answer": answer, "citations": citations,
            "sources_sufficient": not rag.is_insufficient(sources),
            "demo": True}


def pathway(intake):
    citations, _ = _citations_for(intake)
    return {
        "primaryPathway": "Family-based",
        "subcategory": "Sample result - demo mode",
        "confidence": "low",
        "reasoning": ("(Demo mode sample) GreenPath's live AI is not configured, "
                      "so this is a recorded example, not a determination about "
                      "your situation. Pathway routing is general information, "
                      "never a legal determination. " + _VERIFY),
        "nextSteps": [
            "Confirm your eligibility category against the official USCIS pages.",
            "Gather your identity and relationship/employment documents.",
            "Consult a licensed immigration attorney for a complex situation.",
        ],
        "alternativePathways": ["Employment-based"],
        "citations": citations,
        "demo": True,
    }


def document_review(document):
    return {
        "overallStatus": "needs-attention",
        "issues": [{
            "severity": "low",
            "field": "Demo mode",
            "problem": ("GreenPath's live AI is not configured, so this is a "
                        "recorded sample review rather than a real analysis of "
                        "your document."),
            "suggestion": ("Re-run with the AI configured for a real review, and "
                           "always have a licensed attorney check a complex case."),
        }],
        "reminders": ["This is general information only, not legal advice. " + _VERIFY],
        "demo": True,
    }


def interview(pathway="Green card interview"):
    return {
        "coaching": {"level": "clear",
                     "note": ("(Demo mode) Live AI is not configured; this is a "
                              "recorded sample interview turn.")},
        "nextQuestion": ("To start: can you tell me your full name and the basis "
                         "of your application?"),
        "done": False,
        "summary": None,
        "demo": True,
    }
