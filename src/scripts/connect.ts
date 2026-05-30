import { getPage, detach } from '../browser';
import { log } from '../utils/logger';

/**
 * Sanity check: connect to Brave, print the current URL, then detach.
 * Use this to verify `npm run launch-brave` worked and CDP is reachable.
 */
async function main(): Promise<void> {
  const session = await getPage();
  log(`Current URL: ${session.page.url()}`);
  log(`Page title:  ${await session.page.title()}`);
  await detach(session);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
