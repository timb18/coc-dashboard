// ===== Chart management =====
const _charts = {};
function mkChart(id, cfg) {
  if (_charts[id]) _charts[id].destroy();
  const el = document.getElementById(id);
  if (!el) return;
  _charts[id] = new Chart(el, cfg);
}

// ===== Tab Logic =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ===== Helpers =====
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '–';
  const s = iso.replace(/^(\d{4})(\d{2})(\d{2})T.*$/, '$1-$2-$3');
  return new Date(s).toLocaleDateString('de-DE');
}

function rolePill(role) {
  const map = {
    leader:   ['Anführer',    'pill-leader'],
    coLeader: ['Co-Anführer', 'pill-coleader'],
    admin:    ['Ältester',    'pill-elder'],
    member:   ['Mitglied',    'pill-member'],
  };
  const [label, cls] = map[role] ?? [role, 'pill-member'];
  return `<span class="pill ${cls}">${label}</span>`;
}

function resultPill(result) {
  const map = { win: ['Sieg', 'pill-win'], lose: ['Niederlage', 'pill-loss'], tie: ['Unentschieden', 'pill-tie'] };
  const [label, cls] = map[result] ?? ['?', 'pill-tie'];
  return `<span class="pill ${cls}">${label}</span>`;
}

function errBox(msg) {
  return `<div class="error-msg">⚠ ${msg}</div>`;
}

function checkError(data) {
  if (!data) return 'Keine Daten vorhanden.';
  if (data._error === 'accessDenied' || data._error === 'privateWarLog')
    return 'Kriegslog ist privat – Daten nicht verfügbar.';
  if (data._error === 'notInWar' || data.state === 'notInWar')
    return 'Clan ist aktuell in keinem Krieg.';
  if (data._error === 'maintenance') return 'CoC-Server in Wartung – bitte später erneut laden.';
  if (data._error) return `Fehler: ${data._error}`;
  return null;
}

const CHART_SCALE = { grid: { color: '#30363d' } };

// ===== Render: Clan Overview =====
function renderClan(d) {
  const grid = document.getElementById('stats-grid');
  const desc = document.getElementById('clan-desc');
  const err  = checkError(d);
  if (err) { grid.innerHTML = errBox(err); return; }

  document.getElementById('clan-name').textContent = d.name ?? '–';
  document.getElementById('clan-tag').textContent  = d.tag  ?? '';

  if (d.badgeUrls?.medium) {
    const img = document.getElementById('clan-badge-img');
    img.src = d.badgeUrls.medium;
    img.style.display = 'block';
  }

  desc.textContent = d.description || 'Keine Beschreibung.';

  const stats = [
    { val: d.clanLevel           ?? '–', label: 'Clan-Level' },
    { val: d.members             ?? '–', label: 'Mitglieder' },
    { val: d.clanPoints          ?? '–', label: 'Clan-Punkte' },
    { val: d.clanBuilderBasePoints ?? d.clanVersusPoints ?? '–', label: 'Builder-Punkte' },
    { val: d.warWins             ?? '–', label: 'Kriegssiege' },
    { val: d.warTies             ?? '–', label: 'Unentschieden' },
    { val: d.warLosses           ?? '–', label: 'Niederlagen' },
    { val: d.warWinStreak        ?? '–', label: 'Siegesserie' },
    { val: d.warLeague?.name     ?? '–', label: 'Kriegs-Liga' },
    { val: d.capitalLeague?.name ?? '–', label: 'Capital-Liga' },
    { val: d.requiredTrophies    ?? '–', label: 'Min. Trophäen' },
  ];

  grid.innerHTML = stats.map(s =>
    `<div class="stat-item"><div class="val">${esc(String(s.val))}</div><div class="label">${s.label}</div></div>`
  ).join('');
}

// ===== Render: Members (Liga + Ratio) =====
function renderMembers(d) {
  const tbody = document.getElementById('members-body');
  const err   = checkError(d);
  if (err) { tbody.innerHTML = `<tr><td colspan="9">${errBox(err)}</td></tr>`; return; }

  const items = d.items ?? [];
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--muted);padding:1rem">Keine Mitglieder gefunden.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((m, i) => {
    const give    = m.donations ?? 0;
    const receive = m.donationsReceived ?? 0;
    const ratio   = receive === 0 ? give > 0 ? '∞' : '–' : (give / receive).toFixed(1);
    const ratioColor = receive === 0 ? 'var(--text)' : give / receive >= 1 ? 'var(--green)' : 'var(--red)';
    const leagueIcon = m.league?.iconUrls?.tiny
      ? `<img src="${m.league.iconUrls.tiny}" style="width:16px;height:16px;vertical-align:middle;margin-right:3px">`
      : '';
    const leagueName = m.league?.name ?? '–';
    return `
    <tr>
      <td style="color:var(--muted)">${i + 1}</td>
      <td><strong>${esc(m.name)}</strong><br/><span style="font-size:0.7rem;color:var(--muted)">${m.tag}</span></td>
      <td>${rolePill(m.role)}</td>
      <td>${m.townHallLevel ?? '–'}</td>
      <td>${(m.trophies ?? 0).toLocaleString('de-DE')}</td>
      <td>${leagueIcon}${esc(leagueName)}</td>
      <td style="color:var(--green)">${give.toLocaleString('de-DE')}</td>
      <td style="color:var(--red)">${receive.toLocaleString('de-DE')}</td>
      <td style="color:${ratioColor};font-weight:600">${ratio}</td>
    </tr>`;
  }).join('');
}

