/**
 * Fetch events from a SINGLE source and write output/events-<source>.json.
 *
 * Self-contained: auto-launches Brave (debug port + shared profile) if it isn't
 * already running, so this can be driven by the fetch-<source>.bat wrappers as
 * part of a larger pipeline. No recommendation, no calendar sync.
 *
 *   npx ts-node src/scripts/fetch.ts --source meetup [--day today --type in-person --distance 10]
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import minimist from 'minimist';
import { getPage, detach } from '../browser';
import { applyOverrides, loadConfig, parseCliOverrides } from '../config';
import { scrapersBySource } from '../scrapers';
import { eventMatchesDayFilter } from '../utils/dates';
import { log } from '../utils/logger';
import { EventSource, ScrapedEvent } from '../types';

const VALID_SOURCES: EventSource[] = ['meetup', 'luma', 'eventbrite'];
const OUTPUT_DIR = path.join(process.cwd(), 'output');

function parseSource(argv: string[]): EventSource {
  const cleaned = argv[0] === '--' ? argv.slice(1) : argv;
  const source = minimist(cleaned, { string: ['source'] })['source'];
  if (!source || !VALID_SOURCES.includes(source as EventSource)) {
    throw new Error(`--source is required, one of: ${VALID_SOURCES.join(', ')}`);
  }
  return source as EventSource;
}

async function main(): Promise<void> {
  const source = parseSource(process.argv.slice(2));
  const overrides = parseCliOverrides(process.argv.slice(2));
  const config = applyOverrides(loadConfig(), overrides);

  log(`Fetch [${source}]: day=${config.filters.day} type=${config.filters.type} distance=${config.filters.distanceMiles}mi`);

  const [scraper] = scrapersBySource([source]);
  const session = await getPage({ newTab: true });
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  try {
    const raw = await scraper.scrape(session.page, config.filters, config);
    for (const e of raw) {
      const key = `${e.source}:${e.sourceId}`;
      if (seen.has(key)) continue;
      if (!eventMatchesDayFilter(e.startISO, config.filters.day)) continue;
      seen.add(key);
      events.push(e);
    }
  } finally {
    await detach(session);
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, `events-${source}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({ source, generatedAt: new Date().toISOString(), events }, null, 2),
  );
  log(`[${source}] ${events.length} events -> ${outPath}`);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
