/**
 * Push the latest output/events-YYYY-MM-DD.json into Google Calendar.
 * Useful when you've re-edited the JSON manually or re-run recommend separately.
 *
 *   npm run sync-calendar
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { loadConfig } from '../config';
import { syncEventsToCalendar } from '../calendar';
import { readLatestEventsJson } from '../results';
import { log } from '../utils/logger';

async function main(): Promise<void> {
  const config = loadConfig();
  const events = readLatestEventsJson();
  if (events.length === 0) {
    log('No events in latest output/events-*.json — nothing to sync.');
    return;
  }
  log(`Syncing ${events.length} events to calendar ${config.calendar.calendarId || '(unset)'}`);
  await syncEventsToCalendar(events, config);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
