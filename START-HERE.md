# GreenPath — AI Navigator (OpenAI via server proxy)

The site calls a small server-side proxy (`netlify/functions/chat.js`) that holds
your OpenAI key and forwards chat requests. The key **never reaches the browser** —
the page only posts `{model, messages}` to `/api/chat`.

## What's already done
- Polished UI (glass panels, ambient mesh, scroll reveal, 3D tilt, pinch-zoom) is
  the site root: `index.html` (previous version saved as `index-prev.html`).
- All 6 AI features (Pathway Finder, Stage Q&A, Document Review, Interview sim,
  deadline extraction, AI translate) call `/api/chat` — no key in the HTML.
- Proxy rewritten for OpenAI, model allowlisted to `gpt-4o-mini` / `gpt-4o`.
- `netlify.toml` routes `/api/chat` -> the function.
- Your key is already in `.env` as `OPENAI_API_KEY` (`.env` is gitignored).

## Run it locally
    cd ~/claude/greenpath
    ./start-local.sh
Open http://localhost:8888 — AI features run live through the proxy.

## Deploy it public
    cd ~/claude/greenpath
    ./node_modules/.bin/netlify login        # opens browser
    ./node_modules/.bin/netlify deploy --prod
Then in the Netlify dashboard: Site settings -> Environment variables ->
add `OPENAI_API_KEY` with your key (the `.env` file is NOT uploaded).

## Notes
- Default model is `gpt-4o-mini`. To use `gpt-4o`, change `AI_MODEL` in `index.html`
  (it's already on the server allowlist).
- The claude.ai artifact version CANNOT use this proxy (sandboxed, no same-origin
  `/api/chat`). Use this hosted version for the secure, keyless-in-browser setup.

## Security
- `.env`, `node_modules/`, `.netlify/` are gitignored. Never commit your key.
- The key lives only on the server / in Netlify env vars, never in the HTML.
- If the old client-side key was ever pushed to a public artifact, rotate it at
  https://platform.openai.com/api-keys and put the new one in `.env` + Netlify env.
