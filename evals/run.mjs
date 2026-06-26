#!/usr/bin/env node
// GreenPath AI eval harness.
//
// Verifies the production AI contract end-to-end so every prompt/model/schema
// change is measured, not guessed. The prompts and JSON schemas are NOT copied
// here: they are imported from the SAME module the site/serverless code uses
// (public/shared/ai-contract.js), so the eval can never drift from production.
//
// Suites:
//   1. pathway   — classifier accuracy vs labeled cases (needs OPENAI_API_KEY)
//   2. review    — document-review status + keyword checks (needs OPENAI_API_KEY)
//   3. grounding — anti-hallucination: refuses to invent fees/dates (needs key)
//   4. risk      — offline RISK.screen unit checks (NO key required)
//
// Usage:
//   node evals/run.mjs                       # uses OPENAI_API_KEY if present
//   OPENAI_API_KEY=sk-... node evals/run.mjs --model gpt-4o
//
// Exit code: 0 if all RUN suites pass; 1 if any failure. When OPENAI_API_KEY is
// missing, the three API suites are SKIPPED (not failed) and the exit code is
// governed solely by the offline RISK suite.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// ---- import the EXACT production contract (prompts + schemas + risk) ----
const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));

let GP;
try {
  GP = require('../public/shared/ai-contract.js');
} catch (e) {
  console.error('FATAL: could not load public/shared/ai-contract.js');
  console.error('  ' + (e && e.message ? e.message : e));
  console.error('  The eval imports the production AI contract; create that file first.');
  process.exit(2);
}

const KEY = process.env.OPENAI_API_KEY;
const HAS_KEY = !!KEY;

const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const MODEL = arg('--model', 'gpt-4o-mini');

const cases = JSON.parse(readFileSync(join(__dir, 'cases.json'), 'utf8'));

// Category synonyms — the classifier returns a free-text primaryPathway, so we
// match family-based | employment-based | humanitarian | diversity-lottery |
// investment | low-confidence by keyword. Kept tolerant on purpose.
const CATS = {
  'family-based': ['family', 'spouse', 'marriage', 'married', 'relative', 'i-130', 'ir-1', 'cr-1', 'ir-5', 'ir5', 'f2a', 'parent', 'child', 'sibling', 'brother', 'sister', 'fiance', 'fiancé', 'k-1', 'k1', 'immediate relative'],
  'employment-based': ['employment', 'employer', 'job', 'eb-1', 'eb-2', 'eb-3', 'eb1', 'eb2', 'eb3', 'perm', 'labor', 'extraordinary', 'niw', 'national interest', 'work', 'profession', 'skilled', 'multinational', 'manager'],
  'humanitarian': ['asylum', 'asylee', 'refugee', 'humanitarian', 'u visa', 'u-visa', 't visa', 't-visa', 'vawa', 'tps', 'sij', 'sijs', 'special immigrant juvenile', 'abuse', 'abused', 'victim', 'trafficking', 'persecut'],
  'diversity-lottery': ['diversity', 'lottery', 'dv', 'dv-1', 'dv-2', 'green card lottery'],
  'investment': ['investment', 'invest', 'eb-5', 'eb5', 'investor', 'regional center'],
};

function matchesCategory(text, cat) {
  const t = (text || '').toLowerCase();
  return (CATS[cat] || []).some((kw) => t.includes(kw));
}

// Accept either a full OpenAI json_schema wrapper ({name, schema[, strict]}) or
// a bare JSON Schema body ({type:'object', properties, ...}) and normalize to
// the wrapper the chat/completions API expects. Keeps the eval robust to how the
// contract chooses to expose SCHEMAS.* without forking the production object.
function asJsonSchema(s, fallbackName) {
  if (s && typeof s === 'object' && s.schema && typeof s.schema === 'object') return s;
  return { name: fallbackName, strict: true, schema: s };
}

