export type EventSource = 'meetup' | 'luma' | 'eventbrite';

export type DayFilter =
  | 'any'
  | 'starting-soon'
  | 'today'
  | 'tomorrow'
  | 'this-week'
  | 'this-weekend'
  | 'next-week';

export type TypeFilter = 'in-person' | 'online' | 'any';

export type DistanceMiles = 1 | 2 | 5 | 10 | 25;

export interface RunFilters {
  day: DayFilter;
  type: TypeFilter;
  distanceMiles: DistanceMiles;
}

export interface LocationConfig {
  searchString: string;     // human label, also the fallback source for eventbriteSlug
  meetupSlug: string;       // meetup URL slug, e.g. "us--ca--San+Francisco"
  lumaUrl: string;          // direct city URL for luma, e.g. "https://luma.com/sf"
  eventbriteSlug?: string;  // eventbrite /d/<slug>/ city slug, e.g. "ca--san-francisco"; derived from searchString if omitted
}

// Events are partitioned into exactly one bucket, with precedence
// recommended > free > rest (see bucketFor in calendar.ts).
export type EventBucket = 'recommended' | 'free' | 'rest';

export interface CalendarConfig {
  calendarIds: Record<EventBucket, string>;  // empty strings until auth-calendar populates them
  colorRecommended: string;
  colorOther: string;
}

export interface ScrapersConfig {
  meetup?: { maxEvents?: number };
  luma?: { maxEvents?: number };
  eventbrite?: { maxEvents?: number };
}

export interface Config {
  location: LocationConfig;
  filters: RunFilters;
  calendar: CalendarConfig;
  scrapers?: ScrapersConfig;
}

export interface ScrapedEvent {
  source: EventSource;
  sourceId: string;          // stable per-source id (slug or numeric)
  title: string;
  description?: string;
  url: string;
  startISO: string;          // ISO with offset, e.g. 2026-05-30T18:30:00-07:00
  endISO?: string;
  venue?: string;
  address?: string;
  isOnline: boolean;
  host?: string;
  imageUrl?: string;
  priceText?: string;        // "Free", "$25", etc. — raw
  recommended?: boolean;
  recommendedReason?: string;
}
