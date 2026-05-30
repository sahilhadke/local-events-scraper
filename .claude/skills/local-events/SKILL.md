---
name: local-events
description: Scrape upcoming local events from meetup, luma, and eventbrite; tag each with recommended:true/false based on config/personal-recommendations.md; sync everything to a dedicated Google Calendar (color-coded by recommendation); emit a brief results.md summary. Invoke when the user types "/local-events", asks for upcoming events, asks what's happening nearby this week/weekend, or asks to populate their events calendar.
argument-hint: [--day today|tomorrow|this-week|this-weekend|next-week|starting-soon|any] [--type in-person|online|any] [--distance 1|2|5|10|25]
allowed-tools: [Bash, Read]
disable-model-invocation: false
---

# local-events

Runs the full scraper -> recommend -> calendar pipeline in `C:\Users\sahil\Desktop\Projects\local-events-scraper`. Defaults for every filter come from `config/defaults.json`; CLI args override on a per-run basis.

## Step 0 — Preflight

Verify Brave is reachable on the CDP debug port:

```bash
cd "C:\Users\sahil\Desktop\Projects\local-events-scraper" && npx ts-node src/scripts/connect.ts
```

If this fails with "Could not connect to Brave", tell the user:
> "Brave isn't running with the debug port. Run `npm run launch-brave` from `local-events-scraper` (or `amc-book-movie` — same profile) and try again."

Do **not** silently launch Brave — the user manages browser lifecycle.

## Step 1 — Parse args

Skill args map directly to CLI flags. Pass through anything the user provides; omit the rest (the script falls back to `config/defaults.json`).

| Skill arg | CLI flag | Allowed values |
|---|---|---|
| Day | `--day` | `any` (default), `starting-soon`, `today`, `tomorrow`, `this-week`, `this-weekend`, `next-week` |
| Type | `--type` | `in-person` (default), `online`, `any` |
| Distance | `--distance` | `1`, `2`, `5`, `10` (default), `25` |

## Step 2 — Run the pipeline

```bash
cd "C:\Users\sahil\Desktop\Projects\local-events-scraper" && npm run scrape -- <args>
```

Capture stdout. The script ends by dumping `output/results.md` between `----- results.md -----` markers — that is the summary the user wants to see.

## Step 3 — Reply

Always reply to the user with the contents of `output/results.md` (extract from between the markers, or `Read` the file directly). On phone via Claude Dispatch this is the entire UX; on desktop it's still the most useful summary.

Mention briefly:
- How many events were scraped + how many are recommended.
- Whether calendar sync succeeded (counts from the `[calendar]` log line).
- Path to `output/events-YYYY-MM-DD.json` if the user wants raw data.

## Step 4 — Failures

If `npm run scrape` exits non-zero:
- Surface the error message from stderr.
- If it mentions `GOOGLE_REFRESH_TOKEN` -> tell the user to run `npm run auth-calendar`.
- If it mentions a specific scraper (e.g. `[meetup] failed:`), name the source so the user knows which scraper to debug.
- Do NOT retry blindly — these scrapers can hit anti-bot challenges.
