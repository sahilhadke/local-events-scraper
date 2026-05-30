/**
 * One-off recon: navigate to a representative meetup events URL and dump enough
 * of the rendered DOM to figure out card selectors. Output lands in
 * output/recon-meetup-*.html (gitignored).
 *
 *   npx ts-node src/scripts/recon-meetup.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getPage, detach } from '../browser';
import { log } from '../utils/logger';

const TARGET = 'https://www.meetup.com/find/?eventType=inPerson&source=EVENTS&distance=tenMiles&location=us--ca--San+Francisco&dateRange=tomorrow';
const OUT_DIR = path.join(process.cwd(), 'output');

async function main(): Promise<void> {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const session = await getPage({ newTab: true });
  const { page } = session;

  log(`Navigating: ${TARGET}`);
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });

  // Let the client-side render settle.
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
    log('networkidle timed out — proceeding anyway');
  });
  await page.waitForTimeout(2000);

  const finalUrl = page.url();
  const title = await page.title();
  log(`Final URL: ${finalUrl}`);
  log(`Title: ${title}`);

  // Save full HTML for grep-ability.
  const html = await page.content();
  fs.writeFileSync(path.join(OUT_DIR, 'recon-meetup-full.html'), html);
  log(`Wrote output/recon-meetup-full.html (${html.length} bytes)`);

  // Cards identified by data-testid="categoryResults-eventCard". Dump the
  // first 3 so we can see the title/time/venue/host structure.
  const cardHtmls = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="categoryResults-eventCard"]'));
    return cards.slice(0, 3).map(c => c.outerHTML);
  });

  fs.writeFileSync(
    path.join(OUT_DIR, 'recon-meetup-cards.html'),
    cardHtmls.map((h, i) => `<!-- CARD ${i + 1} -->\n${h}`).join('\n\n<!-- ============ -->\n\n'),
  );
  log(`Wrote output/recon-meetup-cards.html (${cardHtmls.length} cards)`);

  // Also count anchors per common pattern so we can pick a stable selector.
  const counts = await page.evaluate(() => ({
    eventLinks: document.querySelectorAll('a[href*="/events/"]').length,
    dataElementName: document.querySelectorAll('[data-element-name]').length,
    article: document.querySelectorAll('article').length,
    eventCardId: document.querySelectorAll('[id^="event-card"]').length,
    eventListings: document.querySelectorAll('[data-testid*="event"]').length,
  }));
  log(`Selector counts: ${JSON.stringify(counts)}`);

  await detach(session);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
