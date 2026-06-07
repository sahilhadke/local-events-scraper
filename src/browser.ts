import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { log } from './utils/logger';

const CDP_PORT = 9222;
const CDP_URL = `http://localhost:${CDP_PORT}`;

// Brave + the SHARED profile from amc-book-movie. These mirror launch-brave.bat;
// only one Brave instance can own this profile at a time.
const BRAVE_EXE = path.join(
  process.env.LOCALAPPDATA ?? '',
  'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe',
);
const BRAVE_PROFILE = 'C:\\Users\\sahil\\Desktop\\Projects\\amc-book-movie\\playwright\\.auth\\brave-profile';

const LAUNCH_TIMEOUT_MS = 30_000;

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/** True if Brave's CDP endpoint is already answering on the debug port. */
function cdpReachable(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`${CDP_URL}/json/version`, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Spawn Brave detached with the debug port + shared profile, then let go of it. */
function spawnBrave(): void {
  if (!fs.existsSync(BRAVE_EXE)) {
    throw new Error(
      `Brave not found at ${BRAVE_EXE}. Update BRAVE_EXE in src/browser.ts if it lives elsewhere.`,
    );
  }
  const child = spawn(
    BRAVE_EXE,
    [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${BRAVE_PROFILE}`],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
}

/**
 * Ensure Brave is running with the debug port open. If it already is (e.g.
 * amc-book-movie launched it), we reuse it; otherwise we launch it ourselves
 * and wait for the port to come up. No manual `npm run launch-brave` needed.
 */
async function ensureBraveRunning(): Promise<void> {
  if (await cdpReachable()) return;

  log('Brave debug port not reachable — launching Brave...');
  spawnBrave();

  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    if (await cdpReachable()) {
      log('Brave is up on the debug port.');
      return;
    }
  }
  throw new Error(
    `Brave did not open its debug port within ${LAUNCH_TIMEOUT_MS / 1000}s. ` +
    `If another Brave window already owns the shared profile, close it and retry.`,
  );
}

/**
 * Connects to Brave over CDP (port 9222), auto-launching it first if needed,
 * grabs the first context (shares cookies / login with that profile), and
 * returns either the active page or a new tab.
 */
export async function getPage(opts: { newTab?: boolean } = {}): Promise<Session> {
  await ensureBraveRunning();

  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    throw new Error(
      `Could not connect to Brave at ${CDP_URL} even after launching it. ` +
      `Make sure no other Brave window owns the shared profile.`,
    );
  }

  const contexts = browser.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext();

  let page: Page;
  if (opts.newTab) {
    page = await context.newPage();
  } else {
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
  }

  log(`Connected to Brave — ${context.pages().length} tab(s) open`);
  return { browser, context, page };
}

/**
 * Detach from Brave without closing it. Use at the end of a script so the
 * browser stays open for the next script (which re-attaches via CDP).
 */
export async function detach(session: Session): Promise<void> {
  await session.browser.close().catch(() => {});
}
