"""
GreenPath AI backend (Python / Flask).

Python equivalent of netlify/functions/chat.js. Holds the API key server-side
and exposes one endpoint per GreenPath AI feature with its system prompt baked in:

    POST /api/pathway           -> intake -> most likely green card pathway (JSON)
    POST /api/stage-qa          -> answer a stage-specific question (text)
    POST /api/document-review   -> pre-submission form error check (JSON)
    POST /api/interview         -> turn-by-turn practice interview (JSON)
    POST /api/chat              -> raw pass-through proxy (same contract as chat.js)

The browser never sees the key. Point greenpath-artifact.html at these routes.

Backend: OpenAI. Put your key in .env as:
    OPENAI_API_KEY=sk-...

Run:
    pip install flask requests python-dotenv
    # add OPENAI_API_KEY=sk-... to .env
    python greenpath_ai.py
    # serves on http://localhost:8888  (also serves the static HTML)
"""

import json
import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

# Load KEY=value lines from .env into the environment on startup.
load_dotenv()

# OpenAI chat-completions endpoint. Keep this aligned with the browser constant
# in index.html and the Netlify proxy in netlify/functions/chat.js.
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"
ALLOWED_MODELS = {"gpt-4o-mini", "gpt-4o"}
ROLES = {"system", "user", "assistant"}
MAX_MESSAGES = 20
MAX_CONTENT_CHARS = 6000
MAX_TOTAL_CHARS = 18000

app = Flask(__name__, static_folder=".", static_url_path="")


def clamp_number(value, fallback, min_value, max_value):
    return min(max(float(value), min_value), max_value) if isinstance(value, (int, float)) else fallback


def normalize_messages(messages):
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return None

    total_chars = 0
    normalized = []
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in ROLES or not isinstance(message.get("content"), str):
            return None
        content = message["content"][:MAX_CONTENT_CHARS]
        total_chars += len(content)
        if total_chars > MAX_TOTAL_CHARS:
            return None
        normalized.append({"role": message["role"], "content": content})
    return normalized


# ----------------------------------------------------------------------------
# System prompts (one per feature). These are guidance tools, NOT legal advice.
# ----------------------------------------------------------------------------

PATHWAY_PROMPT = """You are an immigration pathway advisor for GreenPath. Based on the user's intake answers, determine the most likely green card pathway(s).

Analyze these inputs: relationship to a U.S. citizen/LPR, employment situation, current immigration status, time in the U.S., and special circumstances (asylum, military, investment).

Respond ONLY with valid JSON, no preamble or markdown:
{
  "primaryPathway": "family-based | employment-based | humanitarian | diversity-lottery | investment",
  "subcategory": "e.g., IR-1 spouse of citizen, EB-2, etc.",
  "confidence": "high | medium | low",
  "reasoning": "2-3 sentence plain-language explanation",
  "nextSteps": ["step 1", "step 2", "step 3"],
  "alternativePathways": ["other eligible options if any"]
}

Rules: Never give legal advice or guarantees. Use plain language at an 8th-grade reading level. If inputs are insufficient, set confidence to "low" and note what's missing in reasoning. Recommend consulting an accredited immigration attorney for complex cases."""

STAGE_QA_PROMPT = """You are a knowledgeable, patient guide for the U.S. green card process within GreenPath. The user is at a specific stage of their journey and has a question.

Context provided: {user's current pathway, current stage, question}

Answer clearly and accurately. Keep responses focused, factual, and under 200 words unless detail is essential. Use plain language; define any form numbers or terms you mention (e.g., "Form I-130, the petition that establishes a family relationship").

Rules:
- Never invent processing times, fees, or form requirements. If you are not certain, say so and direct the user to USCIS.gov.
- Never provide legal advice or predict case outcomes.
- Be encouraging but honest about complexity.
- If the question is outside immigration scope, gently redirect.
- End with one concrete next action when appropriate."""

