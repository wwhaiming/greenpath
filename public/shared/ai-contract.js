/* =====================================================================
   GreenPath — SINGLE SOURCE OF TRUTH for the AI contract.
   Loaded by the browser (public/index.html via <script src>) AND by the
   eval harness (evals/run.mjs via require) so the prompts, schemas, the
   grounding rule, and the deterministic safety screen CANNOT drift
   between what ships and what is tested.

   Browser:  window.GP_AI.*
   Node:     const GP = require('../public/shared/ai-contract.js')
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node / eval
  root.GP_AI = api;                                                          // browser
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Date the curated official-source list was last reviewed. Surfaced in the
  // UI as "sources last checked" so the trust signal is honest and dated.
  const SOURCES_CHECKED = '2026-06-26';

  // ---- Grounding rule (prepended to every grounded system prompt) ----
  const GROUNDING_RULE =
    'Ground every factual claim in the OFFICIAL SOURCES provided below (each includes a short excerpt). ' +
    'Never invent fees, dollar amounts, dates, processing times, or visa-bulletin cutoffs — if asked for a specific number, ' +
    'say it changes over time and tell the user to verify it on the cited official page. Keep it plain-language for a ' +
    'non-expert, often ESL audience. This is general information, NOT legal advice; for anything complex, point the user to ' +
    'authorized legal help. Do not print a sources list or [id] tags in your answer — those are shown separately.';

  // ---- Curated OFFICIAL sources with non-volatile excerpts (real grounding,
  //      cached rather than live-fetched so it is reliable and offline-safe). ----
  const USCIS_SOURCES = [
    { id:'forms', title:'USCIS Forms', url:'https://www.uscis.gov/forms',
      topics:['form','filing','i-130','i-485','i-765','i-131','n-400','i-693'],
      excerpt:'Official index of USCIS forms and their instructions. Always file the current edition; editions and filing addresses change.' },
    { id:'i-485', title:'I-485 Adjustment of Status', url:'https://www.uscis.gov/i-485',
      topics:['adjustment','inside the united states','i-485','green card application','aos'],
      excerpt:'Form I-485 is used to apply for a green card from inside the U.S. Eligibility generally requires an underlying basis (e.g. an approved petition) and, for most categories, an inspected and admitted or paroled entry.' },
    { id:'i-130', title:'I-130 Petition for Relative', url:'https://www.uscis.gov/i-130',
      topics:['family','sponsor','spouse','parent','child','sibling','i-130','relative','fiance'],
      excerpt:'Form I-130 establishes a qualifying family relationship between a U.S. citizen or permanent resident petitioner and a relative. It does not by itself grant any status.' },
    { id:'employment', title:'Green Card through Employment', url:'https://www.uscis.gov/green-card/green-card-eligibility/green-card-for-employment-based-immigrants',
      topics:['employment','job','employer','perm','labor','eb-1','eb-2','eb-3','niw','extraordinary'],
      excerpt:'Employment-based green cards fall into preference categories (EB-1, EB-2 including the National Interest Waiver, EB-3, etc.). Most require an employer and labor certification; some (EB-1A, EB-2 NIW) allow self-petition.' },
    { id:'bulletin', title:'Visa Bulletin (priority dates)', url:'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html',
      topics:['priority date','visa bulletin','wait','backlog','category','country cap','chargeability'],
      excerpt:'The monthly Visa Bulletin lists cutoff dates by category and country of chargeability across Chart A (Final Action Dates) and Chart B (Dates for Filing). Cutoffs move every month and can retrogress.' },
    { id:'times', title:'USCIS Processing Times', url:'https://egov.uscis.gov/processing-times/',
      topics:['processing time','how long','timeline','wait time'],
      excerpt:'USCIS publishes current median processing times by form and field office. Times vary widely and change frequently.' },
    { id:'fees', title:'USCIS Fee Schedule (G-1055)', url:'https://www.uscis.gov/g-1055',
      topics:['fee','cost','price','payment','how much'],
      excerpt:'The G-1055 fee schedule lists current filing fees. Fees change; some applicants qualify for a fee waiver (Form I-912).' },
    { id:'rfe', title:'Responding to an RFE', url:'https://www.uscis.gov/forms/filing-guidance/responding-to-an-rfe',
      topics:['rfe','request for evidence','evidence','missing'],
      excerpt:'A Request for Evidence (RFE) asks for additional documentation by a stated deadline. Missing the deadline can lead to denial.' },
    { id:'status', title:'Check Case Status', url:'https://egov.uscis.gov/casestatus/',
      topics:['case status','receipt number','i-797','tracking'],
      excerpt:'Case status can be tracked online with the receipt number from the I-797 Notice of Action.' },
    { id:'legal-help', title:'Find Authorized Legal Services', url:'https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/find-legal-services',
      topics:['attorney','lawyer','legal help','accredited','representation','complex'],
      excerpt:'USCIS directory for finding a licensed immigration attorney or a DOJ-accredited representative, and for avoiding immigration scams ("notario" fraud).' },
    { id:'8cfr', title:'8 CFR — Immigration Regulations', url:'https://www.ecfr.gov/current/title-8',
      topics:['regulation','8 cfr','rule','eligibility','requirement','statute','code','law','inadmissible','bar'],
      excerpt:'Title 8 of the Code of Federal Regulations contains the binding immigration regulations, including grounds of inadmissibility and adjustment eligibility.' },
    { id:'policy', title:'USCIS Policy Manual', url:'https://www.uscis.gov/policy-manual',
      topics:['policy','discretion','adjudicate','adjudication','guidance','manual','standard'],
      excerpt:'The USCIS Policy Manual is the agency’s centralized guidance on how it adjudicates applications.' },
    { id:'perm', title:'PERM Labor Certification (DOL)', url:'https://www.dol.gov/agencies/eta/foreign-labor/programs/permanent',
      topics:['perm','labor certification','prevailing wage','recruitment','sponsor employer'],
      excerpt:'PERM is the Department of Labor process most EB-2/EB-3 employer-sponsored cases must complete before the I-140, including recruitment and a prevailing-wage determination.' },
    { id:'feecalc', title:'USCIS Fee Calculator', url:'https://www.uscis.gov/feecalculator',
      topics:['fee calculator','total cost','combined fee','filing fees'],
      excerpt:'Interactive tool that returns the current total filing fee for a given form and applicant; the authoritative way to confirm an exact fee.' },
  ];

  function pickSources(query, max) {
    max = max || 5;
    const q = (query || '').toLowerCase();
    const hit = USCIS_SOURCES.filter(s => s.topics.some(t => q.includes(t)));
    return (hit.length ? hit : USCIS_SOURCES).slice(0, max);
  }

  // Injects real source EXCERPTS (not just URLs) so the model has grounded text.
  function sourcesPrompt(query) {
    return pickSources(query).map(s => `[${s.id}] ${s.title} — ${s.url}\n    ${s.excerpt}`).join('\n');
  }

  // ---- Structured-output JSON schemas (strict) ----
  const SCHEMAS = {
    pathway: { name:'pathway', schema:{ type:'object', additionalProperties:false,
      properties:{ primaryPathway:{type:'string'}, subcategory:{type:'string'},
        confidence:{type:'string', enum:['high','medium','low']}, reasoning:{type:'string'},
        nextSteps:{type:'array', items:{type:'string'}},
        alternativePathways:{type:'array', items:{type:'string'}} },
      required:['primaryPathway','subcategory','confidence','reasoning','nextSteps','alternativePathways'] } },
    review: { name:'document_review', schema:{ type:'object', additionalProperties:false,
      properties:{ overallStatus:{type:'string', enum:['looks-good','needs-attention','major-issues']},
        issues:{type:'array', items:{type:'object', additionalProperties:false,
          properties:{ severity:{type:'string', enum:['high','medium','low']}, field:{type:'string'},
            problem:{type:'string'}, suggestion:{type:'string'} },
          required:['severity','field','problem','suggestion'] }},
        reminders:{type:'array', items:{type:'string'}} },
      required:['overallStatus','issues','reminders'] } },
    interview: { name:'interview_turn', schema:{ type:'object', additionalProperties:false,
      properties:{ coaching:{type:['object','null'], additionalProperties:false,
          properties:{ level:{type:'string', enum:['clear','clarify','help']}, note:{type:['string','null']} },
          required:['level','note'] },
        nextQuestion:{type:'string'}, done:{type:'boolean'}, summary:{type:['string','null']} },
      required:['coaching','nextQuestion','done','summary'] } },
    notice: { name:'notice_extract', schema:{ type:'object', additionalProperties:false,
      properties:{ documentType:{type:'string'}, caseType:{type:'string'}, receiptNumber:{type:'string'},
        dates:{type:'array', items:{type:'object', additionalProperties:false,
          properties:{ label:{type:'string'}, date:{type:'string'} }, required:['label','date'] }},
        nextStep:{type:'string'} },
      required:['documentType','caseType','receiptNumber','dates','nextStep'] } },
  };

  // ---- System-prompt builders (the EXACT prompts the app ships, so the eval
  //      tests the real thing). ----
  const buildSystem = {
    pathway(text) {
      return `You are a U.S. immigration intake assistant that suggests the most likely green card pathway from a free-text description. You are not a lawyer; flag when a case is complex enough to need an accredited attorney. Return ONLY JSON.\n\n${GROUNDING_RULE}\nOFFICIAL SOURCES:\n${sourcesPrompt(text)}`;
    },
    review(form) {
      return `You are a meticulous U.S. immigration paralegal reviewing a draft form for errors before submission. You are not a lawyer and do not give legal advice. Flag inconsistencies, missing required information, and common rejection triggers. Return ONLY JSON.\n\n${GROUNDING_RULE}\nOFFICIAL SOURCES:\n${sourcesPrompt('rfe request for evidence form ' + form)}`;
    },
    qa(q, stage, pathway) {
      return `You answer questions about a specific stage of the U.S. green card process in clear, plain language. You are not a lawyer and do not give legal advice; recommend an accredited attorney for complex situations. Be accurate, warm, and concise.\n\n${GROUNDING_RULE}\nOFFICIAL SOURCES:\n${sourcesPrompt((q || '') + ' ' + (stage || '') + ' ' + (pathway || ''))}`;
    },
    bulletin(q) {
      return `You explain the U.S. State Department Visa Bulletin in clear, plain language for one person's case. You are not a lawyer and give general information only.\n\n${GROUNDING_RULE}\nCRITICAL: cutoff dates change every month and you do NOT have access to the current month's bulletin. NEVER state, estimate, or guess a specific current cutoff date or a number of months/years of wait. Instead explain how to read the bulletin for their category and country and tell them to check the official bulletin (linked separately) for the exact current cutoff.\nOFFICIAL SOURCES:\n${sourcesPrompt(q)}`;
    },
    notice() {
      return 'You read a U.S. immigration notice (USCIS Form I-797 Notice of Action, RFE, biometrics/ASC appointment, interview notice, or visa bulletin) and extract the key facts. Return ONLY JSON with ISO dates (YYYY-MM-DD). Never invent dates or numbers — omit anything not clearly present in the text.';
    },
    interview() {
      return `You simulate a USCIS officer conducting a green card interview for practice. Speak the way real officers do: terse, concrete, one question at a time. No flowery or "AI-sounding" phrasing.\nSAFETY GUARDRAIL (VAWA): If the scenario is a VAWA self-petition or the applicant references abuse, domestic violence, or fear of an abuser, never ask the applicant to involve, contact, confront, or seek information from the abuser, and never suggest they need the abuser's cooperation. Keep questions trauma-informed and confidential.\nAfter each applicant answer, give brief coaching. Return ONLY JSON.`;
    },
  };

  // ---- Deterministic high-risk SAFETY SCREEN ----
  // Runs in CODE (not model discretion) before any procedural guidance is shown.
  // 'stop'  = dangerous to self-file; suppress steps, force attorney handoff.
  // 'caution' = an admissibility trap (overstay/EWI/prior denial); show a
  //             prominent warning and recommend an attorney before filing.
  const RISK_RULES = [
    { cat:'prior removal or deportation', tier:'stop',
      re:/\b(deport(ed|ation)?|removal proceedings?|order of removal|removed from the (us|u\.s\.|country)|reinstat\w*|in (ice|immigration) (custody|detention)|detained by ice|expedited removal)\b/i },
    { cat:'criminal history', tier:'stop',
      re:/\b(arrest(ed)?|convict(ed|ion)?|criminal (record|charge|history)|charged with|felony|misdemeanor|(in )?jail|prison|dui|dwi|drug (offense|charge)|domestic battery)\b/i },
    { cat:'fraud or misrepresentation', tier:'stop',
      re:/\b(immigration fraud|marriage fraud|misrepresent\w*|lied (to|on)|false (document|statement|claim)|fake (document|marriage|passport)|claimed to be a (us|u\.s\.) citizen|document fraud)\b/i },
    { cat:'asylum / fear of return', tier:'stop',
      re:/\b(asylum|persecut\w*|credible fear|refugee|afraid to (go|return) (back|home)|fear (of )?(returning|persecution))\b/i },
    { cat:'abuse / VAWA', tier:'stop',
      re:/\b(vawa|domestic violence|abus(e|ed|er|ive)|battered|my (husband|wife|spouse) (hits|hurts|threatens)|trafficking|t visa|u visa)\b/i },
    { cat:'entry without inspection / unlawful presence', tier:'caution',
      re:/\b(without inspection|entered illegally|crossed the border|snuck (in|across)|ewi\b|no inspection|never inspected|unlawful presence|3.?year bar|10.?year bar|overstay\w*|out of status|expired (visa|status))\b/i },
    { cat:'prior denial or NTA', tier:'caution',
      re:/\b(denied|denial|notice to appear|\bnta\b|in (removal|deportation) court|immigration judge|appeal\w*)\b/i },
    { cat:'possible inadmissibility / waiver needed', tier:'caution',
      re:/\b(inadmissib\w*|public charge|i-?601|i-?212|grounds of inadmissibility|unlawful presence waiver|waiver of inadmissibility|communicable disease|health-related ground)\b/i },
    { cat:'child aging out (CSPA)', tier:'caution',
      re:/\b(aging out|age(d|s)? out|\bcspa\b|turning 21|turned 21|about to turn 21)\b/i },
    { cat:'derivative beneficiary timing', tier:'caution',
      re:/\b(derivative beneficiar\w*|following to join|follow to join)\b/i },
    { cat:'deadline-critical filing', tier:'caution',
      re:/\b(one.?year (filing )?deadline|asylum (one|1).?year|missed (the )?deadline|appeal deadline|motion to reopen|motion to reconsider|i-?290b)\b/i },
    { cat:'serious inadmissibility (fraud / false citizenship claim)', tier:'stop',
      re:/\b(212\(a\)\(6\)\(c\)|false claim to (u\.?s\.? )?citizenship|claimed (to be )?(a )?(u\.?s\.? )?citizen|unlawful(ly)? vot\w*)\b/i },
    { cat:'complex procedural posture', tier:'caution',
      re:/\b(noid|notice of intent to deny|\bbia\b|board of immigration appeals|j-?1 (two|2).?year|212\(e\)|home.?residency requirement|\btps\b|advance parole|consular processing problem)\b/i },
  ];
  function screen(text) {
    const t = String(text || '');
    const categories = [];
    let tier = null;
    for (const r of RISK_RULES) {
      if (r.re.test(t)) {
        categories.push(r.cat);
        if (r.tier === 'stop') tier = 'stop';
        else if (tier !== 'stop') tier = 'caution';
      }
    }
    return { hit: categories.length > 0, tier: tier, categories };
  }
  const RISK = { screen, rules: RISK_RULES };

  // ---- Output guard: strip invented fees / specific bulletin cutoffs from
  //      fee/bulletin answers (defense-in-depth for the no-numbers rule). ----
  function scrubVolatileNumbers(text) {
    let s = String(text || '');
    // bare dollar amounts like $1,440 or $ 1440
    s = s.replace(/\$\s?\d[\d,]*(?:\.\d{2})?/g, 'the current fee (verify on the official page)');
    // "a cutoff of January 2023" / "cutoff date is 01/2023" style specifics
    s = s.replace(/\bcut[\s-]?off (date )?(of|is|:)?\s*[A-Z][a-z]+ \d{4}/g, 'the current cutoff (check the official Visa Bulletin)');
    s = s.replace(/\bcut[\s-]?off (date )?(of|is|:)?\s*\d{1,2}[\/-]\d{4}/g, 'the current cutoff (check the official Visa Bulletin)');
    return s;
  }

  const CITE_LABEL = 'Official sources to verify';

  return {
    SOURCES_CHECKED, GROUNDING_RULE, USCIS_SOURCES,
    pickSources, sourcesPrompt, SCHEMAS, buildSystem,
    RISK, screen, scrubVolatileNumbers, CITE_LABEL,
  };
});
