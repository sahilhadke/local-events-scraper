import { Page } from 'patchright';
import { Config, RunFilters, ScrapedEvent } from '../types';
import { Scraper } from './index';
import { log } from '../utils/logger';

// Stub. To implement:
//   1. page.goto('https://www.eventbrite.com/d/...') or use the search bar.
//   2. Type config.location.searchString into the location input.
//   3. Apply distance via the radius dropdown using filters.distanceMiles.
//   4. Apply filters.day via the date filter UI.
//   5. If filters.type === 'online', toggle the online-events checkbox.
//   6. Iterate result cards, extract title/url/start/venue/priceText, return ScrapedEvent[].
async function scrape(page: Page, filters: RunFilters, _config: Config): Promise<ScrapedEvent[]> {
  log(`[eventbrite] stub — filters: day=${filters.day} type=${filters.type} dist=${filters.distanceMiles}`);
  return [];
}

export const eventbriteScraper: Scraper = { source: 'eventbrite', scrape };
