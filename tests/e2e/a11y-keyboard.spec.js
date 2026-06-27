// GreenPath keyboard + accessibility E2E (tests/e2e/a11y-keyboard.spec.js)
//
// HOW TO RUN
//   1. Install browsers once:  npx playwright install --with-deps chromium
//   2. Run the whole browser suite:  npm run e2e
//      (playwright.config.js boots server.py via its `webServer` block, so no
//       manual server start is needed; reuseExistingServer is on locally.)
//   To run only this file:  npx playwright test tests/e2e/a11y-keyboard.spec.js
//
// These specs are DELIBERATELY NOT wired into the required CI job (GitHub
// runners ship no browser binaries). They are excluded from pytest too
// (`pytest tests/ --ignore=tests/e2e`).
//
// Every assertion targets a DETERMINISTIC, no-token surface:
//   - SPA navigation, hash routing, keyboard activation, field validation are
//     all pure client-side and never call an LLM.
//   - The attorney-handoff modal is reached via the server's detect_handoff()
//     short-circuit, which returns {handoff:true} WITHOUT any model call, so the
//     suite spends no tokens and needs no OPENAI_API_KEY (same as greenpath.spec.js).
//
// Resilience: if the dev server or browser is unavailable, each test SKIPS
// gracefully instead of failing (see gotoOrSkip()).
import { test, expect } from '@playwright/test';

// One verbatim high-risk input from the labeled handoff set (evals/cases.json):
// removal proceedings -> the server must refuse and hand off to an attorney.
const HIGH_RISK_INPUT =
  'I have a removal proceeding and a notice to appear in immigration court.';

// Navigate to a path, or skip the test if the server/page cannot be reached.
async function gotoOrSkip(page, path = '/') {
  try {
    const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });
    if (!resp || !resp.ok()) {
      test.skip(true, `dev server unavailable (status ${resp ? resp.status() : 'none'})`);
    }
  } catch (e) {
    test.skip(true, `dev server unavailable: ${e && e.message}`);
  }
}