DOCUMENT_REVIEW_PROMPT = """You are a document-review assistant for GreenPath. You help users catch common errors in immigration forms BEFORE submission. You are NOT a substitute for legal review.

The user will provide form text or describe a form field's contents. Identify potential issues: blank required fields, date inconsistencies, name mismatches, formatting errors, missing signatures, and answers that may need supporting evidence.

Respond ONLY with valid JSON, no preamble or markdown:
{
  "overallStatus": "looks-good | needs-attention | major-issues",
  "issues": [
    {
      "severity": "high | medium | low",
      "field": "field name or location",
      "problem": "what's wrong",
      "suggestion": "how to fix it"
    }
  ],
  "reminders": ["general pre-submission checks"]
}

Rules: Flag only genuine issues; do not invent problems. Never confirm a form is "correct" or "approved"—use "looks-good" to mean no obvious errors found. Always remind the user to verify against official USCIS instructions and consider professional review."""

INTERVIEW_PROMPT = """You are an empathetic green card interview simulator for GreenPath. You role-play as a USCIS immigration officer conducting a realistic but supportive practice interview.

Context: {pathway}

Conduct the interview turn by turn:
- Ask ONE question at a time, in the style and tone of a real officer.
- Adapt follow-up questions to the user's answers, as a real officer would.
- After the user answers, optionally provide brief, constructive coaching in a clearly separated note before asking the next question.
- Draw from the relevant question category for their pathway.

Rules:
- Stay realistic but never hostile or intimidating—this is a safe practice space.
- Do not fabricate that the user "passed" or "failed"; this is practice only.
- Keep the user oriented (e.g., "Question 3 of 10").
- If the user seems anxious, reassure them. Real interviews are conversations, not interrogations.

Respond ONLY with valid JSON, no preamble or markdown:
{
  "coaching": {"level": "clear | clarify | help", "note": "one short sentence of feedback specific to their last answer, or null on the first turn"},
  "questionNumber": 1,
  "totalQuestions": 8,
  "nextQuestion": "the next question to ask, or a closing line",
  "done": false,
  "summary": "only when done=true: encouraging summary of strengths and 2-3 areas to practice, else null"
}"""


# ----------------------------------------------------------------------------
# LLM call (Groq, OpenAI-compatible; key from env)
# ----------------------------------------------------------------------------

def call_llm(system, messages, max_tokens=1000, model=DEFAULT_MODEL, temperature=0.4, response_format=None):
    """Send a chat request to OpenAI.

    Returns (status_code, dict). On success the dict is normalized to the
    Anthropic shape {"content": [{"type": "text", "text": ...}]} so the rest of
    the code and the existing HTML parsers work unchanged.
    """
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return 500, {"error": "Server missing OPENAI_API_KEY"}

    model = model if model in ALLOWED_MODELS else DEFAULT_MODEL
    max_tokens = int(clamp_number(max_tokens, 900, 80, 1200))
    temperature = clamp_number(temperature, 0.4, 0, 1)

    # OpenAI carries the system prompt as a system-role message.
    chat = ([{"role": "system", "content": system}] if system else []) + messages

    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": chat,
    }
    if isinstance(response_format, dict):
        payload["response_format"] = response_format

    try:
        r = requests.post(
            OPENAI_URL,
            headers={
                "content-type": "application/json",
                "authorization": "Bearer " + key,
            },
            data=json.dumps(payload),
            timeout=60,
        )
    except requests.RequestException as err:
        return 502, {"error": "Upstream request failed: " + str(err)}

    try:
        data = r.json()
    except ValueError:
        return r.status_code, {"error": "Upstream returned non-JSON", "raw": r.text}

    if r.status_code != 200:
        return r.status_code, data  # pass OpenAI's error through

    # Normalize Groq's {choices:[{message:{content}}]} -> Anthropic content shape.
    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        text = ""
    return 200, {"content": [{"type": "text", "text": text}], "model": data.get("model", model)}


def text_from(resp):
    """Pull the joined text out of a normalized (Anthropic-shape) response."""
    blocks = resp.get("content", []) or []
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()


def extract_json(text):
    """Robustly pull a JSON object out of model output, even with stray prose."""
    text = text.replace("```json", "").replace("```", "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


# ----------------------------------------------------------------------------
# Feature endpoints
# ----------------------------------------------------------------------------

@app.route("/api/pathway", methods=["POST"])
def pathway():
    """Body: {"intake": "<free text or summary of intake answers>"}"""
    data = request.get_json(silent=True) or {}
    intake = data.get("intake", "").strip()
    if not intake:
        return jsonify({"error": "Missing 'intake'"}), 400

    status, resp = call_llm(
        PATHWAY_PROMPT,
        [{"role": "user", "content": "Intake answers:\n" + intake}],
        max_tokens=900,
    )
    if status != 200:
        return jsonify(resp), status
    try:
        return jsonify(extract_json(text_from(resp)))
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "Model did not return valid JSON", "raw": text_from(resp)}), 502


