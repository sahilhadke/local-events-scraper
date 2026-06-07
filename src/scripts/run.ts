/**
 * Scrape -> write JSON + results.md -> sync calendar -> stdout dump.
 *
 * Recommendation tagging is NOT done here — it's handled by the Claude Code
 * `local-events` skill between scrape and sync (it reads the JSON, tags events
 * against config/personal-recommendations.md, then runs `npm run sync-calendar`).
 * This script syncs untagged events straight away, so use it only when you don't
 * need recommendations; the skill drives `scrape-only` + `sync-calendar` instead.
 *
 *   npm run scrape -- --day today --type in-person --distance 10
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { getPage, detach } from '../browser';
import { applyOverrides, loadConfig, parseCliOverrides } from '../config';
import { scrapersBySource } from '../scrapers';
import { syncEventsToCalendar } from '../calendar';
import { writeEventsJson, writeResults } from '../results';
import { eventMatchesDayFilter } from '../utils/dates';
import { log, warn } from '../utils/logger';
import { ScrapedEvent } from '../types';

async function main(): Promise<void> {
  const overrides = parseCliOverrides(process.argv.slice(2));
  const config = applyOverrides(loadConfig(), overrides);

  log(`Run: day=${config.filters.day} type=${config.filters.type} distance=${config.filters.distanceMiles}mi`);

  const session = await getPage({ newTab: true });
  const { page } = session;

  const all: ScrapedEvent[] = [];
  const seen = new Set<string>();

  try {
    for (const scraper of scrapersBySource(overrides.only)) {
      try {
        const events = await scraper.scrape(page, config.filters, config);
        let added = 0;
        for (const e of events) {
          const key = `${e.source}:${e.sourceId}`;
          if (seen.has(key)) continue;
          if (!eventMatchesDayFilter(e.startISO, config.filters.day)) continue;
          seen.add(key);
          all.push(e);
          added++;
        }
        log(`[${scraper.source}] +${added} events (after day-filter)`);
      } catch (err) {
        warn(`[${scraper.source}] failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await detach(session);
  }

  const jsonPath = writeEventsJson(all);
  const { path: mdPath, content: mdContent } = writeResults(all, config);
  log(`Wrote ${jsonPath}`);
  log(`Wrote ${mdPath}`);

  if (!overrides.skipCalendar) {
    await syncEventsToCalendar(all, config);
  } else {
    log('[calendar] skipped via --skip-calendar');
  }

  // Always dump results.md to stdout so skill invocations (incl. Claude Dispatch) can relay it.
  console.log('\n----- results.md -----');
  console.log(mdContent);
  console.log('----- end results.md -----\n');
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