// ===== Render: Current War + Chart =====
function renderWar(d) {
  const container = document.getElementById('war-content');
  const err = checkError(d);
  if (err) {
    container.innerHTML = `<div style="color:var(--muted);text-align:center;padding:2rem">${err}</div>`;
    return;
  }

  const us        = d.clan;
  const them      = d.opponent;
  const maxAtt    = d.attacksPerMember ?? 2;
  const maxStars  = maxAtt * 3;
  const state     = { preparation: 'Vorbereitung', inWar: 'Im Krieg', warEnded: 'Beendet' }[d.state] ?? d.state;

  const tableMembers = (us.members ?? []).sort((a, b) => (a.mapPosition ?? 0) - (b.mapPosition ?? 0));

  const memberRows = tableMembers.map(m => {
    const attacks    = m.attacks ?? [];
    const totalStars = attacks.reduce((s, a) => s + a.stars, 0);
    const avgDest    = attacks.length
      ? (attacks.reduce((s, a) => s + a.destructionPercentage, 0) / attacks.length).toFixed(1)
      : '–';
    return `
    <tr>
      <td>${m.mapPosition}</td>
      <td><strong>${esc(m.name)}</strong></td>
      <td>${m.townhallLevel ?? '–'}</td>
      <td style="color:${attacks.length > 0 ? 'var(--green)' : 'var(--red)'}">
        ${attacks.length}/${maxAtt}
      </td>
      <td>${totalStars} ✦</td>
      <td>${avgDest}%</td>
    </tr>`;
  }).join('');

  const chartHeight = Math.max(200, tableMembers.length * 26 + 60);

  container.innerHTML = `
    <h2>Aktueller Krieg – ${state}</h2>
    <div class="stats-grid" style="margin-bottom:1rem">
      <div class="stat-item"><div class="val">${us.stars ?? 0} ✦</div><div class="label">Unsere Sterne</div></div>
      <div class="stat-item"><div class="val">${them.stars ?? 0} ✦</div><div class="label">Gegner-Sterne</div></div>
      <div class="stat-item"><div class="val">${(us.destructionPercentage ?? 0).toFixed(1)}%</div><div class="label">Zerstörung</div></div>
      <div class="stat-item"><div class="val">${(them.destructionPercentage ?? 0).toFixed(1)}%</div><div class="label">Gegner Zerstörung</div></div>
      <div class="stat-item"><div class="val">${d.teamSize ?? '–'}</div><div class="label">Teamgröße</div></div>
      <div class="stat-item"><div class="val">${fmtDate(d.startTime)}</div><div class="label">Startzeit</div></div>
    </div>

    <h3 style="color:var(--accent);font-size:0.85rem;margin-bottom:0.75rem;text-transform:uppercase">
      Angriffs-Auswertung – ${esc(us.name)} vs ${esc(them.name)}
    </h3>
    <div style="height:${chartHeight}px;margin-bottom:1.5rem">
      <canvas id="war-chart"></canvas>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>Pos</th><th>Name</th><th>TH</th><th>Angriffe</th><th>Sterne</th><th>Ø Zerstörung</th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>`;

  // Sort by stars DESC for chart readability
  const cm = [...tableMembers].sort((a, b) => {
    const sa = (a.attacks ?? []).reduce((s, atk) => s + atk.stars, 0);
    const sb = (b.attacks ?? []).reduce((s, atk) => s + atk.stars, 0);
    return sb - sa;
  });

  mkChart('war-chart', {
    type: 'bar',
    data: {
      labels: cm.map(m => m.name),
      datasets: [
        {
          label: 'Sterne ✦',
          data: cm.map(m => (m.attacks ?? []).reduce((s, a) => s + a.stars, 0)),
          backgroundColor: cm.map(m => {
            const used = (m.attacks ?? []).length;
            if (used === 0)       return '#f85149';
            if (used < maxAtt)    return '#d29922';
            return '#3fb950';
          }),
          borderRadius: 3,
        },
        {
          label: 'Nicht erreicht',
          data: cm.map(m => maxStars - (m.attacks ?? []).reduce((s, a) => s + a.stars, 0)),
          backgroundColor: '#21262d',
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#8b949e' } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}` } },
      },
      scales: {
        x: { ...CHART_SCALE, stacked: true, max: maxStars, ticks: { stepSize: 1, color: '#8b949e' } },
        y: { ...CHART_SCALE, stacked: true, ticks: { color: '#e6edf3' } },
      },
    },
  });
}

// ===== Render: War Log =====
function renderWarlog(d) {
  const tbody = document.getElementById('warlog-body');
  const err   = checkError(d);
  if (err) { tbody.innerHTML = `<tr><td colspan="6">${errBox(err)}</td></tr>`; return; }

  const items = d.items ?? [];
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--muted);padding:1rem">Kein öffentlicher Kriegslog.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(w => {
    const us   = w.clan;
    const them = w.opponent;
    return `
    <tr>
      <td>${fmtDate(w.endTime)}</td>
      <td>${esc(them?.name ?? '?')}</td>
      <td>${w.teamSize ?? '–'}v${w.teamSize ?? '–'}</td>
      <td>${us?.stars ?? 0} – ${them?.stars ?? 0}</td>
      <td>${(us?.destructionPercentage ?? 0).toFixed(1)}% – ${(them?.destructionPercentage ?? 0).toFixed(1)}%</td>
      <td>${resultPill(w.result)}</td>
    </tr>`;
  }).join('');
}

