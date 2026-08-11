// Vercel Serverless Function: Proxies all Clash of Clans API requests.
// The API token never reaches the browser.
const https = require("https");

const COC_BASE = "https://api.clashofclans.com/v1";

// Allowed API sub-paths (whitelist to prevent open proxy abuse)
const ALLOWED_PATHS = [
  /^\/clans\/[^/]+$/,                              // clan info
  /^\/clans\/[^/]+\/members$/,                     // member list
  /^\/clans\/[^/]+\/currentwar$/,                  // current war
  /^\/clans\/[^/]+\/warlog$/,                      // war log
  /^\/clans\/[^/]+\/currentwar\/leaguegroup$/,     // CWL group
  /^\/clans\/[^/]+\/capitalraidseasons$/,          // raid seasons
];

function isAllowed(path) {
  return ALLOWED_PATHS.some((re) => re.test(path));
}

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  // Only GET allowed
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.COC_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "API token not configured" });
  }

  // ?path=/clans/%23ABC123/members
  const rawPath = req.query.path || "";

  if (!rawPath || !isAllowed(rawPath)) {
    return res.status(400).json({ error: "Invalid or disallowed path" });
  }

  // Forward optional query params (e.g. limit, after, before)
  const forwardParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== "path") forwardParams.append(key, value);
  }
  const qs = forwardParams.toString();
  const url = `${COC_BASE}${rawPath}${qs ? "?" + qs : ""}`;

  try {
    const { status, body } = await fetchJson(url, token);
    // Cache for 2 minutes on Vercel edge
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(status).json(body);
  } catch (err) {
    return res.status(502).json({ error: "Upstream request failed", detail: err.message });
  }
};
