"""Deterministic, offline retrieval over the curated USCIS / Dept. of State
source corpus (datasets/uscis_sources.json).

No embeddings, no network: scoring is plain lexical token overlap plus a small
keyword/form-number boost. The same query always returns the same sources, so
citations are reproducible and every quote is verbatim from the corpus on disk.

Public API:
    retrieve(query, k=3) -> list[dict]  # each: id,title,url,topic,retrieved_at,quote,score
    as_citation(source)  -> dict        # title,url,retrieved_at,quote
"""
import json
import os
import re

_HERE = os.path.dirname(os.path.abspath(__file__))
_CORPUS_PATH = os.path.join(_HERE, 'datasets', 'uscis_sources.json')

# Small English stopword set so common words don't dominate the overlap score.
_STOPWORDS = {
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for',
    'from', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'of',
    'on', 'or', 'our', 'the', 'this', 'to', 'use', 'want', 'what', 'when',
    'where', 'which', 'who', 'will', 'with', 'you', 'your',
}


def _tokenize(text):
    """Lowercase alphanumeric tokens with form numbers normalized so that
    'I-130', 'i130' and 'i 130' all collapse to the same token 'i130'."""
    if not text:
        return []
    s = text.lower()
    # Join a single form letter to an adjacent number: "i 130" -> "i130",
    # and drop the hyphen in "i-130" / "n-400".
    s = re.sub(r'\b([a-z])[\s\-]?(\d{2,4})\b', r'\1\2', s)
    raw = re.findall(r'[a-z0-9]+', s)
    return [t for t in raw if t not in _STOPWORDS]


# ── Pathway / stage classification ───────────────────────────────────────────
# Each curated source is tagged with the pathway(s) and process stage it serves,
# derived deterministically from its form number / URL (a classification of the
# EXISTING verbatim quote, never new facts). This lets retrieval cover questions
# by pathway and stage, and lets the eval score retrieval per topic. Tag words
# are also folded into the lexical index so a query like "naturalization" or
# "priority date" ranks the right source.
_TAGS_BY_URLPART = {
    '/i-130': (['family'], ['petition'],
               ['family', 'relative', 'spouse', 'petition']),
    '/i-485': (['family', 'employment'], ['adjustment'],
               ['adjustment', 'adjust', 'status', 'green', 'card']),
    '/n-400': (['naturalization'], ['naturalization'],
               ['naturalization', 'citizen', 'citizenship']),
    '/i-90': (['renewal'], ['maintenance'],
              ['renew', 'replace', 'expired', 'card']),
    '/i-765': (['employment-authorization'], ['work-permit'],
               ['work', 'permit', 'employment', 'authorization', 'ead']),
    'visa-bulletin': (['family', 'employment'], ['priority-date'],
                      ['priority', 'date', 'bulletin', 'wait', 'current', 'backlog']),
}


def _classify(entry):
    """Return (pathways, stages, extra_tag_tokens) for a corpus entry."""
    url = (entry.get('url') or '').lower()
    topic = (entry.get('topic') or '').lower()
    for part, tags in _TAGS_BY_URLPART.items():
        if part in url:
            return tags
    if 'visa-bulletin' in topic:
        return _TAGS_BY_URLPART['visa-bulletin']
    return ([], [], [])


def _load_corpus(path):
    with open(path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    corpus = []
    for entry in data:
        pathways, stages, extra = _classify(entry)
        # Persist tags on the entry so retrieve() returns them and callers can
        # filter/group by pathway and stage.
        entry = dict(entry)
        entry.setdefault('pathways', pathways)
        entry.setdefault('stages', stages)
        tokens = _tokenize(
            ' '.join([
                entry.get('title', ''),
                entry.get('topic', ''),
                entry.get('quote', ''),
                ' '.join(pathways), ' '.join(stages), ' '.join(extra),
            ])
        )
        corpus.append({'entry': entry, 'token_set': set(tokens)})
    return corpus


# Loaded once at import.
_CORPUS = _load_corpus(_CORPUS_PATH)


def _score(query_tokens, token_set):
    """Distinct-token overlap between the query and a source document.
    Form-number tokens (e.g. 'i130', 'n400') count double — they are the
    strongest topical signal in this corpus."""
    score = 0
    for t in query_tokens:
        if t in token_set:
            score += 2 if re.fullmatch(r'[a-z]\d{2,4}', t) else 1
    return score


def retrieve(query, k=3):
    """Return up to k corpus sources most lexically relevant to `query`,
    highest score first. Sources with zero overlap are excluded, so an
    off-topic query yields []. Deterministic: ties break by corpus order."""
    if not isinstance(query, str):
        return []
    q_tokens = _tokenize(query)
    if not q_tokens:
        return []
    q_unique = set(q_tokens)
    scored = []
    for idx, doc in enumerate(_CORPUS):
        s = _score(q_unique, doc['token_set'])
        if s > 0:
            scored.append((-s, idx, doc['entry'], s))
    scored.sort(key=lambda x: (x[0], x[1]))
    out = []
    for _, _, entry, s in scored[:max(0, int(k))]:
        item = dict(entry)
        item['score'] = s
        out.append(item)
    return out


def as_citation(source):
    """Project a corpus source down to the citation shape returned by the API."""
    return {
        'title': source.get('title', ''),
        'url': source.get('url', ''),
        'retrieved_at': source.get('retrieved_at', ''),
        'quote': source.get('quote', ''),
    }


# Minimum top-source score for retrieval to count as "sufficient". Below this we
# expose "sources insufficient" to the caller/UI rather than relying on the model
# to be appropriately humble. A single weak lexical overlap (score 1) is treated
# as insufficient; a form-number hit (score 2) or multiple overlaps clears it.
SUFFICIENCY_MIN_TOP_SCORE = 2


def is_insufficient(sources, min_top_score=SUFFICIENCY_MIN_TOP_SCORE):
    """True when the retrieved corpus does not adequately cover the query: no
    hits at all, or the best hit is only a weak single-token overlap. Used to
    surface a 'verify at uscis.gov' notice instead of a confident-looking answer
    built on thin retrieval."""
    if not sources:
        return True
    top = max((s.get('score', 0) for s in sources), default=0)
    return top < min_top_score


def coverage(sources):
    """Pathway/stage coverage summary of a retrieved set, for the UI / eval."""
    pathways, stages = set(), set()
    for s in sources:
        pathways.update(s.get('pathways', []) or [])
        stages.update(s.get('stages', []) or [])
    return {'pathways': sorted(pathways), 'stages': sorted(stages),
            'count': len(sources)}


def build_sources_block(sources):
    """Render retrieved sources as a numbered, verbatim block for a system
    prompt. Returns '' when there are no sources."""
    if not sources:
        return ''
    lines = ['OFFICIAL SOURCES (verbatim — ground your answer ONLY in these):']
    for i, s in enumerate(sources, 1):
        lines.append(
            f'[{i}] {s.get("title", "")} ({s.get("url", "")}, retrieved {s.get("retrieved_at", "")})\n'
            f'    "{s.get("quote", "")}"'
        )
    return '\n'.join(lines)
