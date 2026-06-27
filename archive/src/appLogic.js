// ===================================================================
// GreenPath feature logic — ported verbatim from the original
// public/index.html <script> block. Runs once after React mounts the
// identical DOM (same ids/classes/structure), so behavior is unchanged.
//
// Edits vs. the original inline script:
//   • AI helpers, citation helpers, and OCR/PDF globals now come from
//     ./utils/* modules instead of being defined inline.
//   • pdf.js workerSrc is set by installGlobals() to the bundled npm
//     worker; the original CDN workerSrc assignments are dropped.
//   • navigation show() notifies React via an injected onShow callback.
// ===================================================================
import { installGlobals, pdfjsLib, Tesseract } from './utils/fileReader.js'
import {
  AI_ENDPOINT, AI_MODEL, AI_SMART,
  aiChatMessages, aiChat, parseLooseJSON, aiJSON, SCHEMAS,
  aiJSONSchema, aiStream, claudeChat, claudeJSON, aiErrorHTML,
} from './utils/ai.js'
import {
  USCIS_SOURCES, pickSources, sourcesPrompt, GROUNDING_RULE,
  SOURCE_BY_ID, CITE_RE, citedIds, linkifyCitations,
  citationsForIds, citationsFromText, citationsHTML,
} from './utils/citations.js'

let started = false

