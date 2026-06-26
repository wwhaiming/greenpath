"""GreenPath retrieval package (RAG corpus, ingestion, monitoring, grounding).

This package groups the source-grounding subsystem (judge gap: "single large
server / single-file frontend - split into modules"):

  * ``rag``       - deterministic lexical retriever over the on-disk corpus
                    (kept as the top-level ``rag`` module for backward-compatible
                    imports; re-exported here so callers can use
                    ``from retrieval import retrieve`` going forward).
  * ``ingest``    - official-source ingestion pipeline (verbatim quote extraction
                    + provenance metadata).
  * ``monitor``   - content/checksum drift monitoring for watched pages.
  * ``claims``    - claim-to-source grounding: verify the model's answer is
                    supported by retrieved quotes, sentence by sentence.
"""
import rag as _rag  # top-level module (unchanged on-disk location)

# Re-export the stable retrieval API under the package namespace.
retrieve = _rag.retrieve
as_citation = _rag.as_citation
is_insufficient = _rag.is_insufficient
coverage = _rag.coverage
build_sources_block = _rag.build_sources_block
SUFFICIENCY_MIN_TOP_SCORE = _rag.SUFFICIENCY_MIN_TOP_SCORE

__all__ = [
    "retrieve", "as_citation", "is_insufficient", "coverage",
    "build_sources_block", "SUFFICIENCY_MIN_TOP_SCORE",
]
