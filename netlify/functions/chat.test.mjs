// Offline unit tests for the AI proxy handler (no network; all assert early-return paths).
// Run: node netlify/functions/chat.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const assert = require('node:assert');
const { handler } = require('./chat.js');

const HOST = 'site.example';
const okHeaders = { host: HOST, origin: `https://${HOST}` };
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  PASS', name); } catch (e) { fail++; console.log('  FAIL', name, '->', e.message); } }

console.log('== chat.js handler (offline) ==');

await t('OPTIONS preflight -> 204', async () => {
  const r = await handler({ httpMethod: 'OPTIONS', headers: okHeaders });
  assert.equal(r.statusCode, 204);
});
await t('GET -> 405', async () => {
  const r = await handler({ httpMethod: 'GET', headers: okHeaders });
  assert.equal(r.statusCode, 405);
});
await t('disallowed origin -> 403', async () => {
  const r = await handler({ httpMethod: 'POST', headers: { host: HOST, origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r.statusCode, 403);
});
await t('oversized body -> 413', async () => {
  const r = await handler({ httpMethod: 'POST', headers: okHeaders, body: 'x'.repeat(24001) });
  assert.equal(r.statusCode, 413);
});
await t('missing API key -> 500', async () => {
  const saved = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  const r = await handler({ httpMethod: 'POST', headers: okHeaders, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) });
  if (saved) process.env.OPENAI_API_KEY = saved;
  assert.equal(r.statusCode, 500);
});
await t('unknown response schema -> 400', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const r = await handler({ httpMethod: 'POST', headers: okHeaders, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], response_format: { type: 'json_schema', json_schema: { name: 'evil', schema: {} } } }) });
  delete process.env.OPENAI_API_KEY;
  assert.equal(r.statusCode, 400);
});
await t('invalid JSON body -> 400', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const r = await handler({ httpMethod: 'POST', headers: okHeaders, body: '{not json' });
  delete process.env.OPENAI_API_KEY;
  assert.equal(r.statusCode, 400);
});

console.log(`\nchat.js: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
