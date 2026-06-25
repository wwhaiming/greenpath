#!/usr/bin/env node
// GreenPath AI eval harness.
//
// Measures the pathway classifier and document review against labeled cases so
// every prompt/model change is verified, not guessed. Calls OpenAI directly
// (Structured Outputs) so it runs in CI with only a key.
//
// Usage:
//   OPENAI_API_KEY=sk-... node evals/run.mjs
//   OPENAI_API_KEY=sk-... node evals/run.mjs --model gpt-4o --min 0.8
//
// Exit code 0 if both suites meet --min accuracy (default 0.8), else 1.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('Set OPENAI_API_KEY in the environment.'); process.exit(2); }

const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const MODEL = arg('--model', 'gpt-4o');
const MIN = parseFloat(arg('--min', '0.8'));

const cases = JSON.parse(readFileSync(join(__dir, 'cases.json'), 'utf8'));

// ---- prompts (kept in sync with public/index.html) ----
const GROUNDING_RULE =
  'Never invent fees, dollar amounts, dates, or processing times. Keep it plain-language. ' +
  'This is general information, NOT legal advice; for complex cases point to authorized legal help.';

const PATHWAY_SYS =
  'You are a U.S. immigration intake assistant that suggests the most likely green card pathway ' +
  'from a free-text description. You are not a lawyer; flag when a case is complex enough to need an ' +
  'accredited attorney. Return ONLY JSON.\n\n' + GROUNDING_RULE;

const REVIEW_SYS =
  'You are a meticulous U.S. immigration paralegal reviewing a draft form for errors before submission. ' +
  'You are not a lawyer and do not give legal advice. Flag inconsistencies, missing required information, ' +
  'and common rejection triggers. Return ONLY JSON.\n\n' + GROUNDING_RULE;

const PATHWAY_SCHEMA = {
  name: 'pathway', strict: true,
  schema: { type: 'object', additionalProperties: false,
    properties: {
      primaryPathway: { type: 'string' }, subcategory: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      reasoning: { type: 'string' },
      nextSteps: { type: 'array', items: { type: 'string' } },
      alternativePathways: { type: 'array', items: { type: 'string' } } },
    required: ['primaryPathway', 'subcategory', 'confidence', 'reasoning', 'nextSteps', 'alternativePathways'] } };

const REVIEW_SCHEMA = {
  name: 'document_review', strict: true,
  schema: { type: 'object', additionalProperties: false,
    properties: {
      overallStatus: { type: 'string', enum: ['looks-good', 'needs-attention', 'major-issues'] },
      issues: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, field: { type: 'string' },
          problem: { type: 'string' }, suggestion: { type: 'string' } },
        required: ['severity', 'field', 'problem', 'suggestion'] } },
      reminders: { type: 'array', items: { type: 'string' } } },
    required: ['overallStatus', 'issues', 'reminders'] } };

// category synonyms — the app returns a free-text primaryPathway, so match by keyword
const CATS = {
  'family-based': ['family', 'spouse', 'marriage', 'relative', 'i-130', 'ir-1', 'cr-1', 'ir-5', 'parent', 'sibling', 'fiance', 'k-1', 'immediate relative'],
  'employment-based': ['employment', 'employer', 'job', 'eb-1', 'eb-2', 'eb-3', 'eb1', 'eb2', 'eb3', 'perm', 'labor', 'extraordinary', 'niw', 'national interest', 'work'],
  'humanitarian': ['asylum', 'refugee', 'humanitarian', 'u visa', 'u-visa', 't visa', 't-visa', 'vawa', 'tps', 'abuse', 'victim'],
  'diversity-lottery': ['diversity', 'lottery', 'dv', 'dv-1', 'green card lottery'],
  'investment': ['investment', 'invest', 'eb-5', 'eb5', 'investor'],
};

async function callOpenAI(system, user, schema, temperature) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL, temperature, max_tokens: 900,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: schema },
    }),
  });
  if (!res.ok) throw new Error('openai ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

function matchesCategory(text, cat) {
  const t = (text || '').toLowerCase();
  return (CATS[cat] || []).some((kw) => t.includes(kw));
}

async function runPathway() {
  console.log('\n== Pathway classifier (model=' + MODEL + ') ==');
  let pass = 0;
  for (const c of cases.pathway) {
    try {
      const d = await callOpenAI(PATHWAY_SYS, `Applicant's situation:\n"""${c.input}"""`, PATHWAY_SCHEMA, 0.2);
      const blob = `${d.primaryPathway} ${d.subcategory}`;
      let ok;
      if (c.expect === 'low-confidence') ok = d.confidence === 'low';
      else ok = matchesCategory(blob, c.expect);
      if (ok) pass++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(24)} -> "${d.primaryPathway}" [${d.confidence}]  (want ${c.expect})`);
    } catch (e) {
      console.log(`  ERR   ${c.id.padEnd(24)} -> ${e.message}`);
    }
  }
  return { pass, total: cases.pathway.length };
}

async function runReview() {
  console.log('\n== Document review (model=' + MODEL + ') ==');
  let pass = 0;
  for (const c of cases.review) {
    try {
      const d = await callOpenAI(REVIEW_SYS, `Review the following draft entries for ${c.form}.\n\n${c.input}`, REVIEW_SCHEMA, 0.2);
      const statusOk = c.expectStatus.includes(d.overallStatus);
      const haystack = (d.issues || []).map((i) => `${i.field} ${i.problem} ${i.suggestion}`).join(' ').toLowerCase();
      const kwOk = c.expectKeywords.length === 0 ? true : c.expectKeywords.some((k) => haystack.includes(k.toLowerCase()));
      const ok = statusOk && kwOk;
      if (ok) pass++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} -> ${d.overallStatus}  status:${statusOk ? 'ok' : 'X'} kw:${kwOk ? 'ok' : 'X'}`);
    } catch (e) {
      console.log(`  ERR   ${c.id.padEnd(22)} -> ${e.message}`);
    }
  }
  return { pass, total: cases.review.length };
}

const p = await runPathway();
const r = await runReview();
const pAcc = p.pass / p.total, rAcc = r.pass / r.total;
console.log('\n== Summary ==');
console.log(`  pathway: ${p.pass}/${p.total} = ${(pAcc * 100).toFixed(0)}%`);
console.log(`  review:  ${r.pass}/${r.total} = ${(rAcc * 100).toFixed(0)}%`);
console.log(`  threshold --min ${MIN}`);
const okAll = pAcc >= MIN && rAcc >= MIN;
console.log(okAll ? '  RESULT: PASS' : '  RESULT: FAIL (below threshold)');
process.exit(okAll ? 0 : 1);
