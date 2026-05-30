import * as fs from 'fs';
import * as path from 'path';
import minimist from 'minimist';
import {
  Config,
  DayFilter,
  DistanceMiles,
  EventSource,
  TypeFilter,
} from './types';

const DEFAULTS_PATH = path.join(process.cwd(), 'config', 'defaults.json');
const DEFAULTS_EXAMPLE_PATH = path.join(process.cwd(), 'config', 'defaults.example.json');

const VALID_DAYS: DayFilter[] = ['any', 'starting-soon', 'today', 'tomorrow', 'this-week', 'this-weekend', 'next-week'];
const VALID_TYPES: TypeFilter[] = ['in-person', 'online', 'any'];
const VALID_DISTANCES: DistanceMiles[] = [1, 2, 5, 10, 25];
const VALID_SOURCES: EventSource[] = ['meetup', 'luma', 'eventbrite'];

export interface CliOverrides {
  day?: DayFilter;
  type?: TypeFilter;
  distanceMiles?: DistanceMiles;
  only?: EventSource[];      // restrict to a subset of scrapers (debug)
  skipCalendar?: boolean;
  skipRecommend?: boolean;
}

export function loadConfig(): Config {
  const targetPath = fs.existsSync(DEFAULTS_PATH) ? DEFAULTS_PATH : DEFAULTS_EXAMPLE_PATH;
  if (!fs.existsSync(targetPath)) {
    throw new Error(`No config found. Copy config/defaults.example.json → config/defaults.json and edit.`);
  }
  const raw = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as Config;
  return raw;
}

export function parseCliOverrides(argv: string[]): CliOverrides {
  // `npm run scrape -- --day today` produces ['--', '--day', 'today']; strip leading '--' if present.
  const cleaned = argv[0] === '--' ? argv.slice(1) : argv;
  const args = minimist(cleaned, {
    string: ['day', 'type', 'distance', 'only'],
    boolean: ['skip-calendar', 'skip-recommend'],
  });

  const overrides: CliOverrides = {};

  if (args['day']) {
    if (!VALID_DAYS.includes(args['day'])) {
      throw new Error(`Invalid --day "${args['day']}". One of: ${VALID_DAYS.join(', ')}`);
    }
    overrides.day = args['day'] as DayFilter;
  }

  if (args['type']) {
    if (!VALID_TYPES.includes(args['type'])) {
      throw new Error(`Invalid --type "${args['type']}". One of: ${VALID_TYPES.join(', ')}`);
    }
    overrides.type = args['type'] as TypeFilter;
  }

  if (args['distance'] !== undefined) {
    const n = Number(args['distance']);
    if (!VALID_DISTANCES.includes(n as DistanceMiles)) {
      throw new Error(`Invalid --distance "${args['distance']}". One of: ${VALID_DISTANCES.join(', ')}`);
    }
    overrides.distanceMiles = n as DistanceMiles;
  }

  if (args['only']) {
    const parts = String(args['only']).split(',').map(s => s.trim()) as EventSource[];
    for (const p of parts) {
      if (!VALID_SOURCES.includes(p)) {
        throw new Error(`Invalid --only "${p}". One of: ${VALID_SOURCES.join(', ')}`);
      }
    }
    overrides.only = parts;
  }

  if (args['skip-calendar']) overrides.skipCalendar = true;
  if (args['skip-recommend']) overrides.skipRecommend = true;

  return overrides;
}

export function applyOverrides(config: Config, overrides: CliOverrides): Config {
  return {
    ...config,
    filters: {
      day: overrides.day ?? config.filters.day,
      type: overrides.type ?? config.filters.type,
      distanceMiles: overrides.distanceMiles ?? config.filters.distanceMiles,
    },
  };
}
