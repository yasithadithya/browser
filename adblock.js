const https = require('https');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ─── Hardcoded fallback (used immediately on launch) ──────────────────────────
const FALLBACK_DOMAINS = new Set([
  'doubleclick.net','googlesyndication.com','adnxs.com','amazon-adsystem.com',
  // NOTE: googletagmanager.com intentionally omitted — breaks YouTube & many sites
  'outbrain.com','taboola.com','adsrvr.org',
  'rubiconproject.com','pubmatic.com','openx.net','criteo.com',
  'scorecardresearch.com','quantserve.com','chartbeat.com','hotjar.com',
  'adroll.com','bidswitch.net','contextweb.com','sovrn.com',
  'doubleverify.com','moatads.com','rlcdn.com','cxense.com',
  'smartadserver.com','advertising.com','yieldmo.com','sharethrough.com',
  'adzerk.net','popads.net','popcash.net','propellerads.com','adcash.com',
  'revcontent.com','mgid.com','zergnet.com','trafficjunky.net',
  'juicyads.com','exoclick.com','media.net','spotxchange.com','teads.tv',
  'innovid.com','undertone.com','33across.com','mixpanel.com','segment.io',
  'fullstory.com','mouseflow.com','crazyegg.com','clicktale.com',
  'adf.ly','redirect.viglink.com','exitjunction.com','adtechjp.com',
  'anvato.com','traffichaus.com','ads.yahoo.com','ads.twitter.com',
  'ads.linkedin.com','connect.facebook.net',
  'adsafeprotected.com','lijit.com','springserve.com','bidscale.com',
  'adsymptotic.com','underdog.media','adskeeper.co.uk','adstargets.com',
  'yume.com','tidaltv.com','tremorvideo.com','videohub.tv',
  'omtrdc.net','demdex.net','turn.com','casalemedia.com',
  'indexexchange.com','triplelift.com','districtm.net','emxdgt.com',
  'lkqd.net','rhythmone.com','smaato.net','appnexus.com',
  'adform.net','adkernel.com','adtelligent.com','adhigh.net',
  'pagead2.googlesyndication.com','tpc.googlesyndication.com',
  'popunder.net','popadscdn.net','clickadu.com','hilltopads.net',
  'plugrush.com','popcpm.com','adspyglass.com','evadav.com',
  'richpush.co','kadam.net','adspree.io',
]);

// ─── State ────────────────────────────────────────────────────────────────────
let blockedDomains = new Set([...FALLBACK_DOMAINS]);
let blockedCount = 0;

// ─── EasyList URLs ────────────────────────────────────────────────────────────
const EASYLISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
];

// ─── Parse EasyList, extract blocked hostnames ────────────────────────────────
function parseEasyList(text) {
  const domains = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '!' || line[0] === '[' || line.startsWith('@@')) continue;
    if (line.includes('##') || line.includes('#@#') || line.includes('#?#')) continue;
    if (line.startsWith('||')) {
      const rest = line.slice(2);
      const end = rest.search(/[^a-zA-Z0-9.\-]/);
      if (end === -1 || rest[end] === '^') {
        const domain = (end > 0 ? rest.slice(0, end) : rest).toLowerCase();
        if (domain && domain.includes('.') && !domain.includes('*')) {
          domains.add(domain);
        }
      }
    }
  }
  return domains;
}

// ─── Fetch with timeout ───────────────────────────────────────────────────────
function fetchWithTimeout(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── Load EasyList (cache-first, background refresh) ─────────────────────────
async function loadEasyList() {
  const cacheFile = path.join(app.getPath('userData'), 'easylist-cache-v2.json');
  const CACHE_AGE = 24 * 60 * 60 * 1000; // 24 hours

  // Load cache immediately if fresh
  if (fs.existsSync(cacheFile)) {
    try {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_AGE) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        cached.forEach(d => blockedDomains.add(d));
        console.log(`[AdBlock] Loaded ${blockedDomains.size} domains from cache`);
        return; // Cache is fresh, skip fetch
      }
    } catch (e) { /* ignore bad cache */ }
  }

  // Fetch fresh EasyLists in background
  const fresh = new Set();
  for (const url of EASYLISTS) {
    try {
      const text = await fetchWithTimeout(url);
      const domains = parseEasyList(text);
      domains.forEach(d => fresh.add(d));
      console.log(`[AdBlock] Fetched ${domains.size} rules from ${url}`);
    } catch (e) {
      console.warn(`[AdBlock] Could not fetch ${url}: ${e.message}`);
    }
  }

  if (fresh.size > 0) {
    fresh.forEach(d => blockedDomains.add(d));
    try { fs.writeFileSync(cacheFile, JSON.stringify([...fresh])); } catch (e) {}
    console.log(`[AdBlock] Total blocked domains: ${blockedDomains.size}`);
  }
}

// ─── Hostname check (including parent domains) ────────────────────────────────
function isBlocked(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (blockedDomains.has(h)) return true;
  const parts = h.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (blockedDomains.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

// ─── Main setup ───────────────────────────────────────────────────────────────
function setupAdBlock(session) {
  // Start fetching EasyList in background
  loadEasyList().catch(e => console.warn('[AdBlock] EasyList load failed:', e.message));

  // Block ad/tracker requests at network level
  session.webRequest.onBeforeRequest((details, callback) => {
    try {
      const hostname = new URL(details.url).hostname;
      if (isBlocked(hostname)) {
        blockedCount++;
        return callback({ cancel: true });
      }
    } catch (e) { /* bad URL */ }
    callback({ cancel: false });
  });

  // Block HTTP redirect chains to ad domains
  // Use a separate onHeadersReceived ONLY for checking Location header redirects
  session.webRequest.onHeadersReceived((details, callback) => {
    try {
      const status = details.statusCode;
      if (status >= 300 && status < 400) {
        const hdrs = details.responseHeaders || {};
        const loc = (hdrs['location'] || hdrs['Location'] || [])[0];
        if (loc) {
          const redirectHost = new URL(loc).hostname;
          // Only cancel if redirecting TO a known pure-ad domain (not general sites)
          if (isBlocked(redirectHost)) {
            blockedCount++;
            return callback({ cancel: true });
          }
        }
      }
    } catch (e) { /* ignore bad URL */ }
    // Pass through unchanged
    callback({ cancel: false });
  });
}

function getBlockedCount() { return blockedCount; }

module.exports = { setupAdBlock, getBlockedCount };