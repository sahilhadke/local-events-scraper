import { google, calendar_v3 } from 'googleapis';
import { Config, ScrapedEvent } from './types';
import { log, warn } from './utils/logger';

function getCalendarClient(): calendar_v3.Calendar {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env. ' +
      'Run `npm run auth-calendar` first.'
    );
  }

  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'http://localhost:3000');
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oauth2 });
}

function buildCalendarEvent(e: ScrapedEvent, config: Config): calendar_v3.Schema$Event {
  const colorId = e.recommended ? config.calendar.colorRecommended : config.calendar.colorOther;
  const end = e.endISO ?? new Date(new Date(e.startISO).getTime() + 90 * 60 * 1000).toISOString();

  const descLines: string[] = [];
  if (e.recommendedReason) descLines.push(`Why recommended: ${e.recommendedReason}`);
  if (e.host) descLines.push(`Host: ${e.host}`);
  if (e.priceText) descLines.push(`Price: ${e.priceText}`);
  if (e.description) descLines.push('', e.description);
  descLines.push('', e.url);

  return {
    summary: e.title,
    description: descLines.join('\n'),
    location: e.address || e.venue || (e.isOnline ? 'Online' : undefined),
    start: { dateTime: e.startISO },
    end: { dateTime: end },
    colorId,
    source: { title: e.source, url: e.url },
    extendedProperties: {
      private: {
        source: e.source,
        sourceId: e.sourceId,
        scraper: 'local-events-scraper',
      },
    },
  };
}

// Upsert each event into the configured calendar. Dedup by extendedProperties
// (source + sourceId). Returns { created, skipped }.
export async function syncEventsToCalendar(
  events: ScrapedEvent[],
  config: Config,
): Promise<{ created: number; skipped: number; failed: number }> {
  if (events.length === 0) return { created: 0, skipped: 0, failed: 0 };
  if (!config.calendar.calendarId) {
    warn('[calendar] calendarId is empty — run `npm run auth-calendar` to create the dedicated calendar.');
    return { created: 0, skipped: events.length, failed: 0 };
  }

  const cal = getCalendarClient();
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const e of events) {
    try {
      const existing = await cal.events.list({
        calendarId: config.calendar.calendarId,
        privateExtendedProperty: [`source=${e.source}`, `sourceId=${e.sourceId}`],
        maxResults: 1,
      });
      if (existing.data.items && existing.data.items.length > 0) {
        skipped++;
        continue;
      }
      await cal.events.insert({
        calendarId: config.calendar.calendarId,
        requestBody: buildCalendarEvent(e, config),
      });
      created++;
    } catch (err) {
      failed++;
      warn(`[calendar] failed to upsert "${e.title}": ${(err as Error).message}`);
    }
  }

  log(`[calendar] created=${created} skipped=${skipped} failed=${failed}`);
  return { created, skipped, failed };
}
