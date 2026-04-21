// ─── State ────────────────────────────────────────────────────────────────────
let tabs = [];          // { id, webview, title, url, favicon }
let activeTabId = null;
let webviewPreloadPath = '';
let progressTimer = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const tabBar       = document.getElementById('tab-bar');
const newTabBtn    = document.getElementById('new-tab-btn');
const webviewsEl   = document.getElementById('webviews');
const urlBar       = document.getElementById('url-bar');
const securityIcon = document.getElementById('security-icon');
const spinner      = document.getElementById('loading-spinner');
const progressBar  = document.getElementById('progress-bar');
const blockedEl    = document.getElementById('blocked-count');
const newtabEl     = document.getElementById('newtab-page');
const newtabCount  = document.getElementById('newtab-count');
const newtabSearch = document.getElementById('newtab-search');

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  webviewPreloadPath = await window.electronAPI.getWebviewPreloadPath();
  createTab('https://google.com');
  pollBlockedCount();
})();

// ─── Smart URL parser ─────────────────────────────────────────────────────────
function parseInput(raw) {
  const v = raw.trim();
  if (!v) return 'about:blank';
  if (/^https?:\/\//i.test(v)) return v;
  // Has a dot and no spaces → treat as URL
  if (/^[^\s]+\.[^\s]+$/.test(v)) return 'https://' + v;
  // Otherwise → Google search
  return 'https://www.google.com/search?q=' + encodeURIComponent(v);
}

// ─── Tab creation ─────────────────────────────────────────────────────────────
function createTab(url = '') {
  const id = Date.now();

  // Create webview element
  const wv = document.createElement('webview');
  wv.setAttribute('preload', webviewPreloadPath);
  // Do NOT set allowpopups — popups are blocked by omitting the attribute
  wv.style.position = 'absolute';
  wv.style.inset    = '0';
  wv.style.width    = '100%';
  wv.style.height   = '100%';
  wv.style.display  = 'none';
  wv.style.border   = 'none';
  webviewsEl.appendChild(wv);

  const tabUrl = url && url !== 'about:blank' ? url : '';
  const tab = { id, webview: wv, title: 'New Tab', url: tabUrl, favicon: '' };
  tabs.push(tab);

  // ── Webview events ──
  wv.addEventListener('did-start-loading', () => {
    if (activeTabId !== id) return;
    spinner.classList.add('visible');
    progressBar.style.width = '20%';
    progressBar.classList.add('loading');
    progressTimer = setInterval(() => {
      const cur = parseFloat(progressBar.style.width) || 0;
      if (cur < 85) progressBar.style.width = (cur + (85 - cur) * 0.08) + '%';
    }, 300);
  });

  wv.addEventListener('did-stop-loading', () => {
    if (activeTabId !== id) return;
    clearInterval(progressTimer);
    spinner.classList.remove('visible');
    progressBar.style.width = '100%';
    setTimeout(() => { progressBar.classList.remove('loading'); progressBar.style.width = '0%'; }, 350);
  });

  wv.addEventListener('did-navigate', (e) => {
    tab.url = e.url;
    if (activeTabId === id) updateURLBar(e.url);
    updateTabEl(id);
  });

  wv.addEventListener('did-navigate-in-page', (e) => {
    if (!e.isMainFrame) return;
    tab.url = e.url;
    if (activeTabId === id) updateURLBar(e.url);
  });

  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title || 'Untitled';
    updateTabEl(id);
  });

  wv.addEventListener('page-favicon-updated', (e) => {
    tab.favicon = e.favicons?.[0] || '';
    updateTabEl(id);
  });

  // Block all new-window requests (popups)
  wv.addEventListener('new-window', (e) => {
    e.preventDefault?.();
    // If it looks like a legitimate link open, navigate current tab
    if (e.url && !isAdUrl(e.url)) {
      wv.src = e.url;
    }
  });

  // Block JS redirect attempts to ad domains
  wv.addEventListener('will-navigate', (e) => {
    if (isAdUrl(e.url)) {
      e.preventDefault?.();
    }
  });

  // Build tab element
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = id;
  tabEl.innerHTML = `
    <img class="tab-favicon" src="" style="display:none"/>
    <span class="tab-title">New Tab</span>
    <button class="tab-close" title="Close Tab">✕</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('tab-close')) switchTab(id);
  });
  tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(id);
  });
  tabBar.insertBefore(tabEl, newTabBtn);

  switchTab(id);

  if (url && url !== 'about:blank') {
    wv.src = url;
  }

  return id;
}

// ─── Tab switch ───────────────────────────────────────────────────────────────
function switchTab(id) {
  activeTabId = id;
  tabs.forEach(t => {
    t.webview.style.display = t.id === id ? 'flex' : 'none';
    document.querySelector(`.tab[data-tab-id="${t.id}"]`)?.classList.toggle('active', t.id === id);
  });

  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  if (!tab.url || tab.url === 'about:blank') {
    showNewtab(id);
    urlBar.value = '';
    securityIcon.textContent = '🌐';
  } else {
    newtabEl.classList.remove('active');
    updateURLBar(tab.url);
  }
}

// ─── Tab close ────────────────────────────────────────────────────────────────
function closeTab(id) {
  if (tabs.length === 1) { createTab(); }

  const idx = tabs.findIndex(t => t.id === id);
  const tab = tabs.splice(idx, 1)[0];
  tab.webview.remove();
  document.querySelector(`.tab[data-tab-id="${id}"]`)?.remove();

  if (activeTabId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    if (next) switchTab(next.id);
  }
}

// ─── Update tab DOM element ───────────────────────────────────────────────────
function updateTabEl(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  const el = document.querySelector(`.tab[data-tab-id="${id}"]`);
  if (!el) return;
  el.querySelector('.tab-title').textContent = tab.title || tab.url || 'New Tab';
  const favicon = el.querySelector('.tab-favicon');
  if (tab.favicon) { favicon.src = tab.favicon; favicon.style.display = 'block'; }
  else favicon.style.display = 'none';
}

// ─── New Tab page ─────────────────────────────────────────────────────────────
function showNewtab(id) {
  newtabEl.classList.add('active');
  setTimeout(() => newtabSearch.focus(), 100);
}

// ─── URL bar update ───────────────────────────────────────────────────────────
function updateURLBar(url) {
  urlBar.value = url;
  if (url.startsWith('https://')) {
    securityIcon.textContent = '🔒';
    securityIcon.style.color = 'var(--secure)';
  } else if (url.startsWith('http://')) {
    securityIcon.textContent = '⚠️';
    securityIcon.style.color = 'var(--warn)';
  } else {
    securityIcon.textContent = '🌐';
    securityIcon.style.color = '';
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(rawUrl) {
  const url = parseInput(rawUrl || urlBar.value);
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  newtabEl.classList.remove('active');
  tab.webview.src = url;
  urlBar.blur();
}

function activeWV() { return tabs.find(t => t.id === activeTabId)?.webview; }

document.getElementById('btn-back').addEventListener('click',    () => activeWV()?.goBack());
document.getElementById('btn-forward').addEventListener('click', () => activeWV()?.goForward());
document.getElementById('btn-home').addEventListener('click',    () => { showNewtab(activeTabId); urlBar.value = ''; });
document.getElementById('btn-reload').addEventListener('click',  () => {
  const wv = activeWV();
  if (wv) wv.isLoading?.() ? wv.stop() : wv.reload();
});

// ─── URL bar events ───────────────────────────────────────────────────────────
urlBar.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(); });
urlBar.addEventListener('focus',   () => urlBar.select());

// ─── New-Tab page search ──────────────────────────────────────────────────────
newtabSearch.addEventListener('keydown', e => {
  if (e.key === 'Enter') { navigate(newtabSearch.value); newtabSearch.value = ''; }
});

// ─── Shortcut tiles ───────────────────────────────────────────────────────────
document.querySelectorAll('.shortcut-tile').forEach(tile => {
  tile.addEventListener('click', () => navigate(tile.dataset.url));
});

// ─── New Tab button ───────────────────────────────────────────────────────────
newTabBtn.addEventListener('click', () => createTab());

// ─── Window controls ─────────────────────────────────────────────────────────
document.getElementById('btn-close').addEventListener('click',    () => window.electronAPI.close());
document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 't') { e.preventDefault(); createTab(); }
  if (ctrl && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
  if (ctrl && e.key === 'l') { e.preventDefault(); urlBar.focus(); urlBar.select(); }
  if (ctrl && e.key === 'r') { e.preventDefault(); activeWV()?.reload(); }
  if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); activeWV()?.goBack(); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); activeWV()?.goForward(); }
  if (e.key === 'Escape' && document.activeElement === urlBar) urlBar.blur();
});

// ─── Blocked count polling ────────────────────────────────────────────────────
async function pollBlockedCount() {
  try {
    const n = await window.electronAPI.getBlockedCount();
    blockedEl.textContent = n.toLocaleString();
    newtabCount.textContent = n.toLocaleString();
    const badge = document.getElementById('shield-badge');
    if (n > 0) badge.classList.add('active'); else badge.classList.remove('active');
  } catch(e) {}
  setTimeout(pollBlockedCount, 2000);
}

// ─── Ad URL checker (renderer-side quick check) ──────────────────────────────
const AD_HOSTS_RE = /doubleclick|googlesyndication|adnxs|taboola|outbrain|popads|popcash|propellerads|exoclick|trafficjunky|juicyads/i;
function isAdUrl(url) {
  try { return AD_HOSTS_RE.test(new URL(url).hostname); } catch(e) { return false; }
}