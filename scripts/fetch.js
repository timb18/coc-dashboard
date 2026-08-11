#!/usr/bin/env node
// Rotates CoC API token for the current runner IP, then fetches all clan data.
// Requires Node 18+ (built-in fetch).

const fs   = require('fs');
const path = require('path');

const DEV_API = 'https://developer.clashofclans.com/api';
const COC_API = 'https://api.clashofclans.com/v1';
const KEY_NAME = 'github-actions-auto';

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function req(url, options = {}) {
  const res  = await fetch(url, options);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, headers: res.headers, body };
}

// ── Token rotation ───────────────────────────────────────────────────────────

async function getRunnerIp() {
  const r = await req('https://api.ipify.org?format=json');
  return r.body.ip;
}

async function devLogin(email, password) {
  const r = await req(`${DEV_API}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`CoC developer login failed (${r.status}): ${JSON.stringify(r.body)}`);
  // Session is returned as a cookie
  return r.headers.get('set-cookie') ?? '';
}

async function listKeys(cookie) {
  const r = await req(`${DEV_API}/apikey/list`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body:    '{}',
  });
  return r.body.keys ?? [];
}

async function revokeKey(cookie, id) {
  await req(`${DEV_API}/apikey/revoke`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body:    JSON.stringify({ id }),
  });
}

async function createKey(cookie, ip) {
  const r = await req(`${DEV_API}/apikey/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body:    JSON.stringify({
      name:        KEY_NAME,
      description: 'Auto-managed – GitHub Actions runner key',
      cidrRanges:  [ip],
      scopes:      null,
    }),
  });
  if (!r.ok) throw new Error(`Key creation failed (${r.status}): ${JSON.stringify(r.body)}`);
  return r.body.key.key;
}

async function acquireToken(email, password) {
  const ip     = await getRunnerIp();
  const cookie = await devLogin(email, password);
  const keys   = await listKeys(cookie);

  // Remove previous auto key
  const old = keys.find(k => k.name === KEY_NAME);
  if (old) await revokeKey(cookie, old.id);

  // CoC allows max 10 keys per account; make room if needed
  const others = keys.filter(k => k.name !== KEY_NAME);
  if (others.length >= 10) await revokeKey(cookie, others[0].id);

  const token = await createKey(cookie, ip);
  console.log(`✓ Token created for IP ${ip}`);
  return token;
}

// ── CoC API fetcher ──────────────────────────────────────────────────────────

async function cocGet(urlPath, token, params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${COC_API}${urlPath}${qs ? '?' + qs : ''}`;
  const r   = await req(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (r.status === 403) return { _error: 'accessDenied' };
  if (r.status === 404) return { _error: 'notFound' };
  if (r.status === 503) return { _error: 'maintenance' };
  if (!r.ok) throw new Error(`CoC API ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { COC_EMAIL, COC_PASSWORD, COC_CLAN_TAG } = process.env;
  if (!COC_EMAIL || !COC_PASSWORD || !COC_CLAN_TAG) {
    throw new Error('Missing secrets: COC_EMAIL, COC_PASSWORD, COC_CLAN_TAG');
  }

  const token = await acquireToken(COC_EMAIL, COC_PASSWORD);
  const tag   = encodeURIComponent(COC_CLAN_TAG.startsWith('#') ? COC_CLAN_TAG : '#' + COC_CLAN_TAG);

  console.log('Fetching clan data...');
  const [clan, members, war, warlog, cwl, raids] = await Promise.allSettled([
    cocGet(`/clans/${tag}`, token),
    cocGet(`/clans/${tag}/members`, token),
    cocGet(`/clans/${tag}/currentwar`, token),
    cocGet(`/clans/${tag}/warlog`, token, { limit: 20 }),
    cocGet(`/clans/${tag}/currentwar/leaguegroup`, token),
    cocGet(`/clans/${tag}/capitalraidseasons`, token, { limit: 5 }),
  ]);

  const result = (settled) =>
    settled.status === 'fulfilled' ? settled.value : { _error: settled.reason?.message };

  const data = {
    lastUpdated: new Date().toISOString(),
    clan:    result(clan),
    members: result(members),
    war:     result(war),
    warlog:  result(warlog),
    cwl:     result(cwl),
    raids:   result(raids),
  };

  const out = path.join(__dirname, '..', 'data', 'data.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data));
  console.log('✓ data/data.json updated');
}

main().catch(err => { console.error('FEHLER:', err.message); process.exit(1); });
