// Enhanced CoC data fetcher: player profiles, CWL war details, raid analytics
// Requires Node 18+ (built-in fetch). No npm deps.

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_API   = 'https://developer.clashofclans.com/api';
const COC_API   = 'https://api.clashofclans.com/v1';
const KEY_NAME  = 'github-actions-auto';

// ── HTTP ────────────────────────────────────────────────────────────────────

async function req(url, options = {}) {
  const res  = await fetch(url, options);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, headers: res.headers, body };
}

async function getPublicIp() {
  const r = await req('https://api.ipify.org?format=json');
  return r.body.ip;
}

async function devLogin(email, password) {
  const r = await req(`${DEV_API}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Login failed (${r.status}): ${JSON.stringify(r.body)}`);
  return r.headers.get('set-cookie') ?? '';
}

async function listKeys(cookie) {
  const r = await req(`${DEV_API}/apikey/list`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{}',
  });
  return r.body.keys ?? [];
}

async function revokeKey(cookie, id) {
  await req(`${DEV_API}/apikey/revoke`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ id }),
  });
}

async function createKey(cookie, ip) {
  const r = await req(`${DEV_API}/apikey/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: KEY_NAME, description: 'Auto – GitHub Actions', cidrRanges: [ip], scopes: null }),
  });
  if (!r.ok) throw new Error(`Key creation failed (${r.status}): ${JSON.stringify(r.body)}`);
  return r.body.key.key;
}

async function acquireToken(email, password) {
  const ip     = await getPublicIp();
  const cookie = await devLogin(email, password);
  const keys   = await listKeys(cookie);
  const old    = keys.find(k => k.name === KEY_NAME);
  if (old) await revokeKey(cookie, old.id);
  const others = keys.filter(k => k.name !== KEY_NAME);
  if (others.length >= 10) await revokeKey(cookie, others[0].id);
  const token  = await createKey(cookie, ip);
  console.log(`✓ Token für IP ${ip}`);
  return token;
}

// ── CoC API ─────────────────────────────────────────────────────────────────

async function cocGet(urlPath, token, params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${COC_API}${urlPath}${qs ? '?' + qs : ''}`;
  const r   = await req(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (r.status === 403) return { _error: 'accessDenied' };
  if (r.status === 404) return { _error: 'notFound' };
  if (r.status === 503) return { _error: 'maintenance' };
  if (r.status === 429) {
    await new Promise(res => setTimeout(res, 1200));
    return cocGet(urlPath, token, params);
  }
  if (!r.ok) throw new Error(`CoC API ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

async function batchFetch(tags, fetchFn, batchSize = 5, delayMs = 350) {
  const out = {};
  for (let i = 0; i < tags.length; i += batchSize) {
    const batch   = tags.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fetchFn));
    settled.forEach((r, j) => {
      out[batch[j]] = r.status === 'fulfilled' ? r.value : { _error: r.reason?.message };
    });
    if (i + batchSize < tags.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return out;
}

// ── Analytics ───────────────────────────────────────────────────────────────

function computeAnalytics(memberItems, raidSeasons, cwlWars) {
  const analytics = {};

  for (const member of memberItems) {
    const tag = member.tag;

    // Raid stats
    // only seasons where the API returned per-member data count toward participation
    const trackableSeasons = raidSeasons.filter(s => (s.members ?? []).length > 0);
    const raidHistory = trackableSeasons.map(season => {
      const m = (season.members ?? []).find(m => m.tag === tag);
      return {
        startTime:        season.startTime,
        endTime:          season.endTime,
        attended:         !!m,
        attacks:          m?.attacks ?? 0,
        attackLimit:      m?.attackLimit ?? 5,
        bonusAttackLimit: m?.bonusAttackLimit ?? 0,
        loot:             m?.capitalResourcesLooted ?? 0,
      };
    });
    const attended     = raidHistory.filter(h => h.attended);
    const totalAttacks = attended.reduce((s, h) => s + h.attacks, 0);
    const totalLoot    = attended.reduce((s, h) => s + h.loot, 0);

    // CWL stats
    const cwlHistory = [];
    for (const [warTag, war] of Object.entries(cwlWars)) {
      if (!war || war._error) continue;
      const ourSide = [war.clan, war.opponent].find(c =>
        (c?.members ?? []).some(m => m.tag === tag)
      );
      if (!ourSide) continue;
      const mw = ourSide.members?.find(m => m.tag === tag);
      if (!mw) continue;
      const atks = mw.attacks ?? [];
      cwlHistory.push({
        warTag,
        attacksUsed: atks.length,
        stars:       atks.reduce((s, a) => s + a.stars, 0),
        destruction: atks.length ? atks.reduce((s, a) => s + a.destructionPercentage, 0) / atks.length : 0,
      });
    }

    const raidRate  = trackableSeasons.length ? attended.length / trackableSeasons.length : 0;
    const cwlAtkRate = cwlHistory.length ? cwlHistory.filter(h => h.attacksUsed > 0).length / cwlHistory.length : 0;

    analytics[tag] = {
      raids: {
        attended:     attended.length,
        total:        trackableSeasons.length,
        rate:         raidRate,
        totalAttacks, totalLoot,
        avgAttacks:   attended.length ? totalAttacks / attended.length : 0,
        history:      raidHistory,
      },
      cwl: {
        wars:     cwlHistory.length,
        attacks:  cwlHistory.reduce((s, h) => s + h.attacksUsed, 0),
        stars:    cwlHistory.reduce((s, h) => s + h.stars, 0),
        avgStars: cwlHistory.length ? cwlHistory.reduce((s, h) => s + h.stars, 0) / cwlHistory.length : 0,
        history:  cwlHistory,
      },
      activityScore: Math.round(raidRate * 60 + cwlAtkRate * 40),
    };
  }
  return analytics;
}

// ── History ─────────────────────────────────────────────────────────────────

// CoC times look like "20260808T000000.000Z" → "2026-08-08"
function cocDateKey(cocTime) {
  const m = String(cocTime ?? '').match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(cocTime ?? 'unknown');
}

function saveHistory(type, key, data) {
  const dir  = path.join(__dirname, '..', 'data', 'history', type);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${key}.json`);

  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Never overwrite a finished war with an in-progress one
    if (type === 'wars' && existing.state === 'warEnded' && data.state !== 'warEnded') return;
    // Never overwrite a raid snapshot that has more member detail
    if (type === 'raids' && (existing.members?.length ?? 0) > (data.members?.length ?? 0)) return;
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  ✓ history/${type}/${key}.json`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { COC_EMAIL, COC_PASSWORD, COC_CLAN_TAG } = process.env;
  if (!COC_EMAIL || !COC_PASSWORD || !COC_CLAN_TAG)
    throw new Error('Missing: COC_EMAIL, COC_PASSWORD, COC_CLAN_TAG');

  const token = await acquireToken(COC_EMAIL, COC_PASSWORD);
  const tag   = encodeURIComponent(COC_CLAN_TAG.startsWith('#') ? COC_CLAN_TAG : '#' + COC_CLAN_TAG);

  console.log('Fetching primary clan data...');
  const [clan, membersRes, war, warlog, cwlGroup, raidsRes] = await Promise.allSettled([
    cocGet(`/clans/${tag}`, token),
    cocGet(`/clans/${tag}/members`, token),
    cocGet(`/clans/${tag}/currentwar`, token),
    cocGet(`/clans/${tag}/warlog`, token, { limit: 20 }),
    cocGet(`/clans/${tag}/currentwar/leaguegroup`, token),
    cocGet(`/clans/${tag}/capitalraidseasons`, token, { limit: 12 }),
  ]);

  const ok   = s => s.status === 'fulfilled' ? s.value : { _error: s.reason?.message };
  const clanData    = ok(clan);
  const membersList = ok(membersRes);
  const warData     = ok(war);
  const warlogData  = ok(warlog);
  const cwlData     = ok(cwlGroup);
  const raidsData   = ok(raidsRes);

  const memberItems = membersList?.items ?? [];
  const raidSeasons = raidsData?.items  ?? [];

  // Fetch player profiles (batched, 5 at a time)
  console.log(`Fetching ${memberItems.length} player profiles...`);
  const profiles = await batchFetch(
    memberItems.map(m => m.tag),
    t => cocGet(`/players/${encodeURIComponent(t)}`, token),
    5, 350
  );

  // Fetch CWL war details
  const cwlWars = {};
  if (cwlData && !cwlData._error) {
    const warTags = (cwlData.rounds ?? [])
      .flatMap(r => r.warTags ?? [])
      .filter(t => t !== '#0');
    if (warTags.length > 0) {
      console.log(`Fetching ${warTags.length} CWL wars...`);
      for (const wt of warTags) {
        cwlWars[wt] = await cocGet(`/clanwarleagues/wars/${encodeURIComponent(wt)}`, token);
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  // Enrich members with profiles
  const enriched = memberItems.map(m => {
    const p = profiles[m.tag];
    if (!p || p._error) return { ...m, profile: null };
    return {
      ...m,
      profile: {
        warStars:     p.warStars     ?? 0,
        attackWins:   p.attackWins   ?? 0,
        defenseWins:  p.defenseWins  ?? 0,
        bestTrophies: p.bestTrophies ?? 0,
        expLevel:     p.expLevel     ?? 0,
        townHallWeaponLevel: p.townHallWeaponLevel ?? null,
        heroes: (p.heroes ?? [])
          .filter(h => h.village === 'home')
          .map(h => ({ name: h.name, level: h.level, maxLevel: h.maxLevel })),
      },
    };
  });

  // Compute analytics
  console.log('Computing analytics...');
  const analytics = computeAnalytics(enriched, raidSeasons, cwlWars);

  // ── Save history snapshots ────────────────────────────────────────────────
  console.log('Saving history snapshots...');

  // Raids: save every season that still has individual member data
  for (const season of raidSeasons) {
    if ((season.members ?? []).length > 0) {
      saveHistory('raids', cocDateKey(season.startTime), season);
    }
  }

  // Current war: save when active or finished (not "notInWar")
  if (warData && !warData._error && warData.state && warData.state !== 'notInWar') {
    const warKey = cocDateKey(warData.preparationStartTime ?? warData.startTime);
    saveHistory('wars', warKey, warData);
  }

  // CWL: save the full group + all resolved war details
  if (cwlData && !cwlData._error) {
    const cwlKey = cwlData.season ?? new Date().toISOString().slice(0, 7);
    saveHistory('cwl', cwlKey, {
      ...cwlData,
      wars: Object.values(cwlWars).filter(w => !w?._error),
    });
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    clan:        clanData,
    members:     { items: enriched },
    war:         warData,
    warlog:      warlogData,
    cwl:         { ...(cwlData && !cwlData._error ? cwlData : {}), wars: Object.values(cwlWars).filter(w => !w?._error) },
    raids:       raidsData,
    analytics,
  };

  const outPath = path.join(__dirname, '..', 'data', 'data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('✓ data/data.json geschrieben');
  console.log(`  Profile: ${enriched.filter(m=>m.profile).length}/${enriched.length}`);
  console.log(`  CWL-Kriege: ${Object.keys(cwlWars).length}`);
  console.log(`  Raid-Saisons: ${raidSeasons.length}`);
}

main().catch(err => { console.error('FEHLER:', err.message); process.exit(1); });
