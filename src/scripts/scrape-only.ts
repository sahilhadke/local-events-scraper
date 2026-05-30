/**
 * Scrape + write JSON only. No recommendation, no calendar sync.
 *   npm run scrape-only -- --day today
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { getPage, detach } from '../browser';
import { applyOverrides, loadConfig, parseCliOverrides } from '../config';
import { scrapersBySource } from '../scrapers';
import { writeEventsJson, writeResults } from '../results';
import { eventMatchesDayFilter } from '../utils/dates';
import { log, warn } from '../utils/logger';
import { ScrapedEvent } from '../types';

async function main(): Promise<void> {
  const overrides = parseCliOverrides(process.argv.slice(2));
  const config = applyOverrides(loadConfig(), overrides);

  log(`Scrape-only: day=${config.filters.day} type=${config.filters.type} distance=${config.filters.distanceMiles}mi`);

  const session = await getPage({ newTab: true });
  const { page } = session;
  const all: ScrapedEvent[] = [];
  const seen = new Set<string>();

  try {
    for (const scraper of scrapersBySource(overrides.only)) {
      try {
        const events = await scraper.scrape(page, config.filters, config);
        for (const e of events) {
          const key = `${e.source}:${e.sourceId}`;
          if (seen.has(key)) continue;
          if (!eventMatchesDayFilter(e.startISO, config.filters.day)) continue;
          seen.add(key);
          all.push(e);
        }
        log(`[${scraper.source}] ${events.length} raw events`);
      } catch (err) {
        warn(`[${scraper.source}] failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await detach(session);
  }

  log(`Total unique events: ${all.length}`);
  log(`Wrote ${writeEventsJson(all)}`);
  log(`Wrote ${writeResults(all, config).path}`);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
