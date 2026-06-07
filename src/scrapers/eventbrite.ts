import { Page } from 'patchright';
import { Config, DayFilter, RunFilters, ScrapedEvent } from '../types';
import { Scraper } from './index';
import { log, warn } from '../utils/logger';

const DEFAULT_MAX_EVENTS = 50;
const MAX_PAGES = 5;
const CARD_SELECTOR = '[data-testid="search-event"]';

// 'any' and 'starting-soon' use the /all-events/ path; the orchestrator's
// eventMatchesDayFilter narrows further.
const DAY_PATH: Partial<Record<DayFilter, string>> = {
  today: 'events--today',
  tomorrow: 'events--tomorrow',
  'this-week': 'events--this-week',
  'this-weekend': 'events--this-weekend',
  'next-week': 'events--next-week',
};

interface RawCard {
  sourceId: string;
  url: string;
  title: string;
  dateTimeText: string;   // "Thursday • 5:00 PM" or "Sun, Jun 21 • 8:00 AM"
  venue: string;
  imageUrl: string;
  isOnline: boolean;
  category: string;
}

// Derive eventbrite's /d/<slug>/ city slug from the human search string.
// "San Francisco, CA" -> "ca--san-francisco" (state first, then city, spaces
// to dashes, lowercase). An explicit config.location.eventbriteSlug wins.
function deriveCitySlug(config: Config): string {
  if (config.location.eventbriteSlug) return config.location.eventbriteSlug;
  const raw = config.location.searchString;
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
  if (parts.length >= 2) {
    const [city, region] = parts;
    return `${slugify(region)}--${slugify(city)}`;
  }
  return slugify(parts[0] ?? raw);
}

function buildPageUrl(citySlug: string, filters: RunFilters, page: number): string {
  const dayPart = DAY_PATH[filters.day] ?? 'all-events';
  const base = filters.type === 'online'
    ? `https://www.eventbrite.com/d/online/${dayPart}/`   // dedicated online listing
    : `https://www.eventbrite.com/d/${citySlug}/${dayPart}/`;
  return page > 1 ? `${base}?page=${page}` : base;
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(sel => {
    const cards = Array.from(document.querySelectorAll(sel));
    const out: RawCard[] = [];
    const seen = new Set<string>();
    for (const card of cards) {
      // Each search-event has BOTH mobile and desktop layouts with identical
      // data — pick the first event-card-link to avoid duplicates.
      const link = card.querySelector('a.event-card-link') as HTMLAnchorElement | null;
      if (!link) continue;
      const sourceId = link.getAttribute('data-event-id') ?? '';
      if (!sourceId || seen.has(sourceId)) continue;
      seen.add(sourceId);

      const rawUrl = link.getAttribute('href') ?? '';
      const url = rawUrl.split('?')[0];
      const title = (card.querySelector('h3')?.textContent ?? '').trim();

      // The details section holds <p> rows in order [statusBadge?, dateTime, venue].
      // Status badges ("Sales end soon", "Almost full", "Going fast", "Just added")
      // live in an .EventCardUrgencySignal aside — exclude those, then row 0 is the
      // date/time and row 1 the location ("San Francisco · Venue Name").
      const ps = Array.from(card.querySelectorAll('section.event-card-details p'))
        .filter(p => !p.closest('.EventCardUrgencySignal'))
        .map(p => (p.textContent ?? '').trim())
        .filter(Boolean);
      const dateTimeText = ps[0] ?? '';
      const locationText = ps[1] ?? '';
      // "City · Venue" -> keep the venue portion; fall back to the whole string.
      const venue = locationText.includes('·')
        ? locationText.split('·').slice(1).join('·').trim()
        : locationText;

      const img = card.querySelector('img.event-card-image') as HTMLImageElement | null;
      const imageUrl = img?.src ?? '';

      const loc = link.getAttribute('data-event-location') ?? '';
      const isOnline = /^online$/i.test(loc);
      const category = link.getAttribute('data-event-category') ?? '';

      out.push({ sourceId, url, title, dateTimeText, venue, imageUrl, isOnline, category });
    }
    return out as unknown as RawCard[];
  }, CARD_SELECTOR);
}

