---
name: sf-events
description: Run an interactive browser automation against a website using the shared Brave profile. Invoke when the user says "/sf-events" or asks to run the sf-events flow. The steps to perform are written in the "User-defined steps" section below — read them, then translate each step into Playwright actions and execute via the connected Brave instance.
argument-hint: [optional free-form override / extra context]
allowed-tools: [Bash, Read, Write, Edit]
disable-model-invocation: true
---

# sf-events — Dynamic Browser Automation

**Project location:** `C:\Users\sahil\Desktop\Projects\sf-events`

Unlike the `amc` skill (which has hardcoded booking logic baked into `src/`), this skill is **driven by the steps the user writes below**. Each invocation:

1. Reads the "User-defined steps" section.
2. Translates each step into Playwright operations.
3. Writes a one-off script at `src/scripts/run-<timestamp>.ts` that uses the shared `getPage()` helper.
4. Runs it via `npx ts-node`.

---

## Step 0 — Preflight

Before doing anything, verify Brave is running with the debug port open:

```bash
cd "C:\Users\sahil\Desktop\Projects\sf-events" && npx ts-node src/scripts/connect.ts
```

If this fails with "Could not connect to Brave", tell the user:
> "Brave isn't running with the debug port. Run `npm run launch-brave` from `sf-events` (or `amc-book-movie` — same profile) and try again."

Do **not** silently launch Brave yourself — the user manages browser lifecycle.

---

## Step 1 — Read the steps

The user's instructions live in the "User-defined steps" section at the bottom of this file. Read them carefully. They may include:

- URLs to navigate to
- Buttons / links to click (described by visible text or context)
- Form fields to fill
- Data to extract and report back
- Conditional logic ("if X, do Y, else Z")
- Output format expectations

If anything is ambiguous, ask the user **before** writing the script.

---

## Step 2 — Write a one-off script

Generate a new file at `src/scripts/run-<YYYYMMDD-HHMM>.ts` that:

- Imports `getPage` and `detach` from `../browser`
- Connects via `getPage()` (or `getPage({ newTab: true })` if the user wants a fresh tab)
- Performs each step as a Playwright action
- Uses robust selectors (text-based locators, `getByRole`, `getByText`) — avoid brittle CSS unless necessary
- Adds short waits where the page needs to settle (`waitForLoadState`, `waitForSelector`)
- Logs progress with the shared `log()` helper from `../utils/logger`
- Saves any extracted data to `output/<descriptive-name>.json`
- Always ends with `detach(session)` so Brave stays open for the next run

Keep the script readable — the user may review or edit it later.

---

## Step 3 — Run it

```bash
cd "C:\Users\sahil\Desktop\Projects\sf-events" && npx ts-node src/scripts/run-<YYYYMMDD-HHMM>.ts
```

Capture stdout and surface only the relevant output to the user (final extracted data, success/failure, errors). Don't dump full Playwright logs.

If the script fails, read the error, inspect the page state if possible, and either fix the script and re-run, or report back to the user with what went wrong.

---

## Step 4 — Report

Tell the user what happened in 1–3 sentences plus any extracted data. Link to the saved output file if applicable.

---

## User-defined steps

<!--
Replace this section with the actual operations you want performed.
Examples:

1. Go to https://example.com/events
2. Click the "This Weekend" tab
3. For each event card, extract the title, date, and venue
4. Save the list as output/events.json
5. Print the top 5 by date

Be specific about selectors when possible. Use visible text — Claude will
turn that into Playwright locators.
-->

(none yet — fill this in before invoking the skill)
