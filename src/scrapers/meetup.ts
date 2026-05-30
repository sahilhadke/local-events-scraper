import { Page } from 'patchright';
import { Config, RunFilters, ScrapedEvent } from '../types';
import { Scraper } from './index';
import { log } from '../utils/logger';

// Stub. To implement:
//   1. page.goto('https://www.meetup.com/find/?...')
//   2. Type config.location.searchString into the location input.
//   3. Apply native distance dropdown using filters.distanceMiles.
//   4. Apply native day filter using filters.day.
//   5. If filters.type === 'online', toggle the online-events option.
//   6. Iterate event cards, extract title/url/start/venue/host, return ScrapedEvent[].
async function scrape(page: Page, filters: RunFilters, _config: Config): Promise<ScrapedEvent[]> {
  log(`[meetup] stub — filters: day=${filters.day} type=${filters.type} dist=${filters.distanceMiles}`);
  return [];
}

export const meetupScraper: Scraper = { source: 'meetup', scrape };
