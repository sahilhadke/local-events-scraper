/**
 * One-off recon: navigate to luma.com/sf and dump enough of the rendered DOM
 * to figure out card selectors + whatever filter UI luma exposes. Output lands
 * in output/recon-luma-*.html (gitignored).
 *
 *   npx ts-node src/scripts/recon-luma.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getPage, detach } from '../browser';
import { log } from '../utils/logger';

const TARGET = 'https://luma.com/sf';
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
  await page.waitForTimeout(3000);

  log(`Final URL: ${page.url()}`);
  log(`Title: ${await page.title()}`);

  const html = await page.content();
  fs.writeFileSync(path.join(OUT_DIR, 'recon-luma-full.html'), html);
  log(`Wrote output/recon-luma-full.html (${html.length} bytes)`);

  // For the first short-slug anchor (must contain a digit — excludes /discover, /pricing),
  // walk up and print sizes at each level so we can pick the card root level manually.
  const ancestry = await page.evaluate(() => {
    const anchor = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
      .find(a => /^\/(?=[a-z0-9-]*\d)[a-z0-9-]{6,}$/i.test(a.getAttribute('href') || ''));
    if (!anchor) return { steps: [], anchorHref: null };
    const steps: { level: number; tag: string; cls: string; size: number; preview: string }[] = [];
    let cur: Element | null = anchor;
    for (let i = 0; i < 8 && cur; i++) {
      const html = cur.outerHTML;
      steps.push({
        level: i,
        tag: cur.tagName,
        cls: (cur.getAttribute('class') || '').slice(0, 80),
        size: html.length,
        preview: html.slice(0, 200),
      });
      cur = cur.parentElement;
    }
    return { steps, anchorHref: anchor.getAttribute('href') };
  });
  log(`Anchor: ${ancestry.anchorHref}`);
  for (const s of ancestry.steps) {
    log(`  L${s.level} <${s.tag}> class="${s.cls}" size=${s.size}`);
  }
  // Also: how many short-slug anchors exist total?
  const slugRe = /^\/(?=[a-z0-9-]*\d)[a-z0-9-]{6,}$/i;
  const slugAnchors = await page.evaluate(re => {
    const r = new RegExp(re);
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
      .map(a => a.getAttribute('href') || '')
      .filter(href => r.test(href));
  }, slugRe.source);
  log(`Event-slug anchors initial (${slugAnchors.length}): ${JSON.stringify(slugAnchors)}`);

  // Dump first 2 .content-card outerHTML snapshots and the parent timeline-section header.
  const cardSamples = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.content-card')).slice(0, 2);
    const out: string[] = [];
    for (const c of cards) {
      const section = c.closest('.timeline-section');
      const headerCandidates = section
        ? Array.from(section.querySelectorAll('h1,h2,h3,h4,.date,[class*="date"]')).slice(0, 3).map(e => e.outerHTML)
        : [];
      out.push(`<!-- section headers -->\n${headerCandidates.join('\n')}\n<!-- card -->\n${c.outerHTML}`);
    }
    return out;
  });
  fs.writeFileSync(
    path.join(OUT_DIR, 'recon-luma-cards.html'),
    cardSamples.join('\n\n<!-- ============ -->\n\n'),
  );
  log(`Wrote output/recon-luma-cards.html (${cardSamples.length} cards)`);

  // Scroll repeatedly to see if more events lazy-load.
  let prev = slugAnchors.length;
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    const now = await page.evaluate(re => {
      const r = new RegExp(re);
      return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
        .map(a => a.getAttribute('href') || '')
        .filter(href => r.test(href)).length;
    }, slugRe.source);
    log(`  scroll ${i + 1}: ${now} anchors (Δ${now - prev})`);
    if (now === prev) break;
    prev = now;
  }

  await detach(session);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
