import { getPage, detach } from '../browser';
import { log } from '../utils/logger';

/**
 * Example script — pattern for any one-off automation Claude writes
 * when following SKILL.md steps.
 *
 *   1. getPage()        → connect to the running Brave + shared profile
 *   2. do work          → navigate, click, extract, screenshot, etc.
 *   3. detach(session)  → release the CDP connection (Brave stays open)
 */
async function main(): Promise<void> {
  const session = await getPage({ newTab: true });
  const { page } = session;

  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
  log(`Loaded: ${await page.title()}`);

  const heading = await page.locator('h1').first().innerText().catch(() => '');
  log(`Heading: ${heading}`);

  await detach(session);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