// Convert eventbrite's card date/time text into a local-time ISO. Handles the
// current formats:
//   "Today at 11:00 AM" / "Tomorrow at 5:00 PM"
//   "Friday at 8:00 PM"            (bare weekday)
//   "Sun, Jun 21, 8:00 AM"        (abbrev weekday + month/day)
//   "Sun, Jun 21, 2027, 8:00 AM"  (explicit year)
// Returns '' if the input doesn't parse — caller should drop the card.
function parseEventbriteDateTime(text: string, now: Date = new Date()): string {
  // Time is always the trailing "H:MM AM/PM"; everything before it is the date.
  const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
  if (!timeMatch) return '';
  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const isPM = timeMatch[3].toUpperCase() === 'PM';
  if (isPM && hour < 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;

  // Strip the time (and any trailing " at"/"," separator) to isolate the date.
  let datePart = text.slice(0, timeMatch.index).trim().replace(/(\bat\b|,)\s*$/i, '').trim();

  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (/^today$/i.test(datePart)) {
    // base is already today
  } else if (/^tomorrow$/i.test(datePart)) {
    base.setDate(base.getDate() + 1);
  } else if (weekdays.some(w => w.toLowerCase() === datePart.toLowerCase())) {
    // bare weekday → next occurrence (today if same day, else upcoming)
    const weekdayIdx = weekdays.findIndex(w => w.toLowerCase() === datePart.toLowerCase());
    const diff = ((weekdayIdx - base.getDay()) + 7) % 7;
    base.setDate(base.getDate() + diff);
  } else {
    // "Sun, Jun 21" or "Sun, Jun 21, 2027" — drop a leading abbreviated weekday
    // ("Sun, ") so Date can parse the month/day (and optional year).
    const cleaned = datePart.replace(/^[A-Za-z]{3,},\s*/, '');
    const hasYear = /\b\d{4}\b/.test(cleaned);
    const candidates = hasYear
      ? [cleaned]
      : [`${cleaned}, ${base.getFullYear()}`, `${cleaned} ${base.getFullYear()}`, cleaned];
    let parsed: Date | null = null;
    for (const c of candidates) {
      const d = new Date(c);
      if (!isNaN(d.getTime())) { parsed = d; break; }
    }
    if (!parsed) return '';
    parsed.setHours(0, 0, 0, 0);
    // No explicit year and the date already passed → it's next year.
    if (!hasYear && parsed.getTime() < base.getTime()) parsed.setFullYear(parsed.getFullYear() + 1);
    base.setTime(parsed.getTime());
  }

  base.setHours(hour, minute, 0, 0);
  return base.toISOString();
}

async function scrape(page: Page, filters: RunFilters, config: Config): Promise<ScrapedEvent[]> {
  const slug = deriveCitySlug(config);
  const maxEvents = config.scrapers?.eventbrite?.maxEvents ?? DEFAULT_MAX_EVENTS;

  // Walk the top MAX_PAGES result pages via ?page=N, collecting cards until we
  // hit maxEvents or a page renders no new cards (past the last page).
  const collected = new Map<string, RawCard>();

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    if (collected.size >= maxEvents) break;
    const url = buildPageUrl(slug, filters, pageNum);
    log(`[eventbrite] page ${pageNum}: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(CARD_SELECTOR, { timeout: 30_000 }).catch(() => {
      warn(`[eventbrite] no event cards rendered on page ${pageNum} within 30s`);
    });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const batch = await extractCards(page);
    let added = 0;
    for (const c of batch) {
      if (!c.sourceId || collected.has(c.sourceId)) continue;
      collected.set(c.sourceId, c);
      added++;
    }
    log(`[eventbrite] page ${pageNum}: +${added} new cards (total ${collected.size})`);
    if (added === 0) break; // no new results -> past the last page
  }

  const raw = Array.from(collected.values()).slice(0, maxEvents);
  log(`[eventbrite] extracted ${raw.length} raw cards across pages`);

  const events: ScrapedEvent[] = [];
  for (const r of raw) {
    if (!r.title || !r.sourceId || !r.url) {
      warn(`[eventbrite] skipping malformed card: ${JSON.stringify(r)}`);
      continue;
    }
    const startISO = parseEventbriteDateTime(r.dateTimeText);
    if (!startISO) {
      warn(`[eventbrite] could not parse "${r.dateTimeText}" for "${r.title}" — skipping`);
      continue;
    }
    events.push({
      source: 'eventbrite',
      sourceId: r.sourceId,
      title: r.title,
      url: r.url,
      startISO,
      venue: r.venue || undefined,
      imageUrl: r.imageUrl || undefined,
      isOnline: r.isOnline,
      description: r.category ? `Category: ${r.category}` : undefined,
    });
  }

  return events;
}

export const eventbriteScraper: Scraper = { source: 'eventbrite', scrape };
