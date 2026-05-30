import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Config, ScrapedEvent } from './types';
import { log, warn } from './utils/logger';

const RECS_PATH = path.join(process.cwd(), 'config', 'personal-recommendations.md');
const RECS_EXAMPLE_PATH = path.join(process.cwd(), 'config', 'personal-recommendations.md.example');

function loadRecsRules(): string {
  const p = fs.existsSync(RECS_PATH) ? RECS_PATH : RECS_EXAMPLE_PATH;
  if (!fs.existsSync(p)) throw new Error(`Missing ${RECS_PATH} and ${RECS_EXAMPLE_PATH}`);
  return fs.readFileSync(p, 'utf-8');
}

interface RecResult {
  sourceId: string;
  recommended: boolean;
  reason: string;
}

// Tag each event with `recommended` and `recommendedReason` using a single
// Anthropic call. System prompt = personal-recommendations.md (cached).
// User content = compact JSON of the events. Tool use forces structured output.
export async function recommendEvents(events: ScrapedEvent[], config: Config): Promise<ScrapedEvent[]> {
  if (events.length === 0) return events;
  if (!process.env.ANTHROPIC_API_KEY) {
    warn('ANTHROPIC_API_KEY not set — skipping recommendation step (all events default to recommended=false)');
    return events.map(e => ({ ...e, recommended: false, recommendedReason: 'skipped: no API key' }));
  }

  const client = new Anthropic();
  const rules = loadRecsRules();
  const compact = events.map(e => ({
    sourceId: e.sourceId,
    source: e.source,
    title: e.title,
    description: (e.description ?? '').slice(0, 400),
    host: e.host,
    venue: e.venue,
    isOnline: e.isOnline,
    priceText: e.priceText,
    startISO: e.startISO,
  }));

  log(`[recommend] tagging ${events.length} event(s) with ${config.recommendation.model}`);

  const response = await client.messages.create({
    model: config.recommendation.model,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text:
          'You decide whether each event matches the user\'s preferences below.\n' +
          'Reply ONLY via the `tag_events` tool. Be strict but fair — if an event clearly fits, recommend=true; ' +
          'otherwise recommend=false with a 1-sentence reason.\n\n' +
          '---\nUSER PREFERENCES:\n\n' + rules,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'tag_events',
        description: 'Return a recommendation verdict for each event.',
        input_schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sourceId: { type: 'string' },
                  recommended: { type: 'boolean' },
                  reason: { type: 'string', description: 'One short sentence.' },
                },
                required: ['sourceId', 'recommended', 'reason'],
              },
            },
          },
          required: ['results'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'tag_events' },
    messages: [{ role: 'user', content: JSON.stringify(compact) }],
  });

  const toolUse = response.content.find(c => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    warn('[recommend] no tool_use in response — leaving events untagged');
    return events;
  }
  const results = (toolUse.input as { results: RecResult[] }).results;
  const byId = new Map(results.map(r => [r.sourceId, r]));

  const tagged = events.map(e => {
    const r = byId.get(e.sourceId);
    if (!r) return { ...e, recommended: false, recommendedReason: 'untagged by LLM' };
    return { ...e, recommended: r.recommended, recommendedReason: r.reason };
  });

  const recCount = tagged.filter(e => e.recommended).length;
  log(`[recommend] ${recCount}/${tagged.length} recommended`);
  return tagged;
}
