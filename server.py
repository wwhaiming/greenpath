import os
import json
from flask import Flask, request, jsonify, send_from_directory
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_root   = os.path.dirname(os.path.abspath(__file__))
_public = os.path.join(_root, 'public')   # greenpath-new single-page frontend (served by default)
_dist   = os.path.join(_root, 'dist')     # legacy React/Vite build (kept for reference)
if os.path.isfile(os.path.join(_public, 'index.html')):
    _static = _public
elif os.path.isdir(_dist):
    _static = _dist
else:
    _static = _root

app = Flask(__name__, static_folder=_static, static_url_path='')
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

CHAT_MODEL    = 'gpt-4o-mini'
QUALITY_MODEL = 'gpt-4o-mini'

# Real Visa Bulletin data grounding (datasets/visa_waits.json) injected into the
# Q&A and pathway prompts so answers use actual wait times / priority dates / trends.
try:
    from visa_data import build_brief
    VISA_BRIEF = build_brief()
except Exception:
    VISA_BRIEF = ''


def _ground(system_prompt):
    return system_prompt + ('\n\n' + VISA_BRIEF if VISA_BRIEF else '')


# ── STATIC ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(_static, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    full = os.path.join(_static, path)
    if os.path.isfile(full):
        return send_from_directory(_static, path)
    return send_from_directory(_static, 'index.html')


# ── /api/chat  (generic – used for date extraction and translation) ──────────

