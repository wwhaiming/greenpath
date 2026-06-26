# GreenPath — AI Navigator (OpenAI via server proxy)

The site calls a small server-side proxy (`netlify/functions/chat.js`) that holds
your OpenAI key and forwards chat requests. The key **never reaches the browser** —
the page only posts `{model, messages}` to `/api/chat`.

## What's already done
- Polished UI (glass panels, ambient mesh, scroll reveal, 3D tilt, pinch-zoom) is
  the deployed site: `public/index.html`.
- All 6 AI features (Pathway Finder, Stage Q&A, Document Review, Interview sim,
  deadline extraction, AI translate) call `/api/chat` — no key in the HTML.
- Proxy rewritten for OpenAI, model allowlisted to `gpt-4o-mini` / `gpt-4o`.
- `netlify.toml` routes `/api/chat` -> the function.
- Your key goes in `.env` as `OPENAI_API_KEY`. NOTE: `.env` was previously
  committed and tracked; it has now been removed from tracking (`git rm --cached`)
  and its keys MUST be rotated, since it was pushed. `.env` is in `.gitignore`
  going forward.

## Run it locally
    cd ~/Documents/claude/greenpath
    ./start-local.sh
Open http://localhost:8888 — AI features run live through the proxy.

## Deploy it public
    cd ~/Documents/claude/greenpath
    ./node_modules/.bin/netlify login        # opens browser
    ./node_modules/.bin/netlify deploy --prod
Then in the Netlify dashboard: Site settings -> Environment variables ->
add `OPENAI_API_KEY` with your key (the `.env` file is NOT uploaded).

## Notes
- Default model is `gpt-4o-mini`. To use `gpt-4o`, change `AI_MODEL` in
  `public/index.html` (it's already on the server allowlist).
- The claude.ai artifact version CANNOT use this proxy (sandboxed, no same-origin
  `/api/chat`). Use this hosted version for the secure, keyless-in-browser setup.

## Security
- `.env`, `node_modules/`, `.netlify/` are now in `.gitignore`. Never commit your key.
- IMPORTANT: a real `.env` (with a live `OPENAI_API_KEY`) was committed and pushed
  in this repo's history. It has since been removed from tracking
  (`git rm --cached .env`), but the key it contained is compromised and MUST be
  rotated at https://platform.openai.com/api-keys. Put the new key only in `.env`
  (local) and in Netlify env vars.
- Going forward, the key lives only on the server / in Netlify env vars, never in
  the HTML.
- A pre-commit secret scanner is available to catch this in future. Enable it with:
  `git config core.hooksPath .githooks`