// ===== Render: CWL =====
function renderCwl(d) {
  const container = document.getElementById('cwl-content');
  const err = checkError(d);
  if (err) {
    container.innerHTML = `<div class="card" style="color:var(--muted);text-align:center;padding:2rem">${err}</div>`;
    return;
  }

  const seen    = new Set();
  const members = (d.clans ?? [])
    .flatMap(c => c.members ?? [])
    .filter(m => { if (seen.has(m.tag)) return false; seen.add(m.tag); return true; })
    .sort((a, b) => (b.townHallLevel ?? 0) - (a.townHallLevel ?? 0));

  const memberRows = members.map(m => `
    <tr>
      <td><strong>${esc(m.name)}</strong><br/><span style="font-size:0.7rem;color:var(--muted)">${m.tag}</span></td>
      <td>${m.townHallLevel ?? '–'}</td>
      <td>${m.trophies ?? '–'}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="card">
      <h2>CWL – ${d.season ?? 'Aktuell'} · ${d.state ?? ''}</h2>
      <div style="margin-bottom:1rem;color:var(--muted);font-size:0.85rem">
        Eingeteilte Mitglieder: <strong style="color:var(--text)">${members.length}</strong>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>TH</th><th>Trophäen</th></tr></thead>
          <tbody>${memberRows}</tbody>
        </table>
      </div>
    </div>`;
}

// ===== Render: Raids (Yearly Chart + Per-Season Chart) =====
let _raidSeasons = [];

function renderRaids(d) {
  const container = document.getElementById('raids-content');
  const yearly    = document.getElementById('raids-yearly');
  const err       = checkError(d);

  if (err) {
    yearly.innerHTML = '';
    container.innerHTML = `<div class="card" style="color:var(--muted);text-align:center;padding:2rem">${err}</div>`;
    return;
  }

  const seasons = d.items ?? [];
  _raidSeasons  = seasons;

  if (!seasons.length) {
    yearly.innerHTML = '';
    container.innerHTML = `<div class="card" style="color:var(--muted);text-align:center;padding:2rem">Keine Überfallwochenenden gefunden.</div>`;
    return;
  }

  // Yearly overview chart card
  yearly.innerHTML = `
    <div class="card">
      <h2>Jahresübersicht – Überfallwochenenden</h2>
      <div style="height:220px"><canvas id="raids-yearly-chart"></canvas></div>
    </div>`;

  // Season detail cards
  container.innerHTML = seasons.map((season, si) => {
    const members         = season.members ?? [];
    const notParticipated = (season.memberCount ?? 0) - members.length;
    const chartH          = Math.max(80, members.length * 22 + 40);

    const memberRows = [...members]
      .sort((a, b) => (b.capitalResourcesLooted ?? 0) - (a.capitalResourcesLooted ?? 0))
      .map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${esc(m.name)}</strong></td>
          <td style="color:var(--green)">${m.attacks ?? 0}/${m.attackLimit ?? 5}</td>
          <td style="color:var(--accent)">${(m.capitalResourcesLooted ?? 0).toLocaleString('de-DE')}</td>
        </tr>`).join('');

    return `
      <div class="card">
        <div class="season-header" onclick="toggleSeason(this, ${si})">
          <span>
            ${fmtDate(season.startTime)} – ${fmtDate(season.endTime)}
            &nbsp;<span class="pill ${season.state === 'ended' ? 'pill-win' : 'pill-member'}">${season.state === 'ended' ? 'Beendet' : season.state ?? '?'}</span>
          </span>
          <span style="color:var(--muted);font-size:0.8rem">
            ${members.length} Teilnehmer · ${(season.capitalTotalLoot ?? 0).toLocaleString('de-DE')} Gold ▾
          </span>
        </div>
        <div class="season-body${si === 0 ? ' open' : ''}">
          <div class="stats-grid" style="margin:0.5rem 0 1rem">
            <div class="stat-item"><div class="val">${season.totalAttacks ?? '–'}</div><div class="label">Angriffe</div></div>
            <div class="stat-item"><div class="val">${(season.capitalTotalLoot ?? 0).toLocaleString('de-DE')}</div><div class="label">Gold erbeutet</div></div>
            <div class="stat-item"><div class="val">${season.raidsCompleted ?? '–'}</div><div class="label">Raids abgeschlossen</div></div>
            <div class="stat-item"><div class="val">${members.length}</div><div class="label">Teilnehmer</div></div>
            <div class="stat-item"><div class="val" style="color:var(--red)">${notParticipated}</div><div class="label">Nicht dabei</div></div>
          </div>
          <div style="height:${chartH}px;margin-bottom:1rem">
            <canvas id="raid-chart-${si}"></canvas>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Name</th><th>Angriffe</th><th>Gold</th></tr></thead>
              <tbody>${memberRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }).join('');

  requestAnimationFrame(() => {
    renderYearlyRaidChart(seasons);
    renderRaidSeasonChart(0);
  });
}

function renderYearlyRaidChart(seasons) {
  const rev = [...seasons].reverse();
  mkChart('raids-yearly-chart', {
    data: {
      labels: rev.map(s => fmtDate(s.startTime)),
      datasets: [
        {
          type: 'bar',
          label: 'Teilnehmer',
          data: rev.map(s => (s.members ?? []).length),
          backgroundColor: '#f0a500',
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Gesamt-Angriffe',
          data: rev.map(s => s.totalAttacks ?? 0),
          borderColor: '#3fb950',
          backgroundColor: 'transparent',
          yAxisID: 'y2',
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#3fb950',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: '#8b949e' } } },
      scales: {
        x:  { ...CHART_SCALE, ticks: { color: '#8b949e' } },
        y:  { ...CHART_SCALE, ticks: { color: '#8b949e' }, title: { display: true, text: 'Teilnehmer', color: '#8b949e' } },
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#8b949e' }, title: { display: true, text: 'Angriffe', color: '#8b949e' } },
      },
    },
  });
}

function renderRaidSeasonChart(si) {
  const season = _raidSeasons[si];
  if (!season) return;
  const members = [...(season.members ?? [])].sort((a, b) => (b.attacks ?? 0) - (a.attacks ?? 0));

  mkChart(`raid-chart-${si}`, {
    type: 'bar',
    data: {
      labels: members.map(m => m.name),
      datasets: [{
        label: 'Angriffe',
        data: members.map(m => m.attacks ?? 0),
        backgroundColor: members.map(m => {
          const att   = m.attacks ?? 0;
          const limit = m.attackLimit ?? 5;
          if (att === 0)       return '#f85149';
          if (att < limit)     return '#d29922';
          return '#3fb950';
        }),
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...CHART_SCALE, max: 6, ticks: { stepSize: 1, color: '#8b949e' } },
        y: { ...CHART_SCALE, ticks: { color: '#e6edf3' } },
      },
    },
  });
}

function toggleSeason(header, si) {
  const body    = header.nextElementSibling;
  const wasOpen = body.classList.contains('open');
  body.classList.toggle('open');
  // Render chart on first open (lazy), resize if already rendered
  if (!wasOpen) {
    if (_charts[`raid-chart-${si}`]) _charts[`raid-chart-${si}`].resize();
    else renderRaidSeasonChart(si);
  }
}

// ===== Load =====
async function loadAll() {
  document.getElementById('last-updated').textContent = 'Lade...';

  try {
    // Cache-busting so the browser does not serve stale data after a GitHub Actions update
    const res  = await fetch(`./data/data.json?_=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    renderClan(data.clan);
    renderMembers(data.members);
    renderWar(data.war);
    renderWarlog(data.warlog);
    renderCwl(data.cwl);
    renderRaids(data.raids);

    const ts = data.lastUpdated
      ? new Date(data.lastUpdated).toLocaleString('de-DE')
      : '?';
    document.getElementById('last-updated').textContent = `Stand: ${ts}`;
  } catch (e) {
    document.getElementById('last-updated').textContent = 'Fehler beim Laden';
    document.getElementById('stats-grid').innerHTML = errBox(e.message);
  }
}

loadAll();
