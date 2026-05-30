import { Page } from 'patchright';
import { Config, RunFilters, ScrapedEvent } from '../types';
import { Scraper } from './index';
import { log, warn } from '../utils/logger';

const DEFAULT_MAX_EVENTS = 50;
const MAX_SCROLLS = 30;
const SCROLL_WAIT_MS = 1200;
const CARD_SELECTOR = '.content-card';
const SECTION_SELECTOR = '.timeline-section';

interface RawCard {
  slug: string;
  title: string;
  dateText: string;     // "Today", "Tomorrow", "Sun, May 31", etc. (luma's section header)
  weekday: string;      // "Saturday" — fallback when dateText is ambiguous
  timeText: string;     // "8:00 AM"
  venue: string;
  host: string;
  imageUrl: string;
  priceText: string;
}

// Extract every .content-card currently in the DOM, scoped under its
// .timeline-section so we can attach the section's date label.
async function extractVisible(page: Page): Promise<RawCard[]> {
  return page.evaluate(({ cardSel, sectionSel }) => {
    const out: RawCard[] = [];
    const sections = Array.from(document.querySelectorAll(sectionSel));
    for (const section of sections) {
      const dateText = (section.querySelector('.timeline-title .date')?.textContent ?? '').trim();
      const weekday = (section.querySelector('.timeline-title .weekday')?.textContent ?? '').trim();
      const cards = Array.from(section.querySelectorAll(cardSel));
      for (const card of cards) {
        const a = card.querySelector('a.event-link') as HTMLAnchorElement | null;
        const href = a?.getAttribute('href') ?? '';
        const slug = href.replace(/^\//, '');
        const title = (a?.getAttribute('aria-label') ?? '').trim();
        const timeText = (card.querySelector('.event-time span')?.textContent ?? '').trim();

        // .attr blocks hold host (text starting "By ...") and venue (other text).
        let host = '';
        let venue = '';
        const attrs = Array.from(card.querySelectorAll('.attr'));
        for (const attr of attrs) {
          const text = (attr.querySelector('.text-ellipses')?.textContent ?? '').trim();
          if (/^by\s/i.test(text) && !host) host = text.replace(/^by\s+/i, '');
          else if (text && !venue) venue = text;
        }

        const img = card.querySelector('img') as HTMLImageElement | null;
        const imageUrl = img?.src ?? '';
        const priceText = (card.querySelector('.pill-label')?.textContent ?? '').trim();

        out.push({ slug, title, dateText, weekday, timeText, venue, host, imageUrl, priceText });
      }
    }
    // Workaround for TS lib: RawCard is the JS object literal in browser context;
    // the cast happens implicitly when crossing the boundary.
    return out as unknown as RawCard[];
  }, { cardSel: CARD_SELECTOR, sectionSel: SECTION_SELECTOR });
}

// Map luma's relative section label + 12h time into a local-time ISO string.
// Returns '' if the inputs don't parse — caller should drop such cards.
function parseLumaDateTime(dateText: string, weekday: string, timeText: string, now: Date = new Date()): string {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  if (/^today$/i.test(dateText)) {
    // base is already today
  } else if (/^tomorrow$/i.test(dateText)) {
    base.setDate(base.getDate() + 1);
  } else if (dateText) {
    // Try formats like "Sun, May 31", "May 31", "Mar 5"
    const tryStrings = [
      `${dateText}, ${base.getFullYear()}`,
      `${dateText} ${base.getFullYear()}`,
      dateText,
    ];
    let parsed: Date | null = null;
    for (const s of tryStrings) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) { parsed = d; break; }
    }
    if (parsed) {
      parsed.setHours(0, 0, 0, 0);
      // If the date is in the past, bump to next year (luma shows future events).
      if (parsed.getTime() < base.getTime()) {
        parsed.setFullYear(parsed.getFullYear() + 1);
      }
      base.setTime(parsed.getTime());
    } else if (weekday) {
      // Fallback: jump forward to the next matching weekday.
      const wd = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const target = wd.findIndex(w => w.toLowerCase() === weekday.toLowerCase());
      if (target >= 0) {
        const diff = ((target - base.getDay()) + 7) % 7;
        base.setDate(base.getDate() + (diff === 0 ? 7 : diff));
      } else {
        return '';
      }
    } else {
      return '';
    }
  } else {
    return '';
  }

  const m = timeText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return '';
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const isPM = m[3].toUpperCase() === 'PM';
  if (isPM && hour < 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;
  base.setHours(hour, minute, 0, 0);

  return base.toISOString();
}

async function scrape(page: Page, _filters: RunFilters, config: Config): Promise<ScrapedEvent[]> {
  const url = config.location.lumaUrl;
  log(`[luma] ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForSelector(CARD_SELECTOR, { timeout: 30_000 }).catch(() => {
    warn('[luma] no event cards rendered within 30s');
  });

  const maxEvents = config.scrapers?.luma?.maxEvents ?? DEFAULT_MAX_EVENTS;
  const collected = new Map<string, RawCard>();
  let stalls = 0;

  for (let i = 0; i < MAX_SCROLLS; i++) {
    const batch = await extractVisible(page);
    let added = 0;
    for (const c of batch) {
      if (!c.slug) continue;
      if (collected.has(c.slug)) continue;
      collected.set(c.slug, c);
      added++;
    }
    if (collected.size >= maxEvents) break;
    if (added === 0) {
      stalls++;
      if (stalls >= 3) break;
    } else {
      stalls = 0;
    }
    // Scroll by ~80% of viewport so newly-rendered items don't get past us before extraction.
    await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.8)));
    await page.waitForTimeout(SCROLL_WAIT_MS);
  }

  log(`[luma] collected ${collected.size} unique cards (target ${maxEvents})`);

  const events: ScrapedEvent[] = [];
  for (const c of Array.from(collected.values()).slice(0, maxEvents)) {
    if (!c.title || !c.slug) {
      warn(`[luma] skipping malformed card: ${JSON.stringify(c)}`);
      continue;
    }
    const startISO = parseLumaDateTime(c.dateText, c.weekday, c.timeText);
    if (!startISO) {
      warn(`[luma] could not parse date/time for "${c.title}" (date="${c.dateText}" weekday="${c.weekday}" time="${c.timeText}") — skipping`);
      continue;
    }
    events.push({
      source: 'luma',
      sourceId: c.slug,
      title: c.title,
      url: `https://luma.com/${c.slug}`,
      startISO,
      venue: c.venue || undefined,
      host: c.host || undefined,
      imageUrl: c.imageUrl || undefined,
      priceText: c.priceText || undefined,
      // luma doesn't surface an online/in-person flag on cards; default in-person.
      // Detail-page enrichment can correct this later if needed.
      isOnline: false,
    });
  }

  return events;
}

export const lumaScraper: Scraper = { source: 'luma', scrape };
