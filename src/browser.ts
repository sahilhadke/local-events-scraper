import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { log } from './utils/logger';

const CDP_URL = 'http://localhost:9222';

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Connects to the already-running Brave instance over CDP (port 9222),
 * grabs the first context (shares cookies / login with that profile),
 * and returns either the active page or a new tab.
 *
 * Brave must be launched first via `npm run launch-brave` so the debug
 * port is open and the shared profile is loaded.
 */
export async function getPage(opts: { newTab?: boolean } = {}): Promise<Session> {
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    throw new Error(
      `Could not connect to Brave at ${CDP_URL}. ` +
      `Run "npm run launch-brave" first and make sure no other Brave window owns the profile.`
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
