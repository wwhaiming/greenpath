// GreenPath browser E2E — runs against a locally booted server (see
// playwright.config.js, which starts server.py via the `webServer` block).
//
// Every assertion targets a DETERMINISTIC, server-side surface, so the suite
// needs no OPENAI_API_KEY and spends no model tokens:
//   1. A high-risk message triggers the attorney-handoff modal and renders NO
//      AI answer (the server's detect_handoff() short-circuits before any LLM
//      call, returning {handoff:true} which the page surfaces as a modal).
//   2. Benign SPA navigation switches sections and shows the target view.
//   3. A cross-origin POST to /api/chat is rejected with 403 by the same-origin
//      guard in server.py (_same_origin_ok / _guard_llm_routes).
//   4. /api/health reports the ai_configured flag.
import { test, expect } from '@playwright/test';

// One verbatim high-risk input from the labeled handoff set (evals/cases.json):
// removal proceedings -> the server must refuse and hand off to an attorney.
const HIGH_RISK_INPUT =
  'I have a removal proceeding and a notice to appear in immigration court.';

test.describe('GreenPath safety + navigation E2E', () => {
  test('high-risk input shows the attorney-handoff modal and renders no AI answer', async ({ page }) => {
    await page.goto('/');

    // The primary nav is a hamburger menu at every viewport — open it first.
    await page.locator('#menuBtn').click();
    // Navigate to the Stage Q&A feature (routes through /api/chat).
    await page.locator('nav.main a[data-go="qa"]').click();
    const qa = page.locator('#qa');
    await expect(qa).toBeVisible();

    // Submit the high-risk question.
    await page.locator('#qaInput').fill(HIGH_RISK_INPUT);
    await page.locator('#qaAsk').click();

    // The attorney-handoff modal must appear, accessible and on-message.
    const modal = page.locator('#handoff-overlay');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#handoff-title')).toContainText(
      /licensed immigration attorney/i,
    );

    // No AI answer may be rendered: on the handoff path the streamed-answer node
    // (.dr-summary) is never populated — the flow aborts and shows a non-answer
    // error notice instead. Assert there is no rendered answer body.
    await expect(page.locator('#qaAnswer .dr-summary')).toHaveCount(0);
  });

  test('benign navigation works (SPA section switch)', async ({ page }) => {
    await page.goto('/');
    // Home shows by default.
    await expect(page.locator('#home')).toBeVisible();

    // Navigating to a deterministic, non-AI section must reveal it.
    // Activate the nav link by keyboard (focus + Enter): the open dropdown is an
    // absolutely-positioned panel whose lower links can sit below the fold, so a
    // viewport-dependent mouse click is flaky — keyboard activation is not.
    await page.locator('#menuBtn').click();   // open the hamburger nav
    const legalLink = page.locator('nav.main a[data-go="legal"]');
    await legalLink.focus();
    await page.keyboard.press('Enter');
    const legal = page.locator('#legal');
    await expect(legal).toBeVisible();
    await expect(legal.locator('h1, h2').first()).toBeVisible();
    // The previous view is hidden (only one section is shown at a time).
    await expect(page.locator('#home')).toBeHidden();
  });

  test('cross-origin POST to /api/chat is 403', async ({ request, baseURL }) => {
    const res = await request.post('/api/chat', {
      headers: {
        'Content-Type': 'application/json',
        // A different site's Origin — the same-origin guard must reject it.
        Origin: 'http://evil.example.com',
        Referer: 'http://evil.example.com/',
      },
      data: { messages: [{ role: 'user', content: 'hello' }] },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(String(body.error || '')).toMatch(/cross-origin/i);
    // Sanity: baseURL is the local server, not the spoofed Origin.
    expect(baseURL).toContain('127.0.0.1');
  });

  test('/api/health returns ai_configured', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('ai_configured');
    expect(typeof body.ai_configured).toBe('boolean');
    expect(body.ok).toBe(true);
  });
});