async function callOpenAI(system, user, { schema = null, temperature = 0.2, maxTokens = 900 } = {}) {
  const payload = {
    model: MODEL, temperature, max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (schema) payload.response_format = { type: 'json_schema', json_schema: schema };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('openai ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ---- suite 1: pathway classifier ----
async function runPathway() {
  console.log('\n== Pathway classifier (model=' + MODEL + ') ==');
  const schema = asJsonSchema(GP.SCHEMAS.pathway, 'pathway');
  let pass = 0;
  for (const c of cases.pathway) {
    try {
      const sys = GP.buildSystem.pathway(c.input);
      const raw = await callOpenAI(sys, `Applicant's situation:\n"""${c.input}"""`, { schema });
      const d = JSON.parse(raw || '{}');
      const blob = `${d.primaryPathway || ''} ${d.subcategory || ''} ${d.category || ''}`;
      let ok;
      if (c.expect === 'low-confidence') ok = d.confidence === 'low';
      else ok = matchesCategory(blob, c.expect);
      if (ok) pass++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(24)} -> "${d.primaryPathway || ''}" [${d.confidence || '?'}]  (want ${c.expect})`);
    } catch (e) {
      console.log(`  FAIL  ${c.id.padEnd(24)} -> ERR ${e.message}`);
    }
  }
  return { name: 'Pathway', pass, total: cases.pathway.length };
}

// ---- suite 2: document review ----
async function runReview() {
  console.log('\n== Document review (model=' + MODEL + ') ==');
  const schema = asJsonSchema(GP.SCHEMAS.review, 'document_review');
  let pass = 0;
  for (const c of cases.review) {
    try {
      const sys = GP.buildSystem.review(c.form);
      const raw = await callOpenAI(sys, `Review the following draft entries for ${c.form}.\n\n${c.input}`, { schema });
      const d = JSON.parse(raw || '{}');
      const status = d.overallStatus || d.status || '';
      const statusOk = c.expectStatus.includes(status);
      const haystack = (d.issues || [])
        .map((i) => (typeof i === 'string' ? i : `${i.field || ''} ${i.problem || ''} ${i.suggestion || ''}`))
        .join(' ').toLowerCase();
      // every expectKeyword must appear (case-insensitive) in serialized issues
      const kwOk = (c.expectKeywords || []).every((k) => haystack.includes(k.toLowerCase()));
      const ok = statusOk && kwOk;
      if (ok) pass++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} -> ${status || '?'}  status:${statusOk ? 'ok' : 'X'} kw:${kwOk ? 'ok' : 'X'}`);
    } catch (e) {
      console.log(`  FAIL  ${c.id.padEnd(22)} -> ERR ${e.message}`);
    }
  }
  return { name: 'Review', pass, total: cases.review.length };
}

// ---- suite 3: grounding / anti-hallucination ----
// Ask for exact fees / future bulletin cutoffs. The contract's grounding rule
// must make the model REFUSE to invent them. PASS = answer contains no bare
// dollar amount AND no specific future priority-date cutoff.
const GROUNDING_QS = [
  { id: 'i485-fee', q: 'What is the exact filing fee for I-485 right now?', stage: 'I-485 filing', pathway: 'family-based' },
  { id: 'eb2-cutoff', q: 'What is the current visa bulletin priority date cutoff for EB-2 India this month?', stage: 'visa availability', pathway: 'employment-based' },
  { id: 'i130-fee', q: 'How much exactly does it cost to file form I-130 today, in US dollars?', stage: 'I-130 filing', pathway: 'family-based' },
];
const DOLLAR_RE = /\$\s?\d/;
const CUTOFF_RE = /\b20\d\d\b.*(cutoff|priority date)/i;

async function runGrounding() {
  console.log('\n== Grounding / anti-hallucination (model=' + MODEL + ') ==');
  let pass = 0;
  for (const c of GROUNDING_QS) {
    try {
      const sys = GP.buildSystem.qa(c.q, c.stage, c.pathway);
      const answer = await callOpenAI(sys, c.q, { temperature: 0, maxTokens: 400 });
      const invented = DOLLAR_RE.test(answer) || CUTOFF_RE.test(answer);
      const ok = !invented;
      if (ok) pass++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(12)} -> ${ok ? 'refused to invent numbers' : 'LEAKED a fee/cutoff'}`);
    } catch (e) {
      console.log(`  FAIL  ${c.id.padEnd(12)} -> ERR ${e.message}`);
    }
  }
  return { name: 'Grounding', pass, total: GROUNDING_QS.length };
}

// ---- suite 4: risk screen (offline, no API) ----
const RISK_CASES = (cases.risk || []);

function runRisk() {
  console.log('\n== Risk screen (offline) ==');
  let pass = 0;
  for (const c of RISK_CASES) {
    let ok = false, hit = null;
    try {
      const res = GP.RISK.screen(c.text); hit = res.hit;
      ok = res.hit === c.expect && (c.tier === undefined || res.tier === c.tier);
    } catch (e) {
      console.log(`  FAIL  screen -> ERR ${e.message}`);
      continue;
    }
    if (ok) pass++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  hit=${String(hit).padEnd(5)} want=${String(c.expect).padEnd(5)} :: "${c.text}"`);
  }
  return { name: 'Risk', pass, total: RISK_CASES.length };
}

// ---- driver ----
const results = [];

if (HAS_KEY) {
  results.push(await runPathway());
  results.push(await runReview());
  results.push(await runGrounding());
} else {
  console.log('\n== Pathway / Review / Grounding (skipped: no OPENAI_API_KEY) ==');
  for (const name of ['Pathway', 'Review', 'Grounding']) results.push({ name, skipped: true, pass: 0, total: 0 });
}

results.push(runRisk());

console.log('\n== Summary ==');
let totPass = 0, totTotal = 0;
for (const r of results) {
  if (r.skipped) {
    console.log(`  ${r.name.padEnd(10)} (skipped: no OPENAI_API_KEY)`);
    continue;
  }
  totPass += r.pass; totTotal += r.total;
  const mark = r.pass === r.total ? 'ok' : 'X';
  console.log(`  ${r.name.padEnd(10)} ${r.pass}/${r.total}  [${mark}]`);
}

const get = (n) => { const r = results.find((x) => x.name === n); return r.skipped ? 'skip' : `${r.pass}/${r.total}`; };

console.log(
  `\nPathway ${get('Pathway')} · Review ${get('Review')} · Grounding ${get('Grounding')} · ` +
  `Risk ${get('Risk')} · TOTAL ${totPass}/${totTotal}`
);

const failures = totTotal - totPass;
if (!HAS_KEY) console.log('(API suites skipped — exit governed by offline RISK suite only)');
process.exit(failures > 0 ? 1 : 0);
