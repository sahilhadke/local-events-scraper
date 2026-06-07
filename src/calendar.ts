import { google, calendar_v3 } from 'googleapis';
import { Config, EventBucket, ScrapedEvent } from './types';
import { log, warn } from './utils/logger';

// An event is "free" when no price was scraped (most meetup/luma events).
function isFreeEvent(e: ScrapedEvent): boolean {
  return !e.priceText || e.priceText.trim() === '';
}

// Each event lands in exactly one calendar: recommended wins, then free, then rest.
function bucketFor(e: ScrapedEvent): EventBucket {
  if (e.recommended) return 'recommended';
  if (isFreeEvent(e)) return 'free';
  return 'rest';
}

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

// Delete every event created by this scraper from all three calendars.
// Identifies events by the private extendedProperty scraper=local-events-scraper.
export async function clearAllCalendars(
  config: Config,
): Promise<{ deleted: number; failed: number }> {
  const { calendarIds } = config.calendar;
  const buckets: EventBucket[] = ['recommended', 'free', 'rest'];
  const cal = getCalendarClient();
  let deleted = 0;
  let failed = 0;

  for (const bucket of buckets) {
    const calendarId = calendarIds[bucket];
    if (!calendarId) {
      warn(`[calendar] no calendar ID for "${bucket}" — skipping.`);
      continue;
    }

    let pageToken: string | undefined;
    do {
      const res = await cal.events.list({
        calendarId,
        privateExtendedProperty: ['scraper=local-events-scraper'],
        maxResults: 250,
        pageToken,
        showDeleted: false,
      });
      const items = res.data.items ?? [];
      pageToken = res.data.nextPageToken ?? undefined;

      for (const item of items) {
        if (!item.id) continue;
        try {
          await cal.events.delete({ calendarId, eventId: item.id });
          deleted++;
        } catch (err) {
          failed++;
          warn(`[calendar] failed to delete "${item.summary}" from ${bucket}: ${(err as Error).message}`);
        }
      }
    } while (pageToken);

    log(`[calendar] cleared "${bucket}" calendar`);
  }

  log(`[calendar] clear complete: deleted=${deleted} failed=${failed}`);
  return { deleted, failed };
}

// Upsert each event into its bucket's calendar (recommended / free / rest).
// Dedup by extendedProperties (source + sourceId). Returns totals.
export async function syncEventsToCalendar(
  events: ScrapedEvent[],
  config: Config,
): Promise<{ created: number; skipped: number; failed: number }> {
  if (events.length === 0) return { created: 0, skipped: 0, failed: 0 };

  const { calendarIds } = config.calendar;
  const missing = (['recommended', 'free', 'rest'] as EventBucket[]).filter(b => !calendarIds[b]);
  if (missing.length === 3) {
    warn('[calendar] no calendar IDs configured — run `npm run auth-calendar` to create the calendars.');
    return { created: 0, skipped: events.length, failed: 0 };
  }
  if (missing.length > 0) {
    warn(`[calendar] missing calendar ID(s) for bucket(s): ${missing.join(', ')} — those events will be skipped.`);
  }

  const cal = getCalendarClient();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const perBucket: Record<EventBucket, number> = { recommended: 0, free: 0, rest: 0 };

  for (const e of events) {
    const bucket = bucketFor(e);
    const calendarId = calendarIds[bucket];
    if (!calendarId) {
      skipped++;
      continue;
    }
    try {
      const existing = await cal.events.list({
        calendarId,
        privateExtendedProperty: [`source=${e.source}`, `sourceId=${e.sourceId}`],
        maxResults: 1,
      });
      if (existing.data.items && existing.data.items.length > 0) {
        skipped++;
        continue;
      }
      await cal.events.insert({
        calendarId,
        requestBody: buildCalendarEvent(e, config),
      });
      created++;
      perBucket[bucket]++;
    } catch (err) {
      failed++;
      warn(`[calendar] failed to upsert "${e.title}" -> ${bucket}: ${(err as Error).message}`);
    }
  }

  log(`[calendar] created=${created} (recommended=${perBucket.recommended} free=${perBucket.free} rest=${perBucket.rest}) skipped=${skipped} failed=${failed}`);
  return { created, skipped, failed };
}
