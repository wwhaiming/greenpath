# GreenPath AI Navigator — upgrade patch

Three edits to the artifact:
1. CSS polish/motion layer (append before `</style>`)
2. OpenAI helper swap (replaces the Claude helpers; powers all 6 AI features)
3. Stage Q&A streaming handler (live token-by-token answer)

Model: gpt-4o-mini (swap to gpt-4o in OPENAI_MODEL for higher quality).
SECURITY: key is client-side; public artifacts get scraped and OpenAI auto-revokes
leaked keys. Rotate + move to a server proxy for anything beyond a demo.

---

## EDIT 1 — append before `</style>`

```css
  /* ============ POLISH / MOTION LAYER ============ */
  .btn{box-shadow:0 1px 2px rgba(20,40,30,.06)}
  .btn:hover{transform:translateY(-2px)}
  .btn:active{transform:translateY(0)}
  .btn-primary{box-shadow:0 6px 18px -9px rgba(21,57,42,.65);position:relative;overflow:hidden}
  .btn-primary:hover{box-shadow:0 14px 28px -12px rgba(21,57,42,.6)}
  .btn-primary::before{content:"";position:absolute;top:0;left:0;width:55%;height:100%;pointer-events:none;
    background:linear-gradient(100deg,transparent,rgba(255,255,255,.22),transparent);transform:translateX(-160%)}
  .btn-primary:hover::before{animation:sheen .9s ease}
  @keyframes sheen{to{transform:translateX(240%)}}
  .btn-ghost:hover{box-shadow:0 8px 18px -12px rgba(47,107,79,.55)}

  a:focus-visible,button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{
    outline:2px solid var(--amber);outline-offset:2px;border-radius:10px}

  nav.main a{border-bottom:none!important;position:relative}
  nav.main a::after{content:"";position:absolute;left:0;right:100%;bottom:-3px;height:3px;
    background:var(--amber);border-radius:3px;transition:right .28s cubic-bezier(.22,.61,.36,1)}
  nav.main a:hover::after,nav.main a.active::after{right:0}

  .node,.roadmap-card,.checkpoint,.timeline-card,.settings-card,
  .dr-left,.dr-right,.intake,.qcard,.ip-left,.lt-body{
    transition:transform .35s cubic-bezier(.22,.61,.36,1),box-shadow .35s}
  .node:hover{transform:translateY(-5px)}
  .node .dot{box-shadow:0 10px 22px -10px rgba(20,40,30,.5);transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
  .node:hover .dot{transform:scale(1.08) rotate(-3deg)}
  .dr-left:hover,.dr-right:hover,.timeline-card:hover,.settings-card:hover{
    box-shadow:0 22px 46px -30px rgba(20,40,30,.45)}

  .qbar i,.pbar i{transition:width .7s cubic-bezier(.22,.61,.36,1)}

  .ai-badge{background:linear-gradient(120deg,var(--green-mid),#3f8a63)}
  .home-hero-glow{animation:floatGlow 10s ease-in-out infinite}
  @keyframes floatGlow{0%,100%{transform:translate(0,0)}50%{transform:translate(-20px,18px)}}

  .ai-pop{animation:aiPop .45s cubic-bezier(.22,.61,.36,1)}
  @keyframes aiPop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .bubble,.coach-card{animation:aiPop .4s cubic-bezier(.22,.61,.36,1)}
  .stream-caret p:last-child::after{content:"▌";color:var(--green-mid);margin-left:2px;animation:caret 1s steps(1) infinite}
  @keyframes caret{50%{opacity:0}}

  .ip-chat::-webkit-scrollbar{width:10px}
  .ip-chat::-webkit-scrollbar-thumb{background:#cdd9cf;border-radius:8px;border:3px solid transparent;background-clip:content-box}
  .ip-chat::-webkit-scrollbar-thumb:hover{background:#b9c9bd;background-clip:content-box}

  section.show{animation:sectionIn .5s cubic-bezier(.22,.61,.36,1)}
  @keyframes sectionIn{from{opacity:0;transform:translateY(12px) scale(.996)}to{opacity:1;transform:none}}

  @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
```

