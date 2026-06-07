/**
 * Delete every event created by local-events-scraper from all three calendars.
 *
 *   npm run clear-calendars
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { loadConfig } from '../config';
import { clearAllCalendars } from '../calendar';
import { log } from '../utils/logger';

async function main(): Promise<void> {
  const config = loadConfig();
  const ids = config.calendar.calendarIds;
  log(`Clearing all local-events-scraper events from:`);
  log(`  recommended = ${ids.recommended || '(unset)'}`);
  log(`  free        = ${ids.free || '(unset)'}`);
  log(`  rest        = ${ids.rest || '(unset)'}`);
  await clearAllCalendars(config);
}

main().catch(err => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
