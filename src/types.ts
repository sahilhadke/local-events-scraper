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
  searchString: string;   // typed into meetup/eventbrite location inputs
  lumaUrl: string;        // direct city URL for luma
}

export interface CalendarConfig {
  calendarId: string;     // empty until auth-calendar populates it
  colorRecommended: string;
  colorOther: string;
}

export interface RecommendationConfig {
  model: string;
  enabled: boolean;
}

export interface Config {
  location: LocationConfig;
  filters: RunFilters;
  calendar: CalendarConfig;
  recommendation: RecommendationConfig;
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