---

## EDIT 2 — replace the Claude helper block

Find the block that starts with `// ===== Shared Claude API helper` and ends with the
`claudeJSON` function. Replace the whole thing with:

```javascript
  // ===== Shared OpenAI helper =====
  // SECURITY: client-side key for a demo only. Public pages get scraped and OpenAI
  // auto-revokes leaked keys — rotate this + use a server proxy for production.
  const OPENAI_KEY='sk-proj-…REDACTED…';
  const OPENAI_MODEL='gpt-4o-mini';   // swap to 'gpt-4o' for higher-quality answers
  const OPENAI_URL='https://api.openai.com/v1/chat/completions';

  async function aiChat(prompt, system, opts={}){
    const messages=[];
    if(system) messages.push({role:'system',content:system});
    messages.push({role:'user',content:prompt});
    const res=await fetch(OPENAI_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
      body:JSON.stringify({model:OPENAI_MODEL,messages,
        temperature:opts.temperature??0.4, max_tokens:opts.max_tokens??900})
    });
    if(!res.ok) throw new Error('openai '+res.status);
    const data=await res.json();
    return (data.choices?.[0]?.message?.content||'').trim();
  }
  // parses a JSON object/array out of the reply (strips fences/prose)
  async function aiJSON(prompt, system, opts={}){
    let txt=await aiChat(prompt, system, opts);
    txt=txt.replace(/```json|```/g,'').trim();
    const s=txt.search(/[\[{]/); if(s>0) txt=txt.slice(s);
    return JSON.parse(txt);
  }
  // streaming chat — calls onToken(delta, fullText) as text arrives
  async function aiStream(messages, onToken, opts={}){
    const res=await fetch(OPENAI_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
      body:JSON.stringify({model:OPENAI_MODEL,messages,stream:true,
        temperature:opts.temperature??0.5, max_tokens:opts.max_tokens??900})
    });
    if(!res.ok || !res.body) throw new Error('openai '+res.status);
    const reader=res.body.getReader(), dec=new TextDecoder();
    let buf='', full='';
    while(true){
      const {value,done}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      let nl;
      while((nl=buf.indexOf('\n'))>=0){
        const line=buf.slice(0,nl).trim(); buf=buf.slice(nl+1);
        if(!line.startsWith('data:')) continue;
        const payload=line.slice(5).trim();
        if(payload==='[DONE]') return full;
        try{ const j=JSON.parse(payload); const t=j.choices?.[0]?.delta?.content||'';
          if(t){ full+=t; onToken(t, full); } }catch(_){}
      }
    }
    return full;
  }
  // back-compat aliases so every existing caller keeps working
  const claudeChat=aiChat, claudeJSON=aiJSON;
```

---

## EDIT 3 — Stage Q&A streaming (inside `qaAsk` click handler)

Replace the `try{ ... }catch` block inside the Stage Q&A handler with:

```javascript
      try{
        const sys=`You answer questions about a specific stage of the U.S. green card process in clear, plain language. You are not a lawyer and do not give legal advice; recommend an accredited attorney for complex situations. Be accurate, warm, and concise.`;
        const pr=`Pathway: ${qaPathway.value}\nStage: ${qaStage.value}\nQuestion: ${q}\n\nAnswer in 1-3 short paragraphs of plain text (no markdown).`;
        const box=document.createElement('div');
        box.className='dr-summary ai-pop stream-caret'; box.style.lineHeight='1.6';
        qaAnswer.innerHTML=''; qaAnswer.appendChild(box);
        await aiStream(
          [{role:'system',content:sys},{role:'user',content:pr}],
          (tok,full)=>{ box.innerHTML=full.split(/\n+/).filter(Boolean)
            .map(p=>`<p style="margin:0 0 10px">${esc(p)}</p>`).join(''); },
          {temperature:0.4,max_tokens:700}
        );
        box.classList.remove('stream-caret');
      }catch(e){
        qaAnswer.innerHTML='<div class="dr-summary">Could not reach the AI service right now. Check your connection and try again.</div>';
      }finally{ qaAsk.disabled=false; }
```