@app.route('/api/chat', methods=['POST'])
def api_chat():
    try:
        data = request.get_json(force=True)
        messages = data.get('messages', [])
        max_tokens = int(data.get('max_tokens', 1000))
        if not messages:
            return jsonify({'error': 'messages required'}), 400

        resp = client.chat.completions.create(
            model=CHAT_MODEL,
            max_tokens=max_tokens,
            messages=messages,
        )
        text = resp.choices[0].message.content
        # Dual response shape so both frontends work off the same endpoint:
        #   `content` (Anthropic-style) — read by the legacy React UI
        #   `choices` (OpenAI-style)    — read by the greenpath-new single-page frontend
        #                                 (aiChatMessages: data.choices[0].message.content)
        return jsonify({
            'content': [{'type': 'text', 'text': text}],
            'choices': [{'message': {'role': 'assistant', 'content': text}}],
            'model': CHAT_MODEL,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── /api/document-review ────────────────────────────────────────────────────

DR_SYSTEM = """You are GreenPath's immigration document review assistant. You review USCIS form entries \
described in plain text and identify issues that could trigger a Request for Evidence (RFE) or rejection.

IMPORTANT: This is general information only — never legal advice. Always recommend consulting a licensed \
immigration attorney for complex situations.

Return ONLY a JSON object with this exact structure (no prose, no markdown fences):
{
  "overallStatus": "looks-good" | "needs-attention" | "major-issues",
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "field": "field name or section",
      "problem": "clear description of the problem",
      "suggestion": "specific fix"
    }
  ],
  "reminders": ["pre-submission checklist item"]
}

overallStatus rules:
- "looks-good"      → no significant issues
- "needs-attention" → 1–2 medium issues, no high
- "major-issues"    → any high-severity issue OR 3+ issues total

Common high-severity issues to flag:
- Missing or blank required signature
- Date format inconsistency across documents (MM/DD/YYYY vs DD/MM/YYYY)
- Date of birth mismatch between form and passport
- Missing required fields left blank
- Conflicting information (name, SSN, A-number)

Common medium-severity issues:
- No end date for previous employment or address
- Address history gap > 5 days unexplained
- Prior marriages question left blank when applicable
- Overlapping date ranges in travel history

Common low-severity reminders:
- Verify passport-style photo requirements (2×2 in, white background)
- Confirm civil surgeon seal and signature on I-693
- Attach all required evidence (marriage certificate, employment letter, etc.)

Return ONLY valid JSON."""


@app.route('/api/document-review', methods=['POST'])
def api_document_review():
    try:
        data = request.get_json(force=True)
        document = data.get('document', '').strip()
        if not document:
            return jsonify({'error': 'document required'}), 400

        resp = client.chat.completions.create(
            model=QUALITY_MODEL,
            max_tokens=1200,
            messages=[{'role': 'system', 'content': DR_SYSTEM}, {'role': 'user', 'content': document}],
        )
        raw = resp.choices[0].message.content.strip().lstrip('`').rstrip('`')
        if raw.startswith('json'):
            raw = raw[4:].strip()
        result = json.loads(raw)
        return jsonify(result)
    except json.JSONDecodeError as e:
        return jsonify({'error': 'AI returned invalid JSON: ' + str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── /api/interview ───────────────────────────────────────────────────────────

IP_SYSTEM = """You are a USCIS immigration officer conducting a calm, professional practice interview \
for the GreenPath platform. Your goal is to help the applicant prepare — not to intimidate.

For each turn:
1. Review the applicant's last answer (if provided)
2. Give brief coaching feedback
3. Ask the next relevant question, OR end the session after 6–8 questions

Return ONLY a JSON object (no prose, no markdown fences):
{
  "coaching": {
    "level": "clear" | "clarify" | "help",
    "note": "one or two sentences of constructive feedback"
  },
  "nextQuestion": "the next question to ask the applicant",
  "done": false,
  "summary": null
}

When ending the session set done to true and provide a summary:
{
  "coaching": { ... },
  "nextQuestion": "closing remark",
  "done": true,
  "summary": "2–3 sentence overall performance note"
}

coaching level guide:
- "clear"   → answer was specific, direct, and complete
- "clarify" → answer needs more detail, dates, names, or was off-topic
- "help"    → applicant expressed confusion, fear, or said "I don't know"

Interview style rules:
- One question at a time
- Realistic but calm USCIS tone — professional, not hostile
- After the opening greeting (no prior answer), skip coaching and ask the first substantive question
- Tailor questions to the stated case type (pathway)
- After 6–8 answered questions, end the session gracefully
- NEVER give legal advice or predict case outcomes
- Return ONLY valid JSON"""


@app.route('/api/interview', methods=['POST'])
def api_interview():
    try:
        data = request.get_json(force=True)
        pathway   = data.get('pathway', 'Green card interview')
        transcript = data.get('transcript', [])
        answer    = data.get('answer', '')

        # Build the conversation messages from the running transcript
        messages = []

        # Inject pathway context as a priming user message if starting fresh
        if not transcript:
            messages.append({
                'role': 'user',
                'content': f'Begin a practice interview for: {pathway}. Start with a brief professional greeting then ask your first question.'
            })
        else:
            # Reconstruct the message history
            for turn in transcript:
                role = 'user' if turn.get('role') == 'applicant' else 'assistant'
                messages.append({'role': role, 'content': turn.get('content', '')})
            # Append current answer as the latest user turn
            if answer:
                messages.append({'role': 'user', 'content': answer})
            else:
                messages.append({'role': 'user', 'content': '[continue]'})

        resp = client.chat.completions.create(
            model=QUALITY_MODEL,
            max_tokens=800,
            messages=[{'role': 'system', 'content': IP_SYSTEM + f'\n\nCase type: {pathway}'}] + messages,
        )
        raw = resp.choices[0].message.content.strip().lstrip('`').rstrip('`')
        if raw.startswith('json'):
            raw = raw[4:].strip()
        result = json.loads(raw)
        return jsonify(result)
    except json.JSONDecodeError as e:
        return jsonify({'error': 'AI returned invalid JSON: ' + str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── /api/pathway ─────────────────────────────────────────────────────────────

PW_SYSTEM = """You are GreenPath's pathway routing assistant. Applicants describe their situation in plain \
language and you identify their most likely green card pathway.

IMPORTANT: This is general information only — never a legal determination. Always note that complex cases \
require a licensed immigration attorney.

Return ONLY a JSON object (no prose, no markdown fences):
{
  "primaryPathway": "Family-based" | "Employment-based" | "Humanitarian (Asylum/Refugee)" | "Diversity Visa" | "Investment (EB-5)" | "Special Immigrant" | "Unclear — needs attorney review",
  "subcategory": "e.g. Immediate Relative (spouse of U.S. citizen)",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2–3 sentences explaining why this pathway fits their situation",
  "nextSteps": ["step 1", "step 2", "step 3"],
  "alternativePathways": ["Other pathway worth exploring if applicable"]
}

Pathway selection guide:
- Family-based: spouse/parent/child/sibling of U.S. citizen or LPR
  • Immediate relative (IR): spouse, unmarried child under 21, or parent of U.S. citizen → no wait
  • Preference categories: adult children, siblings → visa bulletin wait
- Employment-based: employer sponsor, extraordinary ability, advanced degree, national interest
- Humanitarian: fleeing persecution (asylum), refugee status, VAWA, T-visa, U-visa
- Diversity Visa: selected in DV lottery (countries with historically low immigration)
- Investment: EB-5, minimum $800K investment creating U.S. jobs
- Unclear: conflicting signals or highly complex situation

Confidence guide:
- high   → strong clear indicator (e.g. married to U.S. citizen, has employer sponsor)
- medium → likely pathway but missing key detail
- low    → ambiguous; multiple pathways possible or situation unclear

Return ONLY valid JSON."""


@app.route('/api/pathway', methods=['POST'])
def api_pathway():
    try:
        data = request.get_json(force=True)
        intake = data.get('intake', '').strip()
        if not intake:
            return jsonify({'error': 'intake required'}), 400

        resp = client.chat.completions.create(
            model=QUALITY_MODEL,
            max_tokens=1000,
            messages=[{'role': 'system', 'content': _ground(PW_SYSTEM)}, {'role': 'user', 'content': intake}],
        )
        raw = resp.choices[0].message.content.strip().lstrip('`').rstrip('`')
        if raw.startswith('json'):
            raw = raw[4:].strip()
        result = json.loads(raw)
        return jsonify(result)
    except json.JSONDecodeError as e:
        return jsonify({'error': 'AI returned invalid JSON: ' + str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── /api/stage-qa ────────────────────────────────────────────────────────────

QA_SYSTEM = """You are GreenPath's immigration Q&A assistant. You give clear, plain-language answers about \
the U.S. green card process based on the applicant's specific pathway and current stage.

Rules:
- Answer in the same language the user writes in
- Be specific and practical, not vague
- Cite the relevant form number or USCIS policy where helpful
- Recommend verifying details at USCIS.gov
- NEVER give legal advice, predict case outcomes, or comment on specific case eligibility
- End every answer with: "Always verify current requirements at uscis.gov before taking action."
- Keep answers to 3–5 paragraphs maximum"""


@app.route('/api/stage-qa', methods=['POST'])
def api_stage_qa():
    try:
        data = request.get_json(force=True)
        pathway  = data.get('pathway', 'General')
        stage    = data.get('stage', 'General')
        question = data.get('question', '').strip()
        if not question:
            return jsonify({'error': 'question required'}), 400

        context = f'Pathway: {pathway}\nCurrent stage: {stage}\n\nQuestion: {question}'

        resp = client.chat.completions.create(
            model=QUALITY_MODEL,
            max_tokens=900,
            messages=[{'role': 'system', 'content': _ground(QA_SYSTEM)}, {'role': 'user', 'content': context}],
        )
        answer = resp.choices[0].message.content.strip()
        return jsonify({'answer': answer})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── MAIN ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
