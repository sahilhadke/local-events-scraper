/**
 * Diagnostic: navigate to eventbrite.com, type into the location-autocomplete
 * input, and dump everything that looks like an autocomplete listbox so we can
 * pick the right selector.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getPage, detach } from '../browser';
import { log } from '../utils/logger';

const OUT_DIR = path.join(process.cwd(), 'output');

async function main(): Promise<void> {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const session = await getPage({ newTab: true });
  const { page } = session;

  log('Navigating to https://www.eventbrite.com/');
  await page.goto('https://www.eventbrite.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1000);

  log(`URL after load: ${page.url()}`);
  log(`Title: ${await page.title()}`);

  const inputExists = await page.locator('input#location-autocomplete').count();
  log(`#location-autocomplete count: ${inputExists}`);
  if (inputExists === 0) {
    fs.writeFileSync(path.join(OUT_DIR, 'recon-eb-input-page.html'), await page.content());
    log('No location input — wrote page HTML for inspection');
    await detach(session);
    return;
  }

  await page.locator('input#location-autocomplete').click();
  await page.waitForTimeout(500);
  await page.locator('input#location-autocomplete').type('San Francisco', { delay: 80 });
  await page.waitForTimeout(2500); // give autocomplete time

  // Dump everything that smells like a listbox/option.
  const dump = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[role="listbox"], [role="option"], [id*="autocomplete"], [id*="listbox"], [class*="autocomplete"], [class*="listbox"]'));
    return candidates.map(el => ({
      tag: el.tagName,
      id: el.id || '',
      cls: (el.getAttribute('class') || '').slice(0, 100),
      role: el.getAttribute('role') || '',
      visible: !!(el.getClientRects().length && (el as HTMLElement).offsetHeight > 0),
      textPreview: (el.textContent || '').trim().slice(0, 100),
    }));
  });
  log(`Listbox/autocomplete candidates (${dump.length}):`);
  for (const d of dump) {
    log(`  <${d.tag}#${d.id} role="${d.role}" visible=${d.visible}> class="${d.cls}" text="${d.textPreview}"`);
  }

  // Also dump the actual location-autocomplete input's aria-expanded state.
  const ariaExpanded = await page.locator('input#location-autocomplete').getAttribute('aria-expanded');
  log(`#location-autocomplete aria-expanded: ${ariaExpanded}`);

  // Save full HTML post-type
  fs.writeFileSync(path.join(OUT_DIR, 'recon-eb-input-after-type.html'), await page.content());
  log('Wrote output/recon-eb-input-after-type.html');

  await detach(session);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
