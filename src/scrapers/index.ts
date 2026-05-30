import { Page } from 'patchright';
import { Config, EventSource, RunFilters, ScrapedEvent } from '../types';
import { meetupScraper } from './meetup';
import { lumaScraper } from './luma';
import { eventbriteScraper } from './eventbrite';

export interface Scraper {
  source: EventSource;
  scrape(page: Page, filters: RunFilters, config: Config): Promise<ScrapedEvent[]>;
}

export const scrapers: Scraper[] = [meetupScraper, lumaScraper, eventbriteScraper];

export function scrapersBySource(only?: EventSource[]): Scraper[] {
  if (!only || only.length === 0) return scrapers;
  return scrapers.filter(s => only.includes(s.source));
}
