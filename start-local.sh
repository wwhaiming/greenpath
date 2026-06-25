#!/bin/bash
cd "$(dirname "$0")"
if ./node_modules/.bin/netlify status >/dev/null 2>&1; then
  exec ./node_modules/.bin/netlify dev --port 8888
fi

if [ -x .venv/bin/python ]; then
  exec .venv/bin/python -c "from greenpath_ai import app; app.run(host='0.0.0.0', port=8888, debug=False)"
fi

exec python3 greenpath_ai.py
