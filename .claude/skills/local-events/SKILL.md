---
name: local-events
description: Two-mode local events skill. Mode 1 (--sync, default): scrape upcoming events from Meetup, Luma, and Eventbrite, tag each as recommended or not, and sync into three Google Calendars. Mode 2 (--clear): delete all local-events-scraper events from all three calendars. Invoke when the user types "/local-events", asks for upcoming events, asks what's happening nearby, asks to populate their calendar, or asks to clear/remove all local events from their calendar.
argument-hint: --sync [--day today|tomorrow|this-week|this-weekend|next-week|starting-soon|any] [--type in-person|online|any] [--distance 1|2|5|10|25] | --clear
allowed-tools: [Bash, Read, Write, Edit]
disable-model-invocation: false
---

# local-events

Pipeline in `C:\Users\sahil\Desktop\Projects\local-events-scraper`.

## Two Modes

The skill takes one top-level mode argument:

| Argument | Action |
|---|---|
| `--sync` (default) | Scrape → Recommend → Sync to calendar |
| `--clear` | Delete all local-events-scraper events from all three calendars |

---

## MODE 1: `--sync` (default)

Run this when the user wants to find events, populate their calendar, or refresh what's there.

### Step 0 — Preflight

No manual browser step needed. The scraper auto-launches Brave with the CDP debug port + shared profile. If it fails because another Brave window already owns the shared profile, tell the user to close the other Brave window and retry.

### Step 1 — Parse args

| Skill arg | CLI flag | Allowed values |
|---|---|---|
| Day | `--day` | `any` (default), `starting-soon`, `today`, `tomorrow`, `this-week`, `this-weekend`, `next-week` |
| Type | `--type` | `in-person` (default), `online`, `any` |
| Distance | `--distance` | `1`, `2`, `5`, `10` (default), `25` |

### Step 2 — Scrape

```bash
cd "C:\Users\sahil\Desktop\Projects\local-events-scraper" && npm run scrape-only -- <args>
```

This writes `output/events-YYYY-MM-DD.json` and `results.md`. It does NOT recommend or sync.

### Step 3 — Recommend (you do this)

1. `Read` `config/personal-recommendations.md` (fall back to `.md.example` if it doesn't exist).
2. `Read` the latest `output/events-*.json`.
3. For every event, decide `recommended` (true/false) and write a one-sentence `recommendedReason`. Be strict but fair.
4. Write the updated array back to the **same** JSON file, preserving `{ generatedAt, events: [...] }`. Only add/replace `recommended` and `recommendedReason`. Match by `sourceId`.

Bucket logic (derived downstream from your tags):
- `recommended: true` → **Recommended Local Events** calendar
- `recommended: false` + no `priceText` → **Free Local Events** calendar
- `recommended: false` + has `priceText` → **Rest of the Local Events** calendar

### Step 4 — Sync

```bash
cd "C:\Users\sahil\Desktop\Projects\local-events-scraper" && npm run sync-calendar
```

Reads the tagged JSON and upserts each event into its bucket calendar (deduped by source + sourceId).

### Step 5 — Reply

Summarize:
- How many events scraped and how many recommended.
- Per-bucket calendar counts from the `[calendar]` log line.
- Path to `output/events-YYYY-MM-DD.json` for raw data.

### Step 6 — Failures

- **Scrape failure**: name the source. Do NOT retry blindly.
- **Sync failure** with `GOOGLE_REFRESH_TOKEN` error → tell user to run `npm run auth-calendar`.
- **Missing calendar IDs** → run `npm run auth-calendar`.

---

## MODE 2: `--clear`

Run this when the user wants to remove all local events from their Google Calendars.

```bash
cd "C:\Users\sahil\Desktop\Projects\local-events-scraper" && npm run clear-calendars
```

This pages through all three calendars (Recommended / Free / Rest), finds every event tagged `scraper=local-events-scraper`, and deletes them.

Reply with the result from the `[calendar] clear complete: deleted=… failed=…` log line.

If it errors with `GOOGLE_REFRESH_TOKEN` → tell the user to run `npm run auth-calendar`.
