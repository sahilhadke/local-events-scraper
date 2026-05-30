import { DayFilter } from '../types';

export interface DateRange {
  startISO: string;
  endISO: string;
}

function atStartOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function atEndOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Returns the upcoming Saturday and Sunday (inclusive of today if it falls on those days).
function upcomingWeekend(now: Date): { sat: Date; sun: Date } {
  const today = atStartOfDay(now);
  const dow = today.getDay(); // Sun=0, Mon=1, ..., Sat=6
  const daysToSat = (6 - dow + 7) % 7;
  const sat = addDays(today, daysToSat);
  const sun = addDays(sat, 1);
  return { sat, sun };
}

// Returns next Monday and the Sunday after it.
function nextWeek(now: Date): { mon: Date; sun: Date } {
  const today = atStartOfDay(now);
  const dow = today.getDay();
  const daysToNextMon = ((1 - dow + 7) % 7) || 7; // never today
  const mon = addDays(today, daysToNextMon);
  const sun = addDays(mon, 6);
  return { mon, sun };
}

// Upcoming Sunday at 23:59:59.999, treating today as part of this week.
function endOfThisWeek(now: Date): Date {
  const today = atStartOfDay(now);
  const dow = today.getDay();
  const daysToSun = (7 - dow) % 7; // 0 if today is Sun
  return atEndOfDay(addDays(today, daysToSun));
}

export function rangeForDayFilter(filter: DayFilter, now: Date = new Date()): DateRange | null {
  switch (filter) {
    case 'any':
      return null;
    case 'starting-soon': {
      const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      return { startISO: now.toISOString(), endISO: end.toISOString() };
    }
    case 'today':
      return { startISO: now.toISOString(), endISO: atEndOfDay(now).toISOString() };
    case 'tomorrow': {
      const t = addDays(now, 1);
      return { startISO: atStartOfDay(t).toISOString(), endISO: atEndOfDay(t).toISOString() };
    }
    case 'this-week':
      return { startISO: now.toISOString(), endISO: endOfThisWeek(now).toISOString() };
    case 'this-weekend': {
      const { sat, sun } = upcomingWeekend(now);
      return { startISO: atStartOfDay(sat).toISOString(), endISO: atEndOfDay(sun).toISOString() };
    }
    case 'next-week': {
      const { mon, sun } = nextWeek(now);
      return { startISO: atStartOfDay(mon).toISOString(), endISO: atEndOfDay(sun).toISOString() };
    }
  }
}

// True when an event's startISO falls inside the filter range. `any` always matches.
export function eventMatchesDayFilter(startISO: string, filter: DayFilter, now: Date = new Date()): boolean {
  const range = rangeForDayFilter(filter, now);
  if (!range) return true;
  const t = new Date(startISO).getTime();
  return t >= new Date(range.startISO).getTime() && t <= new Date(range.endISO).getTime();
}
