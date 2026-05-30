import { Page } from 'patchright';
import { Config, RunFilters, ScrapedEvent } from '../types';
import { Scraper } from './index';
import { log } from '../utils/logger';

// Stub. To implement:
//   1. page.goto(config.location.lumaUrl) — e.g. https://luma.com/sf
//   2. Luma has no native distance radius — distanceMiles is ignored here.
//   3. Apply filters.day by clicking the date filter tabs / quick chips.
//   4. If filters.type === 'online', toggle the format filter.
//   5. Iterate event cards (infinite scroll — scroll until no more, or cap N).
//   6. Extract title/url/start/venue/host, return ScrapedEvent[].
async function scrape(page: Page, filters: RunFilters, config: Config): Promise<ScrapedEvent[]> {
  log(`[luma] stub — url=${config.location.lumaUrl} day=${filters.day} type=${filters.type}`);
  return [];
}

export const lumaScraper: Scraper = { source: 'luma', scrape };