@app.route("/api/stage-qa", methods=["POST"])
def stage_qa():
    """Body: {"pathway": "...", "stage": "...", "question": "..."}  -> plain text answer."""
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    if not question:
        return jsonify({"error": "Missing 'question'"}), 400

    context = (
        f"Current pathway: {data.get('pathway', 'unknown')}\n"
        f"Current stage: {data.get('stage', 'unknown')}\n"
        f"Question: {question}"
    )
    status, resp = call_llm(
        STAGE_QA_PROMPT,
        [{"role": "user", "content": context}],
        max_tokens=600,
    )
    if status != 200:
        return jsonify(resp), status
    return jsonify({"answer": text_from(resp)})


@app.route("/api/document-review", methods=["POST"])
def document_review():
    """Body: {"document": "<form text or field description>"}  -> structured JSON."""
    data = request.get_json(silent=True) or {}
    document = data.get("document", "").strip()
    if not document:
        return jsonify({"error": "Missing 'document'"}), 400

    status, resp = call_llm(
        DOCUMENT_REVIEW_PROMPT,
        [{"role": "user", "content": "Form content to review:\n" + document}],
        max_tokens=900,
    )
    if status != 200:
        return jsonify(resp), status
    try:
        return jsonify(extract_json(text_from(resp)))
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "Model did not return valid JSON", "raw": text_from(resp)}), 502


@app.route("/api/interview", methods=["POST"])
def interview():
    """Body: {
        "pathway": "marriage-based | employment-based | ...",
        "transcript": [{"role": "officer"|"applicant", "content": "..."}],
        "answer": "<the applicant's latest answer, empty to start>"
    }  -> structured JSON (one question per turn)."""
    data = request.get_json(silent=True) or {}
    pathway_ctx = data.get("pathway", "marriage-based")
    transcript = data.get("transcript", []) or []
    answer = data.get("answer", "").strip()

    lines = []
    for turn in transcript:
        who = "Officer" if turn.get("role") == "officer" else "Applicant"
        lines.append(f"{who}: {turn.get('content', '')}")
    transcript_text = "\n".join(lines) if lines else "(no questions asked yet)"

    if answer:
        instruction = (
            f'The applicant just answered with: "{answer}". Evaluate THAT specific '
            "answer, then ask a follow-up or the next question that logically responds "
            "to what they said."
        )
    else:
        instruction = "Begin the interview with your first question. Omit coaching (set it to null)."

    system = INTERVIEW_PROMPT.replace("{pathway}", pathway_ctx)
    user = f"{instruction}\n\nTranscript so far:\n{transcript_text}"

    status, resp = call_llm(
        system,
        [{"role": "user", "content": user}],
        max_tokens=600,
    )
    if status != 200:
        return jsonify(resp), status
    try:
        return jsonify(extract_json(text_from(resp)))
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "Model did not return valid JSON", "raw": text_from(resp)}), 502


@app.route("/api/chat", methods=["POST"])
def chat():
    """Raw pass-through, same contract as netlify/functions/chat.js.
    Lets the existing HTML keep working with a one-line URL swap."""
    data = request.get_json(silent=True) or {}
    messages = normalize_messages(data.get("messages"))
    if not messages:
        return jsonify({"error": "Invalid messages"}), 400

    status, resp = call_llm(
        None,
        messages,
        max_tokens=data.get("max_tokens", 900),
        model=data.get("model", DEFAULT_MODEL),
        temperature=data.get("temperature", 0.4),
        response_format=data.get("response_format"),
    )
    if status != 200:
        return jsonify(resp), status

    # Match OpenAI chat-completions shape so the same browser code works whether
    # localhost is served by Flask or Netlify Dev.
    return jsonify({
        "model": resp.get("model", DEFAULT_MODEL),
        "choices": [
            {"message": {"role": "assistant", "content": text_from(resp)}}
        ]
    }), 200


# ----------------------------------------------------------------------------
# Serve the static site (so the HTML and API share one origin -> no CORS pain)
# ----------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(".", "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8888"))
    app.run(host="0.0.0.0", port=port, debug=True)
