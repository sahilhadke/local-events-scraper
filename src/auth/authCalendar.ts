/**
 * One-time Google Calendar OAuth flow.
 *   npm run auth-calendar
 *
 * - Captures a refresh token and writes GOOGLE_REFRESH_TOKEN to .env.
 * - If config/defaults.json has an empty calendarId, creates a dedicated
 *   "Local Events" calendar and writes its ID back to defaults.json.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { google } from 'googleapis';
import { Config } from '../types';

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3000';
const ENV_FILE      = path.join(process.cwd(), '.env');
const DEFAULTS_PATH = path.join(process.cwd(), 'config', 'defaults.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
  console.error('Create credentials at https://console.cloud.google.com/ (OAuth 2.0 Web app, redirect http://localhost:3000).');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar'],
  prompt: 'consent',
});

console.log('\nOpening browser for Google OAuth approval...');
console.log('If it does not open automatically, visit this URL:\n');
console.log(authUrl + '\n');

const { exec } = require('child_process');
exec(`start "" "${authUrl}"`);

function upsertEnvVar(file: string, key: string, value: string) {
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const re = new RegExp(`^#?\\s*${key}=.*\\n?`, 'm');
  content = content.replace(re, '').trimEnd();
  content += `\n${key}=${value}\n`;
  fs.writeFileSync(file, content);
}

async function maybeCreateCalendar(authClient: any): Promise<string | null> {
  if (!fs.existsSync(DEFAULTS_PATH)) {
    console.log('No config/defaults.json found — skipping calendar creation. Copy defaults.example.json and re-run.');
    return null;
  }
  const config = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf-8')) as Config;
  if (config.calendar.calendarId) {
    console.log(`Calendar already configured: ${config.calendar.calendarId}`);
    return config.calendar.calendarId;
  }

  const cal = google.calendar({ version: 'v3', auth: authClient });
  console.log('Creating dedicated "Local Events" calendar...');
  const created = await cal.calendars.insert({
    requestBody: {
      summary: 'Local Events',
      description: 'Events scraped by local-events-scraper. Recommended events are color-coded.',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  const id = created.data.id;
  if (!id) throw new Error('Calendar created but no id returned.');

  config.calendar.calendarId = id;
  fs.writeFileSync(DEFAULTS_PATH, JSON.stringify(config, null, 2));
  console.log(`Calendar created and saved to defaults.json: ${id}`);
  return id;
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url!, 'http://localhost:3000');
  const code = reqUrl.searchParams.get('code');
  const errParam = reqUrl.searchParams.get('error');

  if (errParam) {
    res.end('<h2>Access denied.</h2><p>You can close this tab.</p>');
    console.error('\nOAuth denied:', errParam);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.end('<h2>No code received.</h2>');
    server.close();
    return;
  }
  res.end('<h2>Authorised.</h2><p>You can close this tab and return to the terminal.</p>');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      throw new Error('No refresh_token returned. Revoke access at myaccount.google.com/permissions and re-run.');
    }
    upsertEnvVar(ENV_FILE, 'GOOGLE_REFRESH_TOKEN', refreshToken);
    console.log('\nrefresh_token saved to .env as GOOGLE_REFRESH_TOKEN');

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    await maybeCreateCalendar(oauth2Client);

    console.log('\nYou can now run:  npm run scrape\n');
  } catch (err) {
    console.error('Token exchange failed:', (err as Error).message);
  }
  server.close();
});

server.listen(3000, () => {
  console.log('Waiting for OAuth callback on http://localhost:3000 ...\n');
});