export function initApp(onShow) {
  if (started) return
  started = true
  installGlobals()
  const links = document.querySelectorAll('[data-go]');
  const sections = document.querySelectorAll('section');
  const navMap = {home:'home',hero2:null,guided:'guided',progress:'progress',alerts:'alerts',language:'language',pathway:'pathway',qa:'qa',review:'review',interview:'interview',bulletin:'bulletin',legal:'legal'};
  const menuBtn = document.getElementById('menuBtn');
  const mainnav = document.getElementById('mainnav');

  const a11yAnnounce = document.getElementById('a11yAnnounce');
  function announce(msg){ if(a11yAnnounce){ a11yAnnounce.textContent=''; a11yAnnounce.textContent=msg; } }
  // Readable label for a section id, derived from the matching nav link text.
  function labelFor(id){
    const target = (id==='hero2') ? 'home' : id;
    const link = document.querySelector('nav.main a[data-go="'+target+'"]');
    return (link && link.textContent.trim()) || target;
  }
  function show(id){
    sections.forEach(s=>s.classList.toggle('show', s.id===id));
    document.querySelectorAll('nav.main a').forEach(a=>{
      const active = a.dataset.go===id || (id==='hero2' && a.dataset.go==='home');
      a.classList.toggle('active', active);
      if(active) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    });
    mainnav.classList.remove('open');
    menuBtn?.setAttribute('aria-expanded','false');
    window.scrollTo({top:0,behavior:'smooth'});
    // Announce the new view and move focus to its main heading for screen-reader / keyboard users.
    announce('Showing ' + labelFor(id));
    const sec = document.getElementById(id) || document.getElementById(id==='hero2'?'home':id);
    const heading = sec && sec.querySelector('h1,h2');
    if(heading){ heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
    if(typeof onShow==='function') onShow(id);
  }
  menuBtn?.addEventListener('click',()=>{
    const open = mainnav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  // Bind every static [data-go] element (nav links + hero buttons) to navigate.
  // (Dynamically-created result buttons bind themselves elsewhere.)
  document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();show(el.dataset.go)}));
  // role=button divs (home step-rail nodes) — activate with Enter/Space too
  document.querySelectorAll('.node[data-go]').forEach(el=>el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); show(el.dataset.go); } }));

  /* ================= EASY-READING MODE (dyslexia / low-literacy friendly) ================= */
  (function(){
    const btn=document.getElementById('readingBtn');
    if(!btn) return;
    function apply(on){
      document.body.classList.toggle('reading', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    // Restore saved preference on load.
    let saved=false;
    try{ saved = localStorage.getItem('gp-reading')==='1'; }catch(_){}
    apply(saved);
    btn.addEventListener('click',()=>{
      const on=!document.body.classList.contains('reading');
      apply(on);
      try{ localStorage.setItem('gp-reading', on?'1':'0'); }catch(_){}
      announce(on ? 'Easy-reading mode on' : 'Easy-reading mode off');
    });
  })();

  /* ================= LOCAL HELP FINDER + SCAM AVOIDANCE ================= */
  (function(){
    const sel=document.getElementById('helpState'),
          findBtn=document.getElementById('helpFind'),
          out=document.getElementById('helpResult');
    if(!sel || !findBtn || !out) return;
    // 2-letter code -> name, all states + DC + Puerto Rico.
    const STATES=[
      ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
      ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
      ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
      ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
      ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
      ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
      ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
      ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
      ['PA','Pennsylvania'],['PR','Puerto Rico'],['RI','Rhode Island'],['SC','South Carolina'],
      ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
      ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
    ];
    // Build the state dropdown safely with DOM nodes (no HTML injection).
    const ph=document.createElement('option'); ph.value=''; ph.textContent='Choose a state…'; sel.appendChild(ph);
    STATES.forEach(s=>{ const o=document.createElement('option'); o.value=s[0]; o.textContent=s[1]; sel.appendChild(o); });
    function linkChip(label, url){
      const a=document.createElement('a');
      a.className='cite'; a.href=url; a.target='_blank'; a.rel='noopener'; a.textContent=label;
      return a;
    }
    findBtn.addEventListener('click',async()=>{
      const code=sel.value;
      const name=(STATES.find(s=>s[0]===code)||[])[1];
      out.textContent='';
      if(!code || !name){
        const p=document.createElement('p'); p.className='dr-placeholder';
        p.textContent='Please choose your state first.'; out.appendChild(p);
        return;
      }
      // Always show the official links first — they never depend on AI.
      const intro=document.createElement('p'); intro.className='help-intro';
      const b=document.createElement('b'); b.textContent='Official help directories for '+name+'.';
      intro.appendChild(b);
      intro.appendChild(document.createTextNode(' These directories let you search for free or low-cost, '
        +'authorized legal help. Use them to confirm anyone you work with is a licensed attorney or a DOJ-accredited representative.'));
      out.appendChild(intro);
      const list=document.createElement('div'); list.className='cite-list';
      list.appendChild(linkChip('Immigration Law Help (nonprofit legal-aid directory)', 'https://www.immigrationlawhelp.org/search?state='+code));
      list.appendChild(linkChip('USCIS: Find Legal Services', 'https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/find-legal-services'));
      list.appendChild(linkChip('DOJ Recognized Organizations & Accredited Representatives roster', 'https://www.justice.gov/eoir/recognition-and-accreditation-roster-reports'));
      list.appendChild(linkChip('DOJ List of Pro Bono Legal Service Providers', 'https://www.justice.gov/eoir/list-pro-bono-legal-service-providers'));
      out.appendChild(list);
      announce('Showing official immigration help directories for '+name);
      findBtn.disabled=true;
      // Optionally add a short plain-language explanation. Non-blocking: links stay if AI fails.
      const note=document.createElement('p');
      note.className='help-intro'; note.style.marginTop='14px';
      const load=document.createElement('span'); load.className='dr-loading';
      const spin=document.createElement('span'); spin.className='dr-spin';
      load.appendChild(spin); load.appendChild(document.createTextNode('Adding a plain-language note…'));
      note.appendChild(load);
      out.appendChild(note);
      try{
        const sys='You explain U.S. immigration legal help options in clear, plain, supportive language for immigrants. You are not a lawyer and do not give legal advice. Mention that nonprofit legal aid and DOJ-accredited representatives can be free or low cost, and that only licensed attorneys or DOJ-accredited representatives may give legal advice. Keep it to 2-3 short sentences. No markdown.';
        const txt=await aiChat('Briefly explain free vs low-cost immigration legal help options for someone living in '+name+'.', sys, {temperature:0.3,max_tokens:220});
        note.textContent=String(txt||'').trim();
        if(!note.textContent) note.remove();
      }catch(e){
        // AI optional — drop the note, keep the official links visible.
        note.remove();
      }finally{ findBtn.disabled=false; }
    });
  })();

  /* ================= INTERACTIVE GUIDED WALKTHROUGH ================= */
  const ALL_COUNTRIES = ["India","China","Philippines","Mexico","Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","Colombia","Comoros","Congo (Brazzaville)","Congo (Kinshasa)","Costa Rica","Côte d'Ivoire","Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe","Other / not listed"];

  const STEPS = [
    {label:'Current location', q:'Where do you currently live?',
      hint:'This helps determine whether you would adjust status or use consular processing.',
      tip:'"Adjustment of status" means applying while inside the U.S.',
      options:['Inside the United States','Outside the United States']},
    {label:'Country of birth', q:'What is your country of birth?',
      hint:'Some countries have longer waits due to per-country caps.',
      tip:'Birth country : not citizenship : usually sets your visa category.',
      options:ALL_COUNTRIES},
    {label:'Immigration status', q:'What best describes your current immigration status?',
      hint:'You can ask questions in your own words.',
      tip:'Explains unfamiliar terms simply.',
      options:['U.S. visa holder (work or student)','Temporary protected / humanitarian status','No current status','Not sure']},
    {label:'Family relationships', q:'Do you have a close family member who can sponsor you?',
      hint:'A spouse, parent, or child who is a citizen or green-card holder may open a pathway.',
      tip:'"LPR" means Lawful Permanent Resident : a green-card holder.',
      options:['Spouse is a U.S. citizen','Parent or child is a citizen / LPR','Sibling is a U.S. citizen','No qualifying family member']},
    {label:'Employment situation', q:'What is your employment situation?',
      hint:'A job offer or employer sponsorship can support an employment-based pathway.',
      tip:'Employer sponsorship often involves a labor certification step.',
      options:['I have an employer willing to sponsor me','I have specialized skills or an advanced degree','Self-employed / investor','No U.S. job offer']},
    {label:'Special circumstances', q:'Do any special circumstances apply to you?',
      hint:'These can change which pathway and protections are available.',
      tip:'Several of these route you to specialized, authorized help.',
      options:['Asylum or refugee situation','Survivor of abuse or a serious crime','Selected in the Diversity Visa lottery','None of these apply']}
  ];

  function pathwayResult(a){
    if(a[0]==='Asylum or refugee situation'||a[5]==='Asylum or refugee situation')
      return ['Humanitarian pathway','Your answers point toward a humanitarian (asylum or refugee) pathway. These cases are highly individual : GreenPath would connect you with an authorized support organization.'];
    if(a[5]==='Survivor of abuse or a serious crime')
      return ['Protective pathway','Your situation may qualify for special protections. This is a sensitive area best handled directly with an authorized advocate, which GreenPath would help you find.'];
    if(a[5]==='Selected in the Diversity Visa lottery')
      return ['Diversity Visa pathway','Being selected in the Diversity Visa lottery opens a specific, time-sensitive process. GreenPath would help you track its strict deadlines.'];
    if(a[3]&&a[3]!=='No qualifying family member')
      return ['Family-based pathway','Based on your family relationship, a family-based pathway looks possible. GreenPath would break it into stages: petition, processing, biometrics, interview, and decision.'];
    if(a[4]&&a[4]!=='No U.S. job offer')
      return ['Employment-based pathway','Your employment situation suggests an employment-based pathway may apply. GreenPath would map the petition, priority-date, and filing steps for you.'];
    return ['Let’s explore options together','Your answers don’t point to one clear pathway yet. GreenPath would ask a few more questions and, where helpful, suggest authorized organizations that can review your case.'];
  }

  const gw = {i:0, answers:Array(6).fill('')};
  const qLabel=document.getElementById('qLabel'), qFill=document.getElementById('qFill'),
        qTitle=document.getElementById('qTitle'), qSelect=document.getElementById('qSelect'),
        qHint=document.getElementById('qHint'), aiTip=document.getElementById('aiTip'),
        qBack=document.getElementById('qBack'), qNext=document.getElementById('qNext'),
        intakeList=document.getElementById('intakeList'),
        qCard=document.getElementById('qCard'), resultCard=document.getElementById('resultCard');

  function renderIntake(){
    intakeList.innerHTML = STEPS.map((s,idx)=>{
      let cls,ic;
      if(idx<gw.i){cls='';ic='<div class="ic done">✓</div>';}
      else if(idx===gw.i){cls=' active';ic='<div class="ic cur">'+(idx+1)+'</div>';}
      else {cls='';ic='<div class="ic todo">'+(idx+1)+'</div>';}
      return '<div class="istep'+cls+'">'+ic+'<span>'+esc(s.label)+'</span></div>';
    }).join('');
  }
  function renderQuestion(){
    const s = STEPS[gw.i];
    qLabel.textContent = 'QUESTION '+(gw.i+1)+' OF 6';
    qFill.style.width = ((gw.i+1)/6*100)+'%';
    qTitle.textContent = s.q;
    qHint.textContent = s.hint;
    aiTip.textContent = s.tip;
    qSelect.innerHTML = '<option value="">Select an answer</option>' +
      s.options.map(o=>'<option value="'+esc(o)+'"'+(gw.answers[gw.i]===o?' selected':'')+'>'+esc(o)+'</option>').join('');
    qBack.disabled = gw.i===0;
    qNext.textContent = gw.i===5 ? 'See Pathway' : 'Continue';
    qNext.disabled = !gw.answers[gw.i];
    renderIntake();
  }
  qSelect.addEventListener('change',()=>{ gw.answers[gw.i]=qSelect.value; qNext.disabled=!qSelect.value; });
  qBack.addEventListener('click',()=>{ if(gw.i>0){gw.i--; renderQuestion();} });
  qNext.addEventListener('click',()=>{
    if(!gw.answers[gw.i]) return;
    if(gw.i<5){ gw.i++; renderQuestion(); }
    else {
      const [t,b]=pathwayResult(gw.answers);
      document.getElementById('resultTitle').textContent=t;
      document.getElementById('resultBody').textContent=b;
      gw.i=6; renderIntake();
      qCard.style.display='none'; resultCard.style.display='block';
    }
  });
  document.getElementById('qRestart').addEventListener('click',()=>{
    gw.i=0; gw.answers=Array(6).fill('');
    resultCard.style.display='none'; qCard.style.display='block'; renderQuestion();
  });
  renderQuestion();

  /* ================= DEADLINE ALERTS ================= */
  const PALETTE=['c-terra','c-amber','c-slate','c-green'];
  const DATEPILL={'c-terra':'d-terra','c-amber':'d-amber','c-slate':'d-slate','c-green':'d-green'};
  // timeline starts empty : it is populated by the AI extractor or manual add
  let reminders=[];
  let nextId=1;
  const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const today=new Date();
  const tlEl=document.getElementById('timeline'),
        setTiming=document.getElementById('setTiming'),
        setFilter=document.getElementById('setFilter'),
        setChannel=document.getElementById('setChannel'),
        setSummary=document.getElementById('setSummary');

  function daysAway(d){
    const ms=new Date(d+'T00:00:00')-new Date(today.toDateString());
    return Math.round(ms/86400000);
  }
  // True only for a real calendar date in YYYY-MM-DD form. The regex alone passes
  // impossible dates like 2024-13-45, which yield an Invalid Date and render as
  // 'undefined'/NaN downstream; round-tripping through the Date constructor rejects them.
  function isValidISODate(s){
    if(typeof s!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y,m,d]=s.split('-').map(Number);
    const dt=new Date(y,m-1,d);
    return !isNaN(dt) && dt.getFullYear()===y && dt.getMonth()===m-1 && dt.getDate()===d;
  }
  function awayText(n){
    if(n<0) return Math.abs(n)+' days ago';
    if(n===0) return 'Today';
    if(n===1) return 'Tomorrow';
    return n+' days away';
  }
  function renderTimeline(){
    const filter=setFilter.value;
    let list=[...reminders].sort((a,b)=>a.date.localeCompare(b.date));
    if(filter!=='all') list=list.filter(r=>{const n=daysAway(r.date);return n>=0&&n<=+filter;});
    if(!list.length){ tlEl.innerHTML='<div class="tl-empty">Your timeline is empty. Describe your situation above and let AI pull out the important dates : or add one manually below.</div>'; updateSummary(); return; }
    tlEl.innerHTML=list.map((r,i)=>{
      const c=PALETTE[i%PALETTE.length];
      const dt=new Date(r.date+'T00:00:00');
      const pill=MON[dt.getMonth()]+' '+String(dt.getDate()).padStart(2,'0');
      return `<div class="tl-item">
        <div class="tl-dot ${c}"></div>
        <div class="tl-date ${DATEPILL[c]}">${pill}</div>
        <div class="tt"><b>${esc(r.label)}</b><p>${esc(r.note||awayText(daysAway(r.date)))}</p></div>
        <button class="tl-x" data-rid="${r.id}" title="Remove">×</button>
      </div>`;
    }).join('');
    tlEl.querySelectorAll('.tl-x').forEach(b=>b.addEventListener('click',()=>{
      reminders=reminders.filter(r=>r.id!=b.dataset.rid); renderTimeline();
    }));
    updateSummary();
  }
  function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

  function updateSummary(){
    const filter=setFilter.value;
    const shown = filter==='all'?reminders.length:reminders.filter(r=>{const n=daysAway(r.date);return n>=0&&n<=+filter;}).length;
    const next = [...reminders].filter(r=>daysAway(r.date)>=0).sort((a,b)=>a.date.localeCompare(b.date))[0];
    let txt = `Tracking ${reminders.length} date${reminders.length!==1?'s':''} · showing ${shown}. `;
    if(next){ txt += `${setChannel.value} will alert you ${setTiming.options[setTiming.selectedIndex].text.toLowerCase()} each date. Next: ${esc(next.label)} (${awayText(daysAway(next.date))}).`; }
    else { txt += 'No upcoming dates.'; }
    setSummary.textContent=txt;
  }

  function addReminder(date,label,note){
    if(!date||!label||!isValidISODate(date)) return false; // reject invalid calendar dates (e.g. 2024-13-45)
    reminders.push({id:nextId++,date,label,note:note||''});
    return true;
  }
  document.getElementById('addBtn').addEventListener('click',()=>{
    const d=document.getElementById('newDate').value, l=document.getElementById('newLabel').value.trim();
    if(!d||!l){ alert('Pick a date and type a reminder.'); return; }
    addReminder(d,l,'User-entered reminder');
    document.getElementById('newDate').value=''; document.getElementById('newLabel').value='';
    renderTimeline();
  });
  [setTiming,setFilter,setChannel].forEach(s=>s.addEventListener('change',renderTimeline));

  const srcToggle=document.getElementById('srcToggle'), srcPanel=document.getElementById('srcPanel');
  srcToggle.setAttribute('aria-expanded','false');
  srcToggle.setAttribute('aria-controls','srcPanel');
  srcToggle.addEventListener('click',()=>{
    const open=srcPanel.hidden;
    srcPanel.hidden=!open;
    srcToggle.setAttribute('aria-expanded', String(open));
    srcToggle.style.background = open ? '#dfeae0' : '';
  });

  /* ---- AI extraction ---- */
  const aiExtract=document.getElementById('aiExtract'),
        aiDesc=document.getElementById('aiDesc'),
        aiStatus=document.getElementById('aiStatus');

  aiExtract.addEventListener('click',async()=>{
    const text=aiDesc.value.trim();
    if(!text){ aiStatus.textContent='Type a few sentences first.'; return; }
    aiStatus.textContent='Reading your description…'; aiExtract.disabled=true;
    try{
      const items=await extractWithAI(text);
      if(!items.length){ aiStatus.textContent='No clear dates found : try including months and days.'; }
      else{
        items.forEach(it=>addReminder(it.date,it.label,it.note||'AI-extracted'));
        renderTimeline();
        aiStatus.textContent=`Added ${items.length} date${items.length!==1?'s':''} to your timeline.`;
        aiDesc.value='';
      }
    }catch(e){
      // fallback to local parser if the API isn't reachable (e.g. opened as a local file)
      const items=localParse(text);
      if(items.length){ items.forEach(it=>addReminder(it.date,it.label,'Extracted offline')); renderTimeline();
        aiStatus.textContent=`Added ${items.length} date${items.length!==1?'s':''} (offline parser).`; aiDesc.value=''; }
      else aiStatus.textContent='Could not reach the AI service. Add the date manually below.';
    }finally{ aiExtract.disabled=false; }
  });


  // ===== Notice -> Roadmap autopilot: upload a USCIS notice, auto-fill the timeline =====
  (function(){
    const scan=document.getElementById('noticeScan'),
          file=document.getElementById('noticeFile'),
          result=document.getElementById('noticeResult');
    if(!scan||!file) return;
    scan.addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{
      const f=file.files[0]; if(!f) return;
      scan.disabled=true; result.replaceChildren();
      aiStatus.textContent='Reading your notice…';
      try{
        const text=await readNotice(f);
        if(!text||text.trim().length<8){ aiStatus.textContent='Could not read text from that file : try a clearer photo.'; return; }
        aiStatus.textContent='Understanding the notice…';
        const sys='You read a U.S. immigration notice (USCIS Form I-797 Notice of Action, RFE, biometrics/ASC appointment, interview notice, or visa bulletin) and extract the key facts. Return ONLY JSON with ISO dates (YYYY-MM-DD). Never invent dates or numbers : omit anything not clearly present in the text.';
        const pr='NOTICE TEXT:\n"""'+text.slice(0,6000)+'"""\n\nReturn ONLY a JSON object shaped exactly:\n{"documentType":"e.g. Form I-797C, Notice of Action","caseType":"e.g. I-485 Adjustment of Status, or empty","receiptNumber":"e.g. MSC2190000000, or empty","dates":[{"label":"what this date is, e.g. Biometrics appointment","date":"YYYY-MM-DD"}],"nextStep":"one plain-language sentence on what to do next"}';
        const d=await aiJSONSchema(pr, sys, SCHEMAS.notice, {model:AI_SMART, max_tokens:700, temperature:0.1});
        const dates=Array.isArray(d.dates)?d.dates.filter(x=>x&&x.date):[];
        let added=0; dates.forEach(x=>{ if(addReminder(x.date, x.label||'Important date', 'From scanned notice')) added++; });
        if(added) renderTimeline();
        const head='<b>'+esc(d.documentType||'Notice detected')+(d.receiptNumber?' · '+esc(d.receiptNumber):'')+'</b>';
        const rows=[
          d.caseType?'<p style="margin:6px 0 0">Case type: '+esc(d.caseType)+'</p>':'',
          d.nextStep?'<p style="margin:6px 0 0">Next step: '+esc(d.nextStep)+'</p>':'',
          '<p style="margin:6px 0 0">Added '+added+' date'+(added!==1?'s':'')+' to your timeline below.</p>'
        ].join('');
        result.insertAdjacentHTML('beforeend','<div class="ai-assist ai-pop" style="margin-top:18px">'+head+rows+'</div>'+citationsHTML((d.caseType||'')+' '+(d.documentType||'')));
        aiStatus.textContent = added ? 'Done : '+added+' date'+(added!==1?'s':'')+' added to your timeline.' : 'Read the notice : no clear dates found.';
      }catch(e){
        result.insertAdjacentHTML('beforeend', aiErrorHTML(e));
        aiStatus.textContent='';
      }finally{ scan.disabled=false; file.value=''; }
    });
    async function readNotice(f){
      if(f.type==='text/plain'||/\.txt$/i.test(f.name)) return await f.text();
      if(window.pdfjsLib && (f.type==='application/pdf'||/\.pdf$/i.test(f.name))){
        const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
        let out='';
        for(let p=1;p<=pdf.numPages;p++){ const pg=await pdf.getPage(p); const tc=await pg.getTextContent(); out+=tc.items.map(i=>i.str).join(' ')+'\n'; }
        if(out.trim().length>15) return out;
        throw new Error('This looks like a scanned PDF : try uploading a photo or screenshot of the notice instead.');
      }
      if(window.Tesseract && (f.type.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(f.name))){
        const url=URL.createObjectURL(f);
        try{ const {data}=await Tesseract.recognize(url,'eng+spa',{logger:m=>{ if(m.status==='recognizing text') aiStatus.textContent='Scanning image… '+Math.round(m.progress*100)+'%'; }}); return data.text; }
        finally{ URL.revokeObjectURL(url); }
      }
      throw new Error('Unsupported file. Use an image, PDF, or .txt.');
    }
  })();

  async function extractWithAI(text){
    const todayStr=today.toISOString().slice(0,10);
    const prompt=`You extract immigration-related deadlines from a user's plain-language description and return them as JSON.
Today's date is ${todayStr}. The user wrote:
"""${text}"""
Return ONLY a JSON array (no prose, no markdown fences). Each element: {"date":"YYYY-MM-DD","label":"short title (max 6 words)","note":"short context (max 8 words)"}.
Rules: resolve relative dates against today. If a year is missing, choose the next upcoming occurrence. Do not invent a fixed I-693 expiration for exams signed on or after November 1, 2023; current USCIS policy ties validity to the pending application. For I-693 text without a clear deadline, add no date. Skip anything with no determinable date. If none, return [].`;
    const arr=await claudeJSON(prompt);
    return Array.isArray(arr)?arr.filter(x=>x&&isValidISODate(x.date)):[];
  }

  // crude offline fallback: finds "Month Day" patterns
  function localParse(text){
    const months={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
      jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
    const out=[]; const re=/([a-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/gi; let m;
    while((m=re.exec(text))){
      const mo=months[m[1].toLowerCase()]; if(mo===undefined) continue;
      let yr=m[3]?+m[3]:today.getFullYear();
      let d=new Date(yr,mo,+m[2]);
      if(!m[3]&&d<today) d=new Date(yr+1,mo,+m[2]);
      const iso=d.toISOString().slice(0,10);
      // grab a few words before the date as a label
      const before=text.slice(0,m.index).split(/[.;\n]/).pop().trim().split(/\s+/).slice(-4).join(' ');
      out.push({date:iso,label:(before||'Important date').replace(/^\w/,c=>c.toUpperCase()).slice(0,40)});
    }
    return out;
  }

  renderTimeline();

  /* ================= LANGUAGE TOOLS ================= */
  const ltFrom=document.getElementById('ltFrom'), ltTo=document.getElementById('ltTo'),
        ltSwap=document.getElementById('ltSwap'), ltSource=document.getElementById('ltSource'),
        ltOut=document.getElementById('ltOut'), ltTranslate=document.getElementById('ltTranslate'),
        ltRead=document.getElementById('ltRead'), ltDetect=document.getElementById('ltDetect'),
        ltStatus=document.getElementById('ltStatus'), ltSize=document.getElementById('ltSize'),
        ltSpeed=document.getElementById('ltSpeed'), ltVoice=document.getElementById('ltVoice'),
        ltScan=document.getElementById('ltScan'), ltFile=document.getElementById('ltFile');

  const ISO={'Afrikaans':'af','Albanian':'sq','Amharic':'am','Arabic':'ar','Armenian':'hy','Azerbaijani':'az',
    'Basque':'eu','Belarusian':'be','Bengali':'bn','Bosnian':'bs','Bulgarian':'bg','Catalan':'ca','Cebuano':'ceb',
    'Mandarin Chinese':'zh-CN','Chinese (Traditional)':'zh-TW','Corsican':'co','Croatian':'hr','Czech':'cs',
    'Danish':'da','Dutch':'nl','English':'en','Esperanto':'eo','Estonian':'et','Finnish':'fi','French':'fr',
    'Frisian':'fy','Galician':'gl','Georgian':'ka','German':'de','Greek':'el','Gujarati':'gu','Haitian Creole':'ht',
    'Hausa':'ha','Hawaiian':'haw','Hebrew':'iw','Hindi':'hi','Hmong':'hmn','Hungarian':'hu','Icelandic':'is',
    'Igbo':'ig','Indonesian':'id','Irish':'ga','Italian':'it','Japanese':'ja','Javanese':'jw','Kannada':'kn',
    'Kazakh':'kk','Khmer':'km','Kinyarwanda':'rw','Korean':'ko','Kurdish':'ku','Kyrgyz':'ky','Lao':'lo','Latin':'la',
    'Latvian':'lv','Lithuanian':'lt','Luxembourgish':'lb','Macedonian':'mk','Malagasy':'mg','Malay':'ms',
    'Malayalam':'ml','Maltese':'mt','Maori':'mi','Marathi':'mr','Mongolian':'mn','Myanmar (Burmese)':'my',
    'Nepali':'ne','Norwegian':'no','Nyanja (Chichewa)':'ny','Odia (Oriya)':'or','Pashto':'ps','Persian':'fa',
    'Polish':'pl','Portuguese':'pt','Punjabi':'pa','Romanian':'ro','Russian':'ru','Samoan':'sm','Scots Gaelic':'gd',
    'Serbian':'sr','Sesotho':'st','Shona':'sn','Sindhi':'sd','Sinhala':'si','Slovak':'sk','Slovenian':'sl',
    'Somali':'so','Spanish':'es','Sundanese':'su','Swahili':'sw','Swedish':'sv','Tagalog':'tl','Tajik':'tg',
    'Tamil':'ta','Tatar':'tt','Telugu':'te','Thai':'th','Turkish':'tr','Turkmen':'tk','Ukrainian':'uk','Urdu':'ur',
    'Uyghur':'ug','Uzbek':'uz','Vietnamese':'vi','Welsh':'cy','Xhosa':'xh','Yiddish':'yi','Yoruba':'yo','Zulu':'zu'};
  // shorter code for speech synthesis (drop region for zh)
  function speechCode(name){ const c=ISO[name]||'en'; return c.split('-')[0]; }

  // ---- Voice "mood": Natural / Clear / Warm change the actual spoken voice ----
  let voiceCache=[];
  function loadVoices(){ if('speechSynthesis' in window) voiceCache=window.speechSynthesis.getVoices()||[]; }
  loadVoices();
  if('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged',loadVoices);
  // each mood = a tone (pitch + rate multiplier) plus which voice to pick from the matching set
  // subtle tone only -- big pitch shifts sound robotic
  const VOICE_MOODS={
    'Voice: Natural':{pitch:1.0,  rateMul:1.0,  pick:0},
    'Voice: Clear':  {pitch:1.05, rateMul:0.97, pick:1},
    'Voice: Warm':   {pitch:0.95, rateMul:0.95, pick:2}
  };
  // network/neural voices are far more natural than old local ones; novelty voices are junk
  const VOICE_GOOD=/google|natural|neural|premium|enhanced|siri|online|wavenet/i;
  const VOICE_BAD=/bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|trinoids|whisper|wobble|zarvox|superstar|albert|fred|ralph|junior|kathy|grandma|grandpa|deranged|hysterical|pipe|robot|alien|novelty|sandy|rocko|reed|flo|eddy|shelley/i;
  function voiceScore(v){
    let s=0;
    if(!v.localService) s+=100;          // network voice = much more natural
    if(VOICE_GOOD.test(v.name)) s+=60;
    if(VOICE_BAD.test(v.name)) s-=300;   // drop novelty / robotic voices
    if(v.default) s+=5;
    return s;
  }
  function rankedPool(langCode){
    const lc=langCode.toLowerCase();
    let pool=voiceCache.filter(v=>v.lang && v.lang.toLowerCase().startsWith(lc));
    if(!pool.length) pool=voiceCache.slice();
    return pool.map(v=>({v,s:voiceScore(v)})).sort((a,b)=>b.s-a.s).map(x=>x.v);
  }
  function applyVoiceMood(u,langCode){
    const m=VOICE_MOODS[ltVoice.value]||VOICE_MOODS['Voice: Natural'];
    u.pitch=m.pitch;
    u.rate=parseFloat(ltSpeed.value)*m.rateMul;
    const pool=rankedPool(langCode);
    if(pool.length) u.voice=pool[Math.min(m.pick,pool.length-1)];
  }

  function applySize(){ const px=ltSize.value+'px'; ltSource.style.fontSize=px; ltOut.style.fontSize=px; }
  // build the language menus from the ISO map
  (function fillLangMenus(){
    const names=Object.keys(ISO).sort();
    names.forEach(n=>{
      const o1=document.createElement('option'); o1.value=n; o1.textContent=n; ltFrom.appendChild(o1);
      const o2=document.createElement('option'); o2.value=n; o2.textContent=n; ltTo.appendChild(o2);
    });
    ltFrom.value='Spanish'; ltTo.value='English';
  })();
  ltSize.addEventListener('change',applySize); applySize();

  ltSwap.addEventListener('click',()=>{
    const f=ltFrom.value==='auto'?'English':ltFrom.value, t=ltTo.value;
    ltFrom.value=t; ltTo.value=f;
    const src=ltSource.value; ltSource.value=ltOut.textContent.trim(); ltOut.textContent=src;
  });

  ltTranslate.addEventListener('click',async()=>{
    const text=ltSource.value.trim();
    if(!text){ ltStatus.textContent='Type something to translate.'; return; }
    if(ltFrom.value!=='auto' && ltFrom.value===ltTo.value){
      ltOut.textContent=text; ltStatus.textContent='Source and target are the same language.'; return;
    }
    ltStatus.textContent='Translating…'; ltTranslate.disabled=true;
    // 1) try the AI model (best quality)
    try{
      const out=await translateAI(text, ltFrom.value, ltTo.value);
      if(out){ ltOut.textContent=out; ltStatus.textContent='Translated to '+ltTo.value+'.'; ltTranslate.disabled=false; return; }
    }catch(e){ /* fall through to the keyless engine */ }
    // 2) real keyless translation that works even from a local file (any language)
    try{
      const out=await translateFree(text, ltFrom.value, ltTo.value);
      if(out){ ltOut.textContent=out; ltStatus.textContent='Translated to '+ltTo.value+'.'; return; }
      throw new Error('empty');
    }catch(e){
      ltOut.textContent=''; ltStatus.textContent='Translation service is unreachable right now : check your connection and try again.';
    }finally{ ltTranslate.disabled=false; }
  });

  async function translateAI(text, from, to){
    const fromTxt = from==='auto' ? 'the detected source language' : from;
    const prompt=`Translate the text below from ${fromTxt} into ${to}. Return ONLY the translation : no notes, no quotes, no language labels.\n\nText:\n${text}`;
    return await claudeChat(prompt);
  }

  // Keyless, CORS-enabled translation (Google's public endpoint). Real translations, ~100+ languages.
  async function translateFree(text, from, to){
    const sl = from==='auto' ? 'auto' : (ISO[from]||'auto');
    const tl = ISO[to]||'en';
    const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl='+sl+
              '&tl='+tl+'&dt=t&q='+encodeURIComponent(text);
    const res=await fetch(url);
    if(!res.ok) throw new Error('tx '+res.status);
    const data=await res.json();
    // data[0] is an array of [translatedChunk, originalChunk, ...]
    return (data[0]||[]).map(seg=>seg[0]).join('').trim();
  }

  ltDetect.addEventListener('click',()=>{
    const t=ltSource.value.trim();
    if(!t){ ltStatus.textContent='Type some text first.'; return; }
    const guess=detectLang(t);
    if(guess && [...ltFrom.options].some(o=>o.value===guess)){ ltFrom.value=guess; ltStatus.textContent='Detected: '+guess+'.'; }
    else ltStatus.textContent='Could not confidently detect : please choose the source language.';
  });
  function detectLang(t){
    if(/[一-鿿]/.test(t)) return 'Mandarin Chinese';
    if(/[؀-ۿ]/.test(t)) return 'Arabic';
    if(/[가-힯]/.test(t)) return 'Korean';
    if(/[ऀ-ॿ]/.test(t)) return 'Hindi';
    const l=' '+t.toLowerCase()+' ';
    if(/[ñ¿¡]|\b(necesito|documentos|ayuda|para|próximo|qué)\b/.test(l)) return 'Spanish';
    if(/\b(je|vous|bonjour|besoin|prochaine|documents)\b/.test(l)) return 'French';
    if(/\b(preciso|documentos|próximo|ajuda)\b/.test(l)) return 'Portuguese';
    return 'English';
  }

  let speaking=false;
  ltRead.addEventListener('click',()=>{
    if(!('speechSynthesis' in window)){ ltStatus.textContent='Read-aloud not supported in this browser.'; return; }
    if(speaking){ window.speechSynthesis.cancel(); return; }
    const text=ltOut.textContent.trim();
    if(!text){ ltStatus.textContent='Nothing to read yet : translate first.'; return; }
    const u=new SpeechSynthesisUtterance(text);
    u.lang=speechCode(ltTo.value);
    applyVoiceMood(u,u.lang);
    u.onstart=()=>{ speaking=true; ltRead.classList.add('speaking'); ltRead.textContent='■ Stop'; };
    u.onend=u.onerror=()=>{ speaking=false; ltRead.classList.remove('speaking'); ltRead.textContent='▶ Read Aloud'; };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
  // defer the restart click so onend can clear `speaking` first (else the click hits
  // the if(speaking){cancel;return} guard and playback just stops instead of restarting)
  ltSpeed.addEventListener('change',()=>{ if(speaking){ window.speechSynthesis.cancel(); setTimeout(()=>ltRead.click(),0); }});
  // changing the mood mid-playback restarts with the new voice
  ltVoice.addEventListener('change',()=>{ if(speaking){ window.speechSynthesis.cancel(); setTimeout(()=>ltRead.click(),0); }});

  // configure PDF.js worker

  ltScan.addEventListener('click',()=>ltFile.click());
  ltFile.addEventListener('change',async()=>{
    const f=ltFile.files[0]; if(!f){ return; }
    ltScan.disabled=true;
    try{
      if(f.type==='text/plain'){
        const txt=await f.text();
        setScanned(txt, f.name);
      } else if(f.type==='application/pdf' || /\.pdf$/i.test(f.name)){
        ltStatus.textContent='Reading PDF…';
        const txt=await readPdf(f);
        setScanned(txt, f.name);
      } else if(f.type.startsWith('image/')){
        const txt=await ocrImage(f);
        setScanned(txt, f.name);
      } else {
        ltStatus.textContent='Unsupported file type. Use an image, PDF, or .txt file.';
      }
    }catch(err){
      ltStatus.textContent='Could not read that file: '+(err && err.message ? err.message : 'unknown error')+'.';
    }finally{
      ltScan.disabled=false; ltFile.value='';
    }
  });

  function setScanned(text, name){
    text=(text||'').trim();
    if(!text){ ltStatus.textContent='No readable text found in '+name+'.'; return; }
    ltSource.value=text.slice(0,5000);
    ltFrom.value='auto'; // let the translator auto-detect the scanned language
    ltStatus.textContent='Scanned text from '+name+'. Press Translate.';
  }

  // ---- image OCR via Tesseract.js ----
  async function ocrImage(file){
    if(!window.Tesseract) throw new Error('OCR library not loaded : check your connection');
    ltStatus.textContent='Scanning image… 0%';
    const url=URL.createObjectURL(file);
    try{
      const {data}=await Tesseract.recognize(url, 'eng+spa+fra+por+deu+ita', {
        logger:m=>{ if(m.status==='recognizing text'){ ltStatus.textContent='Scanning image… '+Math.round(m.progress*100)+'%'; } }
      });
      return data.text;
    } finally { URL.revokeObjectURL(url); }
  }

  // ---- PDF: try the text layer first, then OCR each page image ----
  async function readPdf(file){
    if(!window.pdfjsLib) throw new Error('PDF library not loaded : check your connection');
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let out='';
    for(let p=1;p<=pdf.numPages;p++){
      ltStatus.textContent='Reading PDF page '+p+' of '+pdf.numPages+'…';
      const page=await pdf.getPage(p);
      const tc=await page.getTextContent();
      out += tc.items.map(i=>i.str).join(' ')+'\n';
    }
    if(out.trim().length>15) return out;           // born-digital PDF with a real text layer
    // scanned PDF (image only) → OCR the first few pages
    ltStatus.textContent='Scanned PDF detected : running OCR…';
    let ocr='';
    const pages=Math.min(pdf.numPages,3);
    for(let p=1;p<=pages;p++){
      const page=await pdf.getPage(p);
      const vp=page.getViewport({scale:2});
      const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
      const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
      const {data}=await Tesseract.recognize(blob,'eng+spa+fra',{
        logger:m=>{ if(m.status==='recognizing text') ltStatus.textContent='OCR page '+p+'/'+pages+'… '+Math.round(m.progress*100)+'%'; }
      });
      ocr += data.text+'\n';
    }
    return ocr;
  }

  /* ================= DOCUMENT REVIEW ================= */
  const drForm=document.getElementById('drForm'), drInput=document.getElementById('drInput'),
        drReview=document.getElementById('drReview'), drSample=document.getElementById('drSample'),
        drIssues=document.getElementById('drIssues');

  const DR_SAMPLES={
    'I-485':'Address history: 2019-2021 (Chicago), 2022-present (Houston). Signature: left blank. Date of birth: 05/30/1996 on this form, 30/05/1996 on my passport. Employment: no end date listed for previous job.',
    'I-130':'Petitioner is U.S. citizen. Beneficiary is spouse. Marriage date listed but no marriage certificate number entered. Prior marriages: question left blank. Signatures: petitioner signed, beneficiary section empty.',
    'I-765':'Eligibility category: (c)(9). SSN: left blank. Previous EAD: marked yes but card number not provided. Name matches passport. Signature present.',
    'I-693':'Civil surgeon section completed. Exam date: 02/2024. Vaccination record: partial. Applicant signature present. Sealed envelope: not noted.',
    'N-400':'Continuous residence: trips abroad listed but two overlap in dates. Tax filing: marked yes. Selective Service: left blank for male applicant under 26. Signature present.',
    'Other':'Describe the form fields you filled in, any blanks you left, and any dates that might not match across documents.'
  };
  drSample.addEventListener('click',()=>{ drInput.value=DR_SAMPLES[drForm.value]||DR_SAMPLES.Other; });

  const SEV={high:'red',medium:'amb',low:'blu'};
  const STATUS_TEXT={
    'looks-good':'No obvious issues found. This is not a guarantee : always confirm against the official USCIS form instructions.',
    'needs-attention':'A few points to review before you file.',
    'major-issues':'Several important issues to fix before filing.'
  };
  // result = {overallStatus, issues:[{severity,field,problem,suggestion}], reminders:[...]}
  function renderIssues(result, note){
    const issues=result.issues||[], reminders=result.reminders||[];
    const status=result.overallStatus||'needs-attention';
    let html='<div class="dr-summary ai-pop">'+esc(STATUS_TEXT[status]||status)+(note?' '+esc(note):'')+'</div>';
    html+=issues.map(i=>{
      const c=SEV[i.severity]||'blu';
      const sug=i.suggestion?` <i>Fix: ${esc(i.suggestion)}</i>`:'';
      return `<div class="issue ${c} ai-pop"><div class="idot"></div><div><b>${esc(i.field||'Field')}</b><p>${esc(i.problem||'')}${sug}</p></div></div>`;
    }).join('');
    if(reminders.length){
      html+='<div class="dr-summary" style="margin-top:16px">Before you submit:</div>'+
        reminders.map(r=>`<div class="issue blu"><div class="idot"></div><div><p>${esc(r)}</p></div></div>`).join('');
    }
    drIssues.replaceChildren();
    drIssues.insertAdjacentHTML('beforeend', html + citationsHTML('rfe request for evidence '+(drForm?drForm.value:'')));
  }

  drReview.addEventListener('click',async()=>{
    const text=drInput.value.trim();
    if(!text){ drIssues.innerHTML='<p class="dr-placeholder">Describe or paste your form entries first.</p>'; return; }
    drIssues.innerHTML='<div class="dr-loading"><div class="dr-spin"></div>Reviewing your '+esc(drForm.value)+' entries…</div>';
    drReview.disabled=true;
    try{
      const items=await reviewAI(drForm.value, text);
      renderIssues(items);
    }catch(e){
      const local=localReview(text);
      renderIssues({
        overallStatus: local.some(i=>i.severity==='high')?'major-issues':'needs-attention',
        issues: local.map(i=>({severity:i.severity, field:i.title, problem:i.detail, suggestion:''})),
        reminders: []
      }, '(Reviewed with the on-device checker; connect to the internet for the full AI review.)');
    }finally{ drReview.disabled=false; }
  });

  async function reviewAI(form, text){
    const system=`You are a meticulous U.S. immigration paralegal reviewing a draft form for errors before submission. You are not a lawyer and do not give legal advice. Flag inconsistencies, missing required information, and common rejection triggers. Return ONLY JSON.\n\n${GROUNDING_RULE}\nOFFICIAL SOURCES:\n${sourcesPrompt('rfe request for evidence form '+form)}`;
    const prompt=`Review the following draft entries for ${form}. Identify problems that could cause a rejection or RFE.
Return ONLY a JSON object (no markdown, no prose) shaped exactly:
{"overallStatus":"looks-good"|"needs-attention"|"major-issues",
 "issues":[{"severity":"high"|"medium"|"low","field":"short field name","problem":"what's wrong","suggestion":"how to fix"}],
 "reminders":["short reminder", ...]}

Form: ${form}

Entries:
${text}`;
    const data=await aiJSONSchema(prompt, system, SCHEMAS.review, {model:AI_SMART, max_tokens:1000, temperature:0.2});
    return {
      overallStatus: data.overallStatus||'needs-attention',
      issues: Array.isArray(data.issues)?data.issues:[],
      reminders: Array.isArray(data.reminders)?data.reminders:[]
    };
  }

  // on-device rule checker (works offline)
  function localReview(text){
    const t=text.toLowerCase(), out=[];
    if(/(signature|sign)\b[^.]*\b(blank|empty|left|not|missing|unsigned)/.test(t) || /\bunsigned\b/.test(t))
      out.push({severity:'high',title:'Missing signature',detail:'A required signature field appears blank : forms are often rejected if unsigned.'});
    if(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text) && /(passport|other|differ|mismatch|doesn'?t match|not match|30\/05|05\/30)/.test(t))
      out.push({severity:'high',title:'Date may not match',detail:'A date looks inconsistent across documents (e.g. MM/DD vs DD/MM). Make them identical.'});
    if(/(blank|empty|left blank|not (provided|listed|entered)|no (end )?date|missing|empty)/.test(t))
      out.push({severity:'medium',title:'Blank or missing field',detail:'Something is described as blank or not listed : confirm whether the form requires it.'});
    if(/(gap|overlap|no end date|present)/.test(t) && /(address|residence|employment|job|trip|abroad)/.test(t))
      out.push({severity:'medium',title:'Possible timeline gap',detail:'Check that your address or employment dates have no unexplained gaps or overlaps.'});
    out.push({severity:'low',title:'Check official instructions',detail:'Requirements vary by form and case : verify against the latest USCIS instructions for '+drForm.value+'.'});
    return out;
  }

  /* ================= INTERVIEW PREP SIMULATOR ================= */
  const ipCase=document.getElementById('ipCase'), ipLang=document.getElementById('ipLang'),
        ipExample=document.getElementById('ipExample'), ipStart=document.getElementById('ipStart'),
        ipReadQ=document.getElementById('ipReadQ'), ipChat=document.getElementById('ipChat'),
        ipInputBar=document.getElementById('ipInputBar'), ipAnswer=document.getElementById('ipAnswer'),
        ipSend=document.getElementById('ipSend');

  // example question + offline question bank per case type
  const IP_BANK={
    'Marriage-based adjustment of status (I-485)':['How did you and your spouse first meet?','When and where did you get married?','Who lives in your household, and what is your typical morning routine together?','Please explain your current address history.','Has either of you been married before?'],
    'Family-based petition (I-130)':['What is your relationship to the petitioner?','When did the petitioner become a U.S. citizen or permanent resident?','Please explain your current address history.','How often are you in contact with your relative?'],
    'Employment-based green card':['Describe your current job and your main responsibilities.','How were you recruited for this position?','What are your qualifications for this role?','Please explain your employment history over the past five years.'],
    'Naturalization / citizenship (N-400)':['How many days have you spent outside the United States in the last five years?','Have you paid your federal taxes?','Can you name one branch of the U.S. government?','Please explain your current address history.'],
    'Asylum interview':['Please describe, in your own words, why you left your home country.','When did you decide you could not return?','Did you report what happened to any authorities?','Is there anyone who can corroborate your account?']
  };
  function exampleFor(c){ const b=IP_BANK[c]; return b?b[0]:'Please explain your current address history.'; }
  ipCase.addEventListener('change',()=>{ if(ipCase.value) ipExample.textContent=exampleFor(ipCase.value); });

  // fill the language menu with every language (English + each), reusing the ISO map
  (function fillIpLangs(){
    Object.keys(ISO).filter(n=>n!=='English').sort().forEach(n=>{
      const o=document.createElement('option');
      o.value='English + '+n; o.textContent='English + '+n; ipLang.appendChild(o);
    });
  })();

  let ipHistory=[], ipActive=false, ipQCount=0, ipLastQuestion='';

  function bubble(role, html){
    const d=document.createElement('div');
    d.className='bubble '+(role==='officer'?'officer':'me');
    d.innerHTML = role==='officer' ? '<span class="who">Interviewer</span>'+html : html;
    ipChat.appendChild(d); ipChat.scrollTop=ipChat.scrollHeight; return d;
  }
  function coachCard(level, note){
    const map={'clear':['clear','● Clear'],'clarify':['clarify','● Needs clarification'],'help':['help','● Consider asking for help']};
    const m=map[level]||map.clarify;
    const d=document.createElement('div');
    d.className='coach-card '+m[0];
    d.innerHTML='<div class="ctag">'+m[1]+'</div><p>'+esc(note)+'</p>';
    ipChat.appendChild(d); ipChat.scrollTop=ipChat.scrollHeight;
  }
  function typing(){
    const d=document.createElement('div'); d.className='ip-typing'; d.id='ipTyping';
    d.innerHTML='Interviewer is typing <i></i><i></i><i></i>';
    ipChat.appendChild(d); ipChat.scrollTop=ipChat.scrollHeight; return d;
  }
  function clearTyping(){ const t=document.getElementById('ipTyping'); if(t) t.remove(); }

  ipStart.addEventListener('click',async()=>{
    if(!ipCase.value){ ipExample.textContent='Please choose a case type first.'; return; }
    ipActive=true; ipQCount=0; ipHistory=[];
    ipChat.innerHTML=''; ipInputBar.hidden=false;
    bubble('officer','Hello, and thank you for coming in today. This is a practice interview for your <b>'+esc(ipCase.value)+'</b>. Answer naturally : I’ll give you feedback after each response. Let’s begin.');
    await askNext('');   // first question
  });

  ipSend.addEventListener('click',sendAnswer);
  ipAnswer.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendAnswer(); }});
  ipAnswer.addEventListener('input',()=>{ ipAnswer.style.height='auto'; ipAnswer.style.height=Math.min(ipAnswer.scrollHeight,120)+'px'; });

  async function sendAnswer(){
    const a=ipAnswer.value.trim(); if(!a||!ipActive) return;
    bubble('me', esc(a)); ipAnswer.value=''; ipAnswer.style.height='auto';
    ipSend.disabled=true;
    await askNext(a);
    ipSend.disabled=false; ipAnswer.focus();
  }

  async function askNext(userAnswer){
    const t=typing();
    try{
      const r=await interviewAI(userAnswer);
      clearTyping();
      if(userAnswer && r.coaching) coachCard(r.coaching.level, r.coaching.note);
      if(r.done){
        bubble('officer', esc(r.next_question || 'That’s the end of this practice session. Well done : review the feedback above and try again anytime.'));
        if(r.summary) coachCard('clear', r.summary);
        endSession(); return;
      }
      ipLastQuestion=r.next_question||exampleFor(ipCase.value);
      bubble('officer', esc(ipLastQuestion));
      ipQCount++;
      if(ipQCount>=8){ // cap the session
        bubble('officer','That’s all the questions for this practice round. Review your feedback above : you can start again with another scenario anytime.');
        endSession();
      }
    }catch(e){
      clearTyping();
      // offline fallback: heuristic coach + scripted question bank
      if(userAnswer) { const c=localCoach(userAnswer); coachCard(c.level,c.note); }
      const bank=IP_BANK[ipCase.value]||IP_BANK['Marriage-based adjustment of status (I-485)'];
      if(ipQCount>=bank.length){ bubble('officer','That completes this practice round. Review your feedback above : start again anytime.'); endSession(); return; }
      ipLastQuestion=bank[ipQCount++];
      bubble('officer', esc(ipLastQuestion));
    }
  }

  function endSession(){ ipActive=false; ipInputBar.hidden=true;
    const d=document.createElement('div'); d.className='ip-done'; d.textContent='Practice session complete.'; ipChat.appendChild(d);
    ipChat.scrollTop=ipChat.scrollHeight;
  }

  async function interviewAI(userAnswer){
    // ipHistory is the running transcript in {role:'applicant'|'officer'} form.
    if(userAnswer) ipHistory.push({role:'applicant',content:userAnswer});
    const system=`You simulate a USCIS officer conducting a green card interview for practice. Speak the way real officers do: terse, concrete, one question at a time. No flowery or "AI-sounding" phrasing.
SAFETY GUARDRAIL (VAWA): If the scenario is a VAWA self-petition or the applicant references abuse, domestic violence, or fear of an abuser, never ask the applicant to involve, contact, confront, or seek information from the abuser, and never suggest they need the abuser's cooperation. Keep questions trauma-informed and confidential.
After each applicant answer, give brief coaching. Return ONLY JSON.`;
    const transcript=ipHistory.map(h=>`${h.role==='officer'?'Officer':'Applicant'}: ${h.content}`).join('\n');
    const prompt=`Scenario / pathway: ${ipCase.value}
Transcript so far:
${transcript||'(none yet : ask your first question)'}

Return ONLY a JSON object shaped exactly:
{"coaching":{"level":"clear"|"clarify"|"help","note":"short feedback on the applicant's last answer, or null if none"},
 "nextQuestion":"the officer's next question (terse, USCIS style)",
 "done":false,
 "summary":null}
Set "done":true and provide a short "summary" only when the interview should end.`;
    const data=await aiJSONSchema(prompt, system, SCHEMAS.interview, {model:AI_SMART, max_tokens:700, temperature:0.5});
    const q=data.nextQuestion||'';
    if(q) ipHistory.push({role:'officer',content:q});
    return {coaching:data.coaching||null, next_question:q, done:!!data.done, summary:data.summary||null};
  }

  // offline heuristic coach
  function localCoach(a){
    const words=a.trim().split(/\s+/).length;
    if(/\b(i don'?t know|not sure|no se|unsure)\b/i.test(a)) return {level:'help',note:'It’s okay not to know : in a real interview you can politely ask the officer to repeat or clarify.'};
    if(words<6) return {level:'clarify',note:'A bit brief. Add specific details like dates, places, or names so your answer is clear.'};
    if(words>120) return {level:'clarify',note:'Strong detail, but try to be more concise and answer the exact question asked.'};
    return {level:'clear',note:'Clear and specific : that’s the kind of direct answer officers look for.'};
  }

  // Read the current question aloud
  ipReadQ.addEventListener('click',()=>{
    if(!('speechSynthesis' in window)) return;
    const q=ipLastQuestion || ipExample.textContent;
    if(!q) return;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(q); u.rate=0.95; window.speechSynthesis.speak(u);
  });

  /* ================= GLOBAL SITE LANGUAGE ================= */
  const siteLang=document.getElementById('siteLang');
  // populate the header picker from the ISO map (English first)
  (function fillSiteLangs(){
    siteLang.innerHTML='';
    const en=document.createElement('option'); en.value='English'; en.textContent='English'; siteLang.appendChild(en);
    Object.keys(ISO).filter(n=>n!=='English').sort().forEach(n=>{
      const o=document.createElement('option'); o.value=n; o.textContent=n; siteLang.appendChild(o);
    });
  })();

  // collect translatable text nodes once, remembering the English original
  let i18nNodes=null;
  function collectNodes(){
    if(i18nNodes) return i18nNodes;
    i18nNodes=[];
    const SKIP=new Set(['SCRIPT','STYLE','OPTION','TEXTAREA','INPUT','SELECT']);
    const walker=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n){
        if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        let p=n.parentElement;
        while(p){ if(SKIP.has(p.tagName) || p.classList.contains('no-i18n')) return NodeFilter.FILTER_REJECT; p=p.parentElement; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node; while((node=walker.nextNode())){ i18nNodes.push({node, en:node.nodeValue}); }
    return i18nNodes;
  }

  // translate an array of strings using few, parallel requests
  async function translateBatch(strings, to){
    const SEP=' ~|~ ';
    const out=new Array(strings.length);
    // build chunks (bigger cap = fewer requests)
    const chunks=[]; let batch=[], idx=[], len=0;
    for(let i=0;i<strings.length;i++){
      const s=strings[i];
      if(batch.length && len+s.length>4500){ chunks.push({batch,idx}); batch=[]; idx=[]; len=0; }
      batch.push(s); idx.push(i); len+=s.length+SEP.length;
    }
    if(batch.length) chunks.push({batch,idx});

    // run all chunks in parallel
    await Promise.all(chunks.map(async ({batch,idx})=>{
      try{
        const res=await translateFree(batch.join(SEP),'auto',to);
        const parts=res.split(/\s*~\s*\|\s*~\s*/);
        if(parts.length===batch.length){ parts.forEach((p,k)=>out[idx[k]]=p.trim()); return; }
      }catch(e){ /* fall through to per-item */ }
      // fallback: translate this chunk's items in parallel individually
      await Promise.all(batch.map(async (s,k)=>{
        try{ out[idx[k]]=await translateFree(s,'auto',to); }catch(_){ out[idx[k]]=s; }
      }));
    }));
    return out;
  }

  let i18nBusy=false, i18nCache={};
  async function setSiteLanguage(lang){
    if(i18nBusy) return;
    const nodes=collectNodes();
    if(lang==='English'){ nodes.forEach(n=>{ n.node.nodeValue=n.en; }); return; }
    i18nBusy=true;
    const bar=document.createElement('div'); bar.className='lang-loading'; document.body.appendChild(bar);
    try{
      let values;
      if(i18nCache[lang]){ values=i18nCache[lang]; }
      else { values=await translateBatch(nodes.map(n=>n.en), lang); i18nCache[lang]=values; }
      nodes.forEach((n,i)=>{ if(values[i]) n.node.nodeValue=values[i]; });
      document.documentElement.lang=(ISO[lang]||'en').split('-')[0];
    }catch(e){
      // leave English in place on hard failure
      siteLang.value='English';
    }finally{
      i18nBusy=false; bar.remove();
    }
  }
  siteLang.addEventListener('change',()=>setSiteLanguage(siteLang.value));

  /* ================= PATHWAY FINDER (AI) ================= */
  (function(){
    const pwInput=document.getElementById('pwInput'),
          pwFind=document.getElementById('pwFind'),
          pwResult=document.getElementById('pwResult');
    if(!pwFind) return;
    const CONF={high:'High confidence',medium:'Medium confidence',low:'Low confidence'};
    pwFind.addEventListener('click',async()=>{
      const text=pwInput.value.trim();
      if(!text){ pwResult.innerHTML='<p class="dr-placeholder">Describe your situation first.</p>'; return; }
      pwResult.innerHTML='<div class="dr-loading"><div class="dr-spin"></div>Finding your most likely pathway…</div>';
      pwFind.disabled=true;
      try{
        const sys=`You are a U.S. immigration intake assistant that suggests the most likely green card pathway from a free-text description. You are not a lawyer; flag when a case is complex enough to need an accredited attorney. Return ONLY JSON.\n\n${GROUNDING_RULE}\nOFFICIAL SOURCES:\n${sourcesPrompt(text)}`;
        const pr=`Applicant's situation:\n"""${text}"""\n\nReturn ONLY a JSON object shaped exactly:\n{"primaryPathway":"name","subcategory":"optional or empty","confidence":"high"|"medium"|"low","reasoning":"1-3 sentence plain explanation","nextSteps":["step", ...],"alternativePathways":["option", ...]}`;
        const d=await aiJSONSchema(pr, sys, SCHEMAS.pathway, {model:AI_SMART, max_tokens:900, temperature:0.2});
        // Shared numbering map so the same [id] reuses its number across reasoning + steps.
        const nums=Object.create(null);
        // Build an "issue" card whose <p> body holds model text with inline citations
        // rendered as safe DOM (linkifyCitations -> createElement/textContent only).
        const issueCard=(cls,modelText)=>{
          const card=document.createElement('div'); card.className='issue '+cls+' ai-pop';
          const dot=document.createElement('div'); dot.className='idot'; card.appendChild(dot);
          const body=document.createElement('div'); const p=document.createElement('p');
          p.appendChild(linkifyCitations(modelText, nums)); body.appendChild(p); card.appendChild(body);
          return card;
        };
        const heading=(label)=>{ const h=document.createElement('div'); h.className='dr-summary'; h.style.marginTop='16px'; h.textContent=label; return h; };
        pwResult.replaceChildren();
        const summary=document.createElement('div'); summary.className='dr-summary ai-pop';
        const nameB=document.createElement('b'); nameB.textContent=d.primaryPathway||'Pathway'; summary.appendChild(nameB);
        summary.appendChild(document.createTextNode((d.subcategory?' : '+d.subcategory:'')+' · '+(CONF[d.confidence]||d.confidence||'')));
        pwResult.appendChild(summary);
        pwResult.appendChild(issueCard('blu', d.reasoning||''));
        if((d.nextSteps||[]).length){
          pwResult.appendChild(heading('Suggested next steps:'));
          (d.nextSteps||[]).forEach(s=>pwResult.appendChild(issueCard('blu', s)));
        }
        if((d.alternativePathways||[]).length){
          pwResult.appendChild(heading('Other options to explore:'));
          (d.alternativePathways||[]).forEach(a=>pwResult.appendChild(issueCard('amb', a)));
        }
        pwResult.insertAdjacentHTML('beforeend', `<div class="legal-row"><button class="btn-legal" data-go="qa">Ask a question about this</button><small>Not legal advice. Complex cases: consult an accredited attorney.</small></div>`);
        pwResult.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));
        // Footer lists only sources the model actually cited (across reasoning + steps + alts).
        const allText=[d.reasoning||''].concat(d.nextSteps||[], d.alternativePathways||[]).join(' ');
        pwResult.insertAdjacentHTML('beforeend', citationsFromText(allText, text));
      }catch(e){
        pwResult.replaceChildren(); pwResult.insertAdjacentHTML('beforeend', aiErrorHTML(e));
      }finally{ pwFind.disabled=false; }
    });
  })();

  /* ================= STAGE Q&A (AI) ================= */
  (function(){
    const qaPathway=document.getElementById('qaPathway'),
          qaStage=document.getElementById('qaStage'),
          qaInput=document.getElementById('qaInput'),
          qaAsk=document.getElementById('qaAsk'),
          qaAnswer=document.getElementById('qaAnswer');
    if(!qaAsk) return;
    qaAsk.addEventListener('click',async()=>{
      const q=qaInput.value.trim();
      if(!q){ qaAnswer.innerHTML='<p class="dr-placeholder">Type a question first.</p>'; return; }
      qaAnswer.innerHTML='<div class="dr-loading"><div class="dr-spin"></div>Finding a clear answer…</div>';
      qaAsk.disabled=true;
      try{
        const sys=`You answer questions about a specific stage of the U.S. green card process in clear, plain language. You are not a lawyer and do not give legal advice; recommend an accredited attorney for complex situations. Be accurate, warm, and concise.\n\n${GROUNDING_RULE}\nOFFICIAL SOURCES:\n${sourcesPrompt(q+' '+qaStage.value+' '+qaPathway.value)}`;
        const pr=`Pathway: ${qaPathway.value}\nStage: ${qaStage.value}\nQuestion: ${q}\n\nAnswer in 1-3 short paragraphs of plain text (no markdown).`;
        const box=document.createElement('div');
        box.className='dr-summary ai-pop stream-caret'; box.style.lineHeight='1.6';
        qaAnswer.innerHTML=''; qaAnswer.appendChild(box);
        // Render each paragraph as a safe <p> with inline citation superscripts
        // (linkifyCitations builds DOM via createElement/textContent — never innerHTML).
        let lastFull='';
        const renderAnswer=(full)=>{
          lastFull=full;
          const nums=Object.create(null), frag=document.createDocumentFragment();
          full.split(/\n+/).filter(Boolean).forEach(p=>{
            const el=document.createElement('p'); el.style.margin='0 0 10px';
            el.appendChild(linkifyCitations(p, nums)); frag.appendChild(el);
          });
          box.replaceChildren(frag);
        };
        await aiStream(
          [{role:'system',content:sys},{role:'user',content:pr}],
          (tok,full)=>renderAnswer(full),
          {temperature:0.3,max_tokens:700,model:AI_SMART}
        );
        box.classList.remove('stream-caret');
        qaAnswer.insertAdjacentHTML('beforeend', citationsFromText(lastFull, q+' '+qaStage.value));
      }catch(e){
        qaAnswer.innerHTML=aiErrorHTML(e);
      }finally{ qaAsk.disabled=false; }
    });
  })();

  /* ================= VISA BULLETIN (AI, grounded) ================= */
  (function(){
    const cat=document.getElementById('vbCategory'),
          country=document.getElementById('vbCountry'),
          date=document.getElementById('vbDate'),
          check=document.getElementById('vbCheck'),
          result=document.getElementById('vbResult');
    if(!check) return;
    // Render model output as <p> nodes with inline citation superscripts.
    // Built with createElement/textContent + linkifyCitations (XSS-safe; no innerHTML on model text).
    function renderParas(target, full){
      const nums=Object.create(null), frag=document.createDocumentFragment();
      full.split(/\n+/).filter(Boolean).forEach(p=>{
        const el=document.createElement('p'); el.style.margin='0 0 10px';
        el.appendChild(linkifyCitations(p, nums)); frag.appendChild(el);
      });
      target.replaceChildren(frag);
    }
    function placeholder(msg){
      result.replaceChildren();
      result.insertAdjacentHTML('beforeend','<p class="dr-placeholder">'+esc(msg)+'</p>');
    }
    const SOURCE_NOTE='Computed from real DOS Visa Bulletin history (through the Dec 2025 bulletin). Cutoffs change monthly — always confirm the current official bulletin.';
    // Build a deterministic estimate card with safe DOM (textContent, never innerHTML).
    // Mirrors the renderParas idiom above so no untrusted data is ever parsed as markup.
    function buildEstimateCard(d){
      const card=document.createElement('div');
      card.className='issue blu'; card.setAttribute('role','status'); card.style.marginBottom='14px';
      const dot=document.createElement('span'); dot.className='idot'; card.appendChild(dot);
      const body=document.createElement('div');
      const head=document.createElement('b'); const sub=document.createElement('p'); sub.style.marginTop='4px';
      if(d && d.available===true && d.years===0){
        head.textContent='Likely current now';
        sub.textContent='Your priority date is on or before the latest final-action date in the dataset ('+(d.latest_pd||'latest available')+').';
      } else if(d && d.available===true && typeof d.years==='number' && d.years>0){
        head.textContent='~'+d.years+' years to current (rough estimate)';
        let t=(d.status?d.status+'. ':'')+'Based on the recent advancement rate for '+(d.country||country.value)+' '+(d.category||cat.value)+'.';
        if(typeof d.r2==='number') t+=' (trend fit r²='+d.r2+')';
        sub.textContent=t;
      } else if(d && d.available===true && d.years===null){
        head.textContent='No reliable estimate';
        sub.textContent=d.note||d.status||'This queue has stalled or retrogressed, so a forward projection is not meaningful.';
      } else {
        head.textContent='No data-backed estimate for this case';
        sub.textContent=(d&&d.reason)||'This category or country is not covered by the Visa Bulletin forecast dataset.';
      }
      body.appendChild(head); body.appendChild(sub);
      const note=document.createElement('small'); note.className='tiny'; note.style.display='block'; note.textContent=SOURCE_NOTE;
      body.appendChild(note);
      card.appendChild(body);
      return card;
    }
    check.addEventListener('click',async()=>{
      if(!date.value){ placeholder('Pick your priority date first.'); return; }
      result.replaceChildren();
      result.insertAdjacentHTML('beforeend','<div class="dr-loading"><div class="dr-spin"></div>Checking the real Visa Bulletin data…</div>');
      check.disabled=true;
      // Deterministic, data-backed estimate from the real Visa Bulletin dataset.
      // Wrapped in its own try/catch so a failure here NEVER blocks the AI explanation.
      let estCard=null;
      try{
        const er=await fetch('/api/visa-estimate',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({category:cat.value,country:country.value,priority_date:date.value})
        });
        if(er.ok){ estCard=buildEstimateCard(await er.json()); }
      }catch(_e){ /* estimate is optional; AI explanation continues regardless */ }
      try{
        const q='visa bulletin priority date '+cat.value+' '+country.value;
        const sys=`You explain the U.S. State Department Visa Bulletin in clear, plain language for one person's case. You are not a lawyer and give general information only.\n\n${GROUNDING_RULE}\nCRITICAL: cutoff dates change every month and you do NOT have access to the current month's bulletin. NEVER state, estimate, or guess a specific current cutoff date or a number of months/years of wait. Instead explain how to read the bulletin for their category and country and tell them to check the official bulletin (linked separately) for the exact current cutoff.\nOFFICIAL SOURCES:\n${sourcesPrompt(q)}`;
        const pr=`Category: ${cat.value}\nCountry of chargeability: ${country.value}\nTheir priority date: ${date.value}\n\nExplain in 2-3 short plain-text paragraphs: (1) what a priority date is and why theirs matters, (2) how to compare their date against Chart A (Final Action Dates) and Chart B (Dates for Filing) in the current bulletin, (3) general context for oversubscribed countries (especially India and China) without giving any specific cutoff or wait length. Do not state any specific current cutoff date.`;
        const box=document.createElement('div');
        box.className='dr-summary ai-pop stream-caret'; box.style.lineHeight='1.6';
        // Show the deterministic estimate card first (the trustworthy headline),
        // then append the AI explanation below it so both stay visible.
        result.replaceChildren();
        if(estCard) result.appendChild(estCard);
        result.appendChild(box);
        const fullText=await aiStream(
          [{role:'system',content:sys},{role:'user',content:pr}],
          (tok,full)=>renderParas(box, full),
          {temperature:0.3,max_tokens:700,model:AI_SMART}
        );
        box.classList.remove('stream-caret');
        result.insertAdjacentHTML('beforeend', citationsFromText(fullText, q));
      }catch(e){
        result.replaceChildren();
        if(estCard) result.appendChild(estCard);
        result.insertAdjacentHTML('beforeend', aiErrorHTML(e));
      }finally{ check.disabled=false; }
    });
  })();

  /* ================= INTERACTIVE ROADMAP ================= */
  (function(){
    const stageButtons=[...document.querySelectorAll('.stage[data-stage]')];
    const pct=document.getElementById('progressPct');
    const fill=document.getElementById('progressFill');
    const title=document.getElementById('checkpointTitle');
    const grid=document.getElementById('checkpointGrid');
    if(!stageButtons.length || !pct || !fill || !title || !grid) return;

    const stages=[
      {name:'Eligibility', checkpoint:'Confirm eligibility basics', tasks:['Current immigration status','Sponsor or category','Address history','Prior filings reviewed'], done:[true,true,true,true]},
      {name:'Gather', checkpoint:'Gather supporting documents', tasks:['Identity document','Birth certificate','Passport-style photos','Form checklist review'], done:[false,false,false,false]},
      {name:'File', checkpoint:'Prepare filing packet', tasks:['Complete forms','Attach supporting evidence','Review filing fees','Make final copy'], done:[false,false,false,false]},
      {name:'Biometrics', checkpoint:'Plan biometrics appointment', tasks:['Appointment notice saved','Calendar reminder set','Valid ID ready','Travel plan confirmed'], done:[false,false,false,false]},
      {name:'Interview', checkpoint:'Practice interview answers', tasks:['Relationship timeline','Address and work history','Document binder ready','Mock interview complete'], done:[false,false,false,false]},
      {name:'Decision', checkpoint:'Track final decision', tasks:['Receipt account checked','Mailing address current','Approval notice saved','Green card delivery tracked'], done:[false,false,false,false]}
    ];
    let activeStage=1;

    function doneCount(stage){ return stage.done.filter(Boolean).length; }
    function stageComplete(stage){ return doneCount(stage)===stage.done.length; }
    function progressValue(){
      const totalTasks=stages.reduce((sum,stage)=>sum+stage.done.length,0);
      const completedTasks=stages.reduce((sum,stage)=>sum+doneCount(stage),0);
      return Math.round((completedTasks / totalTasks) * 100);
    }
    function dotClassFor(i){
      if(i<activeStage && stageComplete(stages[i])) return 'sdot c-green';
      if(i===activeStage) return stageComplete(stages[i]) ? 'sdot c-green' : 'sdot c-amber';
      if(i===activeStage+1) return 'sdot c-slate';
      return 'sdot muted';
    }
    function statusFor(i){
      if(stageComplete(stages[i])) return ['Complete',''];
      if(i===activeStage) return ['In progress','act'];
      if(i<activeStage) return ['Needs work','warn'];
      if(i===activeStage+1) return ['Next',''];
      return ['Later',''];
    }
    function renderCheckpoint(){
      const stage=stages[activeStage];
      title.textContent=stage.checkpoint;
      grid.innerHTML=stage.tasks.map((task,i)=>{
        const complete=stage.done[i];
        return `<button class="cp-item" type="button" data-task="${i}" aria-pressed="${complete}">
          <span class="cp-box${complete?' checked':''}" aria-hidden="true"></span>
          <span><span class="ct">${esc(task)}</span><span class="status ${complete?'complete':'inprog'}">${complete?'COMPLETE':'IN PROGRESS'}</span></span>
        </button>`;
      }).join('');
    }
    function renderRoadmap(){
      const value=progressValue();
      pct.textContent=value+'% complete';
      fill.style.width=value+'%';
      stageButtons.forEach((btn,i)=>{
        btn.classList.toggle('is-active',i===activeStage);
        btn.classList.toggle('is-complete',stageComplete(stages[i]));
        btn.setAttribute('aria-pressed',String(i===activeStage));
        const dot=btn.querySelector('.sdot');
        const small=btn.querySelector('small');
        dot.className=dotClassFor(i);
        const [text,cls]=statusFor(i);
        small.textContent=text;
        small.className=cls;
      });
      renderCheckpoint();
    }

    stageButtons.forEach(btn=>{
      btn.addEventListener('click',()=>{
        activeStage=Number(btn.dataset.stage);
        renderRoadmap();
        document.querySelector('.checkpoint')?.scrollIntoView({behavior:'smooth',block:'nearest'});
      });
    });
    grid.addEventListener('click',ev=>{
      const item=ev.target.closest('.cp-item');
      if(!item) return;
      const index=Number(item.dataset.task);
      stages[activeStage].done[index]=!stages[activeStage].done[index];
      renderRoadmap();
    });
    renderRoadmap();
  })();

  /* ================= VISUAL INTERACTION LAYER ================= */
  (function(){
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- scroll reveal (position-based; survives section show/hide) ----
    const revealSel='.home-hero,.rail-wrap,.clarity-row,.node,.roadmap-card,.badge-row,.intake,.qcard,'+
      '.checkpoint,.prog-top,.pbar,.stagerow,.timeline-card,.settings-card,.lt-toolbar,.lt-body,'+
      '.dr-left,.dr-right,.ip-left,.ip-chat-wrap,.footer-rule,.ai-box';
    document.querySelectorAll(revealSel).forEach(el=>el.classList.add('reveal'));
    document.querySelectorAll('.nodes .node').forEach((el,i)=>el.style.transitionDelay=(i*70)+'ms');
    function scanReveal(){
      document.querySelectorAll('.reveal:not(.in)').forEach(el=>{
        if(el.offsetParent===null) return;            // element in a hidden section
        const r=el.getBoundingClientRect();
        if(r.top<innerHeight*0.92 && r.bottom>40) el.classList.add('in');
      });
    }
    // Coalesce layout reads to one per frame so raw scroll events don't thrash reflow.
    let revealTicking=false;
    function scheduleReveal(){
      if(revealTicking) return;
      revealTicking=true;
      requestAnimationFrame(()=>{ scanReveal(); revealTicking=false; });
    }
    addEventListener('scroll',scheduleReveal,{passive:true});
    addEventListener('resize',scheduleReveal);
    document.addEventListener('click',e=>{ if(e.target.closest('[data-go]')) setTimeout(scanReveal,60); });
    setTimeout(scanReveal,80);

    // ---- pinch / ctrl-scroll zoom on result + translation panels (works even with reduced motion) ----
    ['#ltOut','#qaAnswer','#pwResult','#drIssues'].forEach(sel=>{
      const el=document.querySelector(sel); if(!el) return;
      el.classList.add('zoomable','zoomable-ready');
      el.title='Pinch or Ctrl+scroll to zoom · double-click to reset';
      let scale=1;
      el.addEventListener('wheel',ev=>{
        if(!ev.ctrlKey) return;                        // trackpad pinch arrives as ctrl+wheel
        ev.preventDefault();
        const r=el.getBoundingClientRect();
        el.style.setProperty('--zx',((ev.clientX-r.left)/r.width*100)+'%');
        el.style.setProperty('--zy',((ev.clientY-r.top)/r.height*100)+'%');
        scale=Math.min(3,Math.max(1,scale-ev.deltaY*0.012));
        el.style.transform=scale>1?`scale(${scale.toFixed(3)})`:'';
        el.classList.toggle('zoomed',scale>1);
      },{passive:false});
      el.addEventListener('dblclick',()=>{ scale=1; el.style.transform=''; el.classList.remove('zoomed'); });
    });

    if(reduce) return;   // heavier motion below is skipped for reduced-motion users

    // ---- 3D tilt on cards ----
    document.querySelectorAll('.node,.roadmap-card,.checkpoint').forEach(el=>{
      el.classList.add('tilt');
      el.addEventListener('mousemove',ev=>{
        const r=el.getBoundingClientRect();
        const px=(ev.clientX-r.left)/r.width-0.5, py=(ev.clientY-r.top)/r.height-0.5;
        el.style.transform=`perspective(800px) rotateX(${(-py*6).toFixed(2)}deg) rotateY(${(px*7).toFixed(2)}deg) translateY(-4px)`;
      });
      el.addEventListener('mouseleave',()=>{ el.style.transform=''; });
    });

    // ---- global cursor glow: gold light follows the cursor on every section/page ----
    const glow=document.createElement('div'); glow.className='cursor-glow'; document.body.appendChild(glow);
    addEventListener('mousemove',ev=>{
      glow.classList.add('on');
      glow.style.setProperty('--gx',ev.clientX+'px');
      glow.style.setProperty('--gy',ev.clientY+'px');
    },{passive:true});
    document.addEventListener('mouseleave',()=>glow.classList.remove('on'));
  })();

  /* ================= SCROLL-SCRUBBED STORIES ================= */
  (function(){
    const tracks=[...document.querySelectorAll('.scrolly-track')];
    if(!tracks.length) return;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ramp=(p,a,b)=>Math.min(1,Math.max(0,(p-a)/(b-a)));
    function apply(t,p){
      t.style.setProperty('--p1',ramp(p,0,.30).toFixed(4));
      t.style.setProperty('--p2',ramp(p,.24,.54).toFixed(4));
      t.style.setProperty('--p3',ramp(p,.48,.78).toFixed(4));
      t.style.setProperty('--p4',ramp(p,.74,.97).toFixed(4));
      const pctEl=t.querySelector('.scrolly-pct');
      if(pctEl) pctEl.textContent=Math.round(p*100)+'%';
      const idx=p<.28?0:p<.52?1:p<.76?2:3;
      t.querySelectorAll('.s-step').forEach((s,i)=>s.classList.toggle('on',i<=idx&&p>.02));
    }
    if(reduce){ tracks.forEach(t=>apply(t,1)); return; }   // show finished art, no scrubbing
    let ticking=false;
    function update(){
      ticking=false;
      tracks.forEach(t=>{
        if(t.offsetParent===null) return;            // section hidden
        const r=t.getBoundingClientRect();
        const total=r.height-innerHeight;
        apply(t,total>0?Math.min(1,Math.max(0,-r.top/total)):1);
      });
    }
    function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(update); } }
    addEventListener('scroll',onScroll,{passive:true});
    addEventListener('resize',onScroll);
    document.addEventListener('click',e=>{ if(e.target.closest('[data-go]')) setTimeout(update,80); });
    update();
  })();
}