test.describe('GreenPath keyboard + accessibility', () => {
  // (a) The "Find Authorized Legal Help" button opens the LEGAL section — NOT
  //     the interview section. (Regression guard: data-go must be "legal".)
  test('Legal Help button opens the LEGAL section (not interview)', async ({ page }) => {
    await gotoOrSkip(page, '/');

    // The button lives in the Evidence Review section; route there first.
    await page.goto('/#review');
    const review = page.locator('#review');
    await expect(review).toBeVisible();

    const legalBtn = page.getByRole('button', { name: /Find Authorized Legal Help/i }).first();
    await expect(legalBtn).toBeVisible();
    await legalBtn.click();

    // The LEGAL section is now shown and the hash reflects it.
    await expect(page.locator('#legal')).toBeVisible();
    await expect(page).toHaveURL(/#legal$/);
    // And it is the legal section, not interview.
    await expect(page.locator('#interview')).toBeHidden();
  });

  // (b) The home step-rail (.node) controls are REAL <button>s, operable by both
  //     Enter and Space, and each updates location.hash. Primary nav links are
  //     also keyboard-operable (Enter) and update the hash.
  test('.node controls are real buttons operable by Enter and Space and update the hash', async ({ page }) => {
    await gotoOrSkip(page, '/');
    await expect(page.locator('#home')).toBeVisible();

    // It is an actual <button> element (not a div with a click handler).
    const interviewNode = page.getByRole('button', { name: 'Open Interview Prep' });
    await expect(interviewNode).toBeVisible();
    expect(await interviewNode.evaluate((el) => el.tagName)).toBe('BUTTON');

    // Enter activates it and routes via the real hash.
    await interviewNode.focus();
    await expect(interviewNode).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#interview$/);
    await expect(page.locator('#interview')).toBeVisible();

    // Go back home, then verify Space activates a node too.
    await page.goto('/#home');
    await expect(page.locator('#home')).toBeVisible();
    const alertsNode = page.getByRole('button', { name: 'Open Deadline Alerts' });
    await alertsNode.focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/#alerts$/);
    await expect(page.locator('#alerts')).toBeVisible();
  });

  test('primary nav link is keyboard-operable (Enter) and updates the hash', async ({ page }) => {
    await gotoOrSkip(page, '/');
    // Open the hamburger nav so its links are visible/focusable.
    await page.locator('#menuBtn').click();
    const navLink = page.getByRole('link', { name: 'Legal notice & find help' });
    await expect(navLink).toBeVisible();
    await navLink.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#legal$/);
    await expect(page.locator('#legal')).toBeVisible();
  });

  // (c) prefers-reduced-motion: reduce collapses the scroll-scrubbed story to a
  //     plain static stack (no 340vh track, stage no longer sticky).
  test('reduced-motion collapses the scrolly track to static (no 340vh)', async ({ page }) => {
    await gotoOrSkip(page, '/');

    // Baseline: NORMAL motion. The kept scrolly track is ~340vh on desktop.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/#pathway');
    const track = page.locator('#pathway .scrolly .scrolly-track').first();
    const stage = page.locator('#pathway .scrolly .scrolly-stage').first();
    await expect(track).toBeAttached();

    const vh = await page.evaluate(() => window.innerHeight);
    const normalH = await track.evaluate((el) => el.getBoundingClientRect().height);
    const normalPos = await stage.evaluate((el) => getComputedStyle(el).position);
    // 340vh (or 280vh on small viewports) is clearly taller than the viewport.
    expect(normalH).toBeGreaterThan(vh * 2);
    expect(normalPos).toBe('sticky');

    // REDUCED motion: track height becomes auto (collapsed) and the stage is static.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#pathway');
    const reducedH = await track.evaluate((el) => el.getBoundingClientRect().height);
    const reducedPos = await stage.evaluate((el) => getComputedStyle(el).position);
    expect(reducedPos).toBe('static');
    expect(reducedH).toBeLessThan(vh * 2);
    expect(reducedH).toBeLessThan(normalH);
  });

  // (d) Submitting an empty field shows a role="alert" message and sets
  //     aria-invalid on the input. Pure client-side validation, no model call.
  test('empty submit shows role="alert" and aria-invalid on the field', async ({ page }) => {
    await gotoOrSkip(page, '/');
    await page.goto('/#qa');
    await expect(page.locator('#qa')).toBeVisible();

    const input = page.locator('#qaInput');
    // The field ships with a sample question; clear it to test the empty case.
    await input.fill('');
    await expect(input).toHaveValue('');
    // Error alert starts hidden.
    const alert = page.locator('#qaError');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toBeHidden();

    // Submit empty -> validation fires before any network/LLM call.
    await page.locator('#qaAsk').click();

    await expect(alert).toBeVisible();
    await expect(alert).not.toBeEmpty();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    // No AI answer was rendered (validation short-circuited).
    await expect(page.locator('#qaAnswer .dr-summary')).toHaveCount(0);
  });

  // (e) The attorney-handoff modal is reachable (via the server's no-token
  //     safety stop) and focus-trapped: Tab from the last focusable wraps to the
  //     first, focus stays inside the dialog, and Escape closes it.
  test('attorney-handoff modal is reachable and focus-trapped', async ({ page }) => {
    await gotoOrSkip(page, '/');
    await page.goto('/#qa');
    await expect(page.locator('#qa')).toBeVisible();

    await page.locator('#qaInput').fill(HIGH_RISK_INPUT);
    await page.locator('#qaAsk').click();

    const modal = page.locator('#handoff-overlay');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    // Focus the LAST focusable control inside the dialog, then Tab: the trap must
    // wrap focus back into the dialog (not escape to the page behind it).
    const focusables = modal.locator(
      'a[href], button, select, input, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const count = await focusables.count();
    expect(count).toBeGreaterThan(0);
    await focusables.nth(count - 1).focus();
    await page.keyboard.press('Tab');
    const focusInsideModal = await page.evaluate(() => {
      const ov = document.getElementById('handoff-overlay');
      return !!(ov && document.activeElement && ov.contains(document.activeElement));
    });
    expect(focusInsideModal).toBe(true);

    // Escape closes the dialog.
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });
});
