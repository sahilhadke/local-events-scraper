/**
 * One-off recon: navigate to eventbrite's SF events page and dump enough of
 * the rendered DOM to figure out card selectors + URL filter conventions.
 * Output lands in output/recon-eventbrite-*.html (gitignored).
 *
 *   npx ts-node src/scripts/recon-eventbrite.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getPage, detach } from '../browser';
import { log } from '../utils/logger';

// Path-based eventbrite SF events URL. We'll inspect what filter chrome / cards exist.
const TARGET = 'https://www.eventbrite.com/d/ca--san-francisco/all-events/';
const OUT_DIR = path.join(process.cwd(), 'output');

async function main(): Promise<void> {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const session = await getPage({ newTab: true });
  const { page } = session;

  log(`Navigating: ${TARGET}`);
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
    log('networkidle timed out — proceeding anyway');
  });
  await page.waitForTimeout(2500);

  const finalUrl = page.url();
  log(`Final URL: ${finalUrl}`);
  log(`Title: ${await page.title()}`);

  const html = await page.content();
  fs.writeFileSync(path.join(OUT_DIR, 'recon-eventbrite-full.html'), html);
  log(`Wrote output/recon-eventbrite-full.html (${html.length} bytes)`);

  // Probe likely card patterns.
  const probes = await page.evaluate(() => {
    const q = (sel: string) => document.querySelectorAll(sel).length;
    return {
      dataTestidEvent: q('[data-testid*="event"]'),
      dataTestidCard: q('[data-testid*="card"]'),
      eventCardClass: q('[class*="event-card"]'),
      articleEvent: q('article[data-testid*="event"]'),
      anchorEventsPath: q('a[href*="/e/"]'),    // eventbrite event URLs are /e/<slug>
      timeEls: q('time'),
      h3: q('h3'),
    };
  });
  log(`Selector probes: ${JSON.stringify(probes, null, 2)}`);

  // For the first /e/ anchor, walk up to find a sensibly-sized card root.
  const ancestry = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/e/"]') as HTMLAnchorElement | null;
    if (!a) return { steps: [], href: null };
    const steps: { level: number; tag: string; cls: string; testid: string; size: number }[] = [];
    let cur: Element | null = a;
    for (let i = 0; i < 8 && cur; i++) {
      steps.push({
        level: i,
        tag: cur.tagName,
        cls: (cur.getAttribute('class') || '').slice(0, 100),
        testid: cur.getAttribute('data-testid') || '',
        size: cur.outerHTML.length,
      });
      cur = cur.parentElement;
    }
    return { steps, href: a.getAttribute('href') };
  });
  log(`First /e/ anchor: ${ancestry.href}`);
  for (const s of ancestry.steps) {
    log(`  L${s.level} <${s.tag}> testid="${s.testid}" class="${s.cls}" size=${s.size}`);
  }

  // Dump first 2 cards by data-testid="search-event"
  const cardSamples = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="search-event"]')).slice(0, 2);
    return cards.map(c => c.outerHTML);
  });
  fs.writeFileSync(
    path.join(OUT_DIR, 'recon-eventbrite-cards.html'),
    cardSamples.map((h, i) => `<!-- CARD ${i + 1} -->\n${h}`).join('\n\n<!-- ============ -->\n\n'),
  );
  log(`Wrote output/recon-eventbrite-cards.html (${cardSamples.length} cards)`);

  // Filter-related UI hints
  const filters = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, a, [role="tab"], select'));
    return els
      .map(b => ({ text: (b.textContent || '').trim().slice(0, 50), tag: b.tagName, testid: b.getAttribute('data-testid') || '', href: b.getAttribute('href') || '' }))
      .filter(b => b.text && /today|tomorrow|week|weekend|online|in.?person|filter|date|distance|mile|free/i.test(b.text))
      .slice(0, 30);
  });
  log(`Filter-ish controls: ${JSON.stringify(filters, null, 2)}`);

  await detach(session);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
