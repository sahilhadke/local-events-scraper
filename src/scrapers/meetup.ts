import { Page } from 'patchright';
import { Config, DayFilter, DistanceMiles, RunFilters, ScrapedEvent, TypeFilter } from '../types';
import { Scraper } from './index';
import { log, warn } from '../utils/logger';

const DISTANCE_PARAM: Record<DistanceMiles, string> = {
  1: 'oneMile',
  2: 'twoMiles',
  5: 'fiveMiles',
  10: 'tenMiles',
  25: 'twentyFiveMiles',
};

// 'any' and 'starting-soon' are omitted; the orchestrator's eventMatchesDayFilter
// post-filters when needed.
const DATE_RANGE_PARAM: Partial<Record<DayFilter, string>> = {
  today: 'today',
  tomorrow: 'tomorrow',
  'this-week': 'thisWeek',
  'this-weekend': 'thisWeekend',
  'next-week': 'nextWeek',
};

const EVENT_TYPE_PARAM: Partial<Record<TypeFilter, string>> = {
  'in-person': 'inPerson',
  online: 'online',
};

const DEFAULT_MAX_EVENTS = 50;
const MAX_SCROLLS = 15;
const SCROLL_WAIT_MS = 1500;
const CARD_SELECTOR = '[data-testid="categoryResults-eventCard"]';

function buildSearchUrl(filters: RunFilters, config: Config): string {
  // meetupSlug uses literal `+` for spaces; URLSearchParams would percent-encode it.
  const parts: string[] = [
    'source=EVENTS',
    `location=${config.location.meetupSlug}`,
    `distance=${DISTANCE_PARAM[filters.distanceMiles]}`,
  ];
  const ev = EVENT_TYPE_PARAM[filters.type];
  if (ev) parts.push(`eventType=${ev}`);
  const dr = DATE_RANGE_PARAM[filters.day];
  if (dr) parts.push(`dateRange=${dr}`);
  return `https://www.meetup.com/find/?${parts.join('&')}`;
}

interface RawCard {
  sourceId: string;
  url: string;
  title: string;
  startISO: string;
  host: string;
  imageUrl: string;
}

// Scroll the find page until we have at least `target` cards or the count stalls
// across two consecutive scrolls. Returns the final card count.
async function scrollUntilEnough(page: Page, target: number): Promise<number> {
  const countCards = () => page.evaluate(s => document.querySelectorAll(s).length, CARD_SELECTOR);
  let last = await countCards();
  let stalls = 0;
  for (let i = 0; i < MAX_SCROLLS; i++) {
    if (last >= target) return last;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_WAIT_MS);
    const now = await countCards();
    if (now === last) {
      stalls++;
      if (stalls >= 2) return now;
    } else {
      stalls = 0;
      last = now;
    }
  }
  return last;
}

async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(sel => {
    const cards = Array.from(document.querySelectorAll(sel));
    return cards.map(card => {
      const sourceId = card.getAttribute('data-eventref') ?? '';
      const a = card.querySelector('a[href*="/events/"]') as HTMLAnchorElement | null;
      const url = (a?.href ?? '').split('?')[0];
      const h3 = card.querySelector('h3');
      const title = (h3?.getAttribute('title') ?? h3?.textContent ?? '').trim();
      const timeEl = card.querySelector('time');
      const datetimeRaw = timeEl?.getAttribute('datetime') ?? '';
      const startISO = datetimeRaw.replace(/\[[^\]]+\]$/, ''); // strip "[America/Los_Angeles]"
      // host: any leaf div whose text begins with "by "
      const hostDiv = Array.from(card.querySelectorAll('div'))
        .find(d => d.childElementCount === 0 && /^by\s/i.test((d.textContent ?? '').trim()));
      const host = (hostDiv?.textContent ?? '').trim().replace(/^by\s+/i, '');
      const img = card.querySelector('img') as HTMLImageElement | null;
      const imageUrl = img?.src ?? '';
      return { sourceId, url, title, startISO, host, imageUrl };
    });
  }, CARD_SELECTOR);
}

async function scrape(page: Page, filters: RunFilters, config: Config): Promise<ScrapedEvent[]> {
  const url = buildSearchUrl(filters, config);
  log(`[meetup] ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Wait for cards to render, but don't blow up if zero events for this filter.
  await page.waitForSelector(CARD_SELECTOR, { timeout: 30_000 }).catch(() => {
    warn('[meetup] no event cards rendered within 30s');
  });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  const maxEvents = config.scrapers?.meetup?.maxEvents ?? DEFAULT_MAX_EVENTS;
  const finalCount = await scrollUntilEnough(page, maxEvents);
  log(`[meetup] ${finalCount} cards loaded after scroll (target ${maxEvents})`);

  const raw = (await extractCards(page)).slice(0, maxEvents);
  log(`[meetup] extracted ${raw.length} raw cards`);

  // isOnline is implied by the URL filter; if 'any', default to false (most meetup events are in-person).
  const isOnline = filters.type === 'online';

  const events: ScrapedEvent[] = [];
  for (const r of raw) {
    if (!r.sourceId || !r.startISO || !r.title || !r.url) {
      warn(`[meetup] skipping malformed card: ${JSON.stringify(r)}`);
      continue;
    }
    events.push({
      source: 'meetup',
      sourceId: r.sourceId,
      title: r.title,
      url: r.url,
      startISO: r.startISO,
      host: r.host || undefined,
      imageUrl: r.imageUrl || undefined,
      isOnline,
    });
  }

  return events;
}

export const meetupScraper: Scraper = { source: 'meetup', scrape };
