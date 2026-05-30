import * as fs from 'fs';
import * as path from 'path';
import { Config, ScrapedEvent } from './types';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const RESULTS_PATH = path.join(OUTPUT_DIR, 'results.md');

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD, sorts naturally
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function summaryLine(e: ScrapedEvent): string {
  // Recommended events are bold; non-recommended are plain text.
  const title = e.recommended ? `**${e.title}**` : e.title;
  const venue = e.isOnline ? 'Online' : (e.venue ?? e.address ?? '');
  const reason = e.recommended && e.recommendedReason ? ` · _${e.recommendedReason}_` : '';
  const parts = [title, timeLabel(e.startISO), venue, e.source].filter(Boolean);
  return `- ${parts.join(' · ')}${reason}`;
}

export function buildResultsMarkdown(events: ScrapedEvent[], config: Config): string {
  const today = new Date().toLocaleDateString('en-CA');
  const recCount = events.filter(e => e.recommended).length;
  const f = config.filters;

  const lines: string[] = [];
  lines.push(`# Local events — ${today}`);
  lines.push('');
  lines.push(`_Filters: ${f.day} · ${f.type} · within ${f.distanceMiles}mi · ${events.length} events (${recCount} recommended)_`);
  lines.push('');

  if (events.length === 0) {
    lines.push('No events found.');
    return lines.join('\n');
  }

  const byDay = new Map<string, ScrapedEvent[]>();
  for (const e of events) {
    const k = dayKey(e.startISO);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(e);
  }

  const sortedDays = [...byDay.keys()].sort();
  for (const day of sortedDays) {
    const list = byDay.get(day)!.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return a.startISO.localeCompare(b.startISO);
    });
    lines.push(`## ${dayLabel(list[0].startISO)}`);
    for (const e of list) lines.push(summaryLine(e));
    lines.push('');
  }

  return lines.join('\n');
}

export function writeResults(events: ScrapedEvent[], config: Config): { path: string; content: string } {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const content = buildResultsMarkdown(events, config);
  fs.writeFileSync(RESULTS_PATH, content);
  return { path: RESULTS_PATH, content };
}

export function writeEventsJson(events: ScrapedEvent[]): string {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const today = new Date().toLocaleDateString('en-CA');
  const p = path.join(OUTPUT_DIR, `events-${today}.json`);
  fs.writeFileSync(p, JSON.stringify({ generatedAt: new Date().toISOString(), events }, null, 2));
  return p;
}

export function readLatestEventsJson(): ScrapedEvent[] {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => /^events-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length === 0) return [];
  const latest = files[files.length - 1];
  const raw = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, latest), 'utf-8'));
  return raw.events ?? [];
}
