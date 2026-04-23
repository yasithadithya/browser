const STORAGE_KEYS = {
  bookmarks: 'mybrowser.bookmarks',
  history: 'mybrowser.history',
  downloads: 'mybrowser.downloads',
  session: 'mybrowser.session',
};

const DEFAULT_SHORTCUTS = [
  { title: 'Google', icon: '&#128269;', url: 'https://google.com' },
  { title: 'YouTube', icon: '&#9654;', url: 'https://youtube.com' },
  { title: 'GitHub', icon: '&#60;&#47;&#62;', url: 'https://github.com' },
  { title: 'Reddit', icon: '&#128172;', url: 'https://reddit.com' },
  { title: 'Wikipedia', icon: '&#128214;', url: 'https://wikipedia.org' },
];

const MAX_HISTORY_ITEMS = 75;
const MAX_DOWNLOAD_ITEMS = 30;
const MAX_BOOKMARK_TILES = 8;
const AD_HOSTS_RE = /doubleclick|googlesyndication|adnxs|taboola|outbrain|popads|popcash|propellerads|exoclick|trafficjunky|juicyads/i;

let tabs = [];
let activeTabId = null;
let webviewPreloadPath = '';
let progressTimer = null;
let tabSequence = 0;
let historyState = loadStoredArray(STORAGE_KEYS.history);
let bookmarksState = loadStoredArray(STORAGE_KEYS.bookmarks);
let downloadsState = loadStoredArray(STORAGE_KEYS.downloads);
let closedTabs = [];
let openPanel = null;

const tabBar = document.getElementById('tab-bar');
const newTabBtn = document.getElementById('new-tab-btn');
const webviewsEl = document.getElementById('webviews');
const urlBar = document.getElementById('url-bar');
const securityIcon = document.getElementById('security-icon');
const spinner = document.getElementById('loading-spinner');
const progressBar = document.getElementById('progress-bar');
const blockedEl = document.getElementById('blocked-count');
const newtabEl = document.getElementById('newtab-page');
const newtabCount = document.getElementById('newtab-count');
const newtabSearch = document.getElementById('newtab-search');
const shortcutGrid = document.getElementById('shortcut-grid');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const downloadsPanel = document.getElementById('downloads-panel');
const downloadsList = document.getElementById('downloads-list');
const downloadsEmpty = document.getElementById('downloads-empty');
const historyBtn = document.getElementById('btn-history');
const downloadsBtn = document.getElementById('btn-downloads');
const bookmarkBtn = document.getElementById('btn-bookmark');
const bookmarkBadge = document.getElementById('bookmark-count');
const navBackBtn = document.getElementById('btn-back');
const navForwardBtn = document.getElementById('btn-forward');
const navReloadBtn = document.getElementById('btn-reload');
const sidePanelHost = document.getElementById('side-panels');
const clearHistoryBtn = document.getElementById('clear-history');
const clearDownloadsBtn = document.getElementById('clear-downloads');

(async () => {
  webviewPreloadPath = await window.electronAPI.getWebviewPreloadPath();
  hookDownloadEvents();
  restoreSession();
  renderShortcutTiles();
  renderHistoryPanel();
  renderDownloadsPanel();
  updateBookmarkState();
  pollBlockedCount();
})();

function loadStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

function loadStoredObject(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
  } catch (_error) {
    return fallback;
  }
}

function saveStoredValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nextTabId() {
  tabSequence += 1;
  return `tab-${Date.now()}-${tabSequence}`;
}

function parseInput(raw) {
  const value = (raw || '').trim();
  if (!value) return 'about:blank';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function isAdUrl(url) {
  try {
    return AD_HOSTS_RE.test(new URL(url).hostname);
  } catch (_error) {
    return false;
  }
}

function normalizeDisplayUrl(url) {
  if (!url || url === 'about:blank') return '';
  return url;
}

function restoreSession() {
  const saved = loadStoredObject(STORAGE_KEYS.session, null);
  const urls = Array.isArray(saved?.tabs) && saved.tabs.length ? saved.tabs : ['https://google.com'];

  urls.forEach((url, index) => {
    createTab(url, { switchTo: false });
    if (url) {
      const tab = tabs[index];
      tab.url = url;
    }
  });

  const activeIndex = Number.isInteger(saved?.activeTabIndex) ? saved.activeTabIndex : 0;
  const candidateTab = tabs[activeIndex] || tabs[0];
  switchTab(candidateTab?.id);
}

function persistSession() {
  saveStoredValue(STORAGE_KEYS.session, {
    tabs: tabs.map((tab) => normalizeDisplayUrl(tab.url)),
    activeTabIndex: Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId)),
  });
}

function createTab(url = '', options = {}) {
  const id = nextTabId();
  const tabUrl = normalizeDisplayUrl(url);
  const webview = document.createElement('webview');
  webview.setAttribute('preload', webviewPreloadPath);
  webview.style.position = 'absolute';
  webview.style.inset = '0';
  webview.style.width = '100%';
  webview.style.height = '100%';
  webview.style.display = 'none';
  webview.style.border = 'none';
  webviewsEl.appendChild(webview);

  const tab = {
    id,
    webview,
    title: 'New Tab',
    url: tabUrl,
    favicon: '',
    loading: false,
  };
  tabs.push(tab);

  attachWebviewEvents(tab);
  buildTabElement(tab);

  if (options.switchTo !== false) {
    switchTab(id);
  }

  if (tabUrl) {
    webview.src = tabUrl;
  } else {
    webview.src = 'about:blank';
  }

  persistSession();
  return id;
}

function attachWebviewEvents(tab) {
  const { id, webview } = tab;

  webview.addEventListener('did-start-loading', () => {
    tab.loading = true;
    if (activeTabId !== id) return;
    spinner.classList.add('visible');
    progressBar.style.width = '20%';
    progressBar.classList.add('loading');
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      const currentWidth = parseFloat(progressBar.style.width) || 0;
      if (currentWidth < 85) {
        progressBar.style.width = `${currentWidth + (85 - currentWidth) * 0.08}%`;
      }
    }, 300);
    updateReloadButton();
  });

  webview.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    if (activeTabId === id) {
      clearInterval(progressTimer);
      spinner.classList.remove('visible');
      progressBar.style.width = '100%';
      setTimeout(() => {
        progressBar.classList.remove('loading');
        progressBar.style.width = '0%';
      }, 350);
      syncNavigationState();
      updateReloadButton();
    }
    recordHistory(tab);
  });

  webview.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) return;
    tab.loading = false;
    tab.title = 'Page failed to load';
    updateTabEl(id);
    if (activeTabId === id) {
      spinner.classList.remove('visible');
      progressBar.classList.remove('loading');
      progressBar.style.width = '0%';
      updateReloadButton();
    }
  });

  webview.addEventListener('did-navigate', (event) => {
    tab.url = event.url;
    syncActiveTabUi(id);
    persistSession();
  });

  webview.addEventListener('did-navigate-in-page', (event) => {
    if (!event.isMainFrame) return;
    tab.url = event.url;
    syncActiveTabUi(id);
    persistSession();
  });

  webview.addEventListener('page-title-updated', (event) => {
    tab.title = event.title || 'Untitled';
    updateTabEl(id);
    if (activeTabId === id) updateBookmarkState();
  });

  webview.addEventListener('page-favicon-updated', (event) => {
    tab.favicon = event.favicons?.[0] || '';
    updateTabEl(id);
  });

  webview.addEventListener('dom-ready', () => {
    syncNavigationState();
  });

  webview.addEventListener('new-window', (event) => {
    event.preventDefault?.();
    if (event.url && !isAdUrl(event.url)) {
      createTab(event.url);
    }
  });

  webview.addEventListener('will-navigate', (event) => {
    if (isAdUrl(event.url)) {
      event.preventDefault?.();
    }
  });
}

function buildTabElement(tab) {
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = tab.id;
  tabEl.innerHTML = `
    <img class="tab-favicon" src="" alt="" style="display:none"/>
    <span class="tab-title">New Tab</span>
    <button class="tab-close" title="Close tab" aria-label="Close tab">x</button>
  `;

  tabEl.addEventListener('click', (event) => {
    if (!event.target.classList.contains('tab-close')) {
      switchTab(tab.id);
    }
  });

  tabEl.querySelector('.tab-close').addEventListener('click', (event) => {
    event.stopPropagation();
    closeTab(tab.id);
  });

  tabBar.insertBefore(tabEl, newTabBtn);
}

function updateTabEl(id) {
  const tab = tabs.find((item) => item.id === id);
  const tabEl = document.querySelector(`.tab[data-tab-id="${id}"]`);
  if (!tab || !tabEl) return;

  tabEl.querySelector('.tab-title').textContent = tab.title || normalizeDisplayUrl(tab.url) || 'New Tab';
  const favicon = tabEl.querySelector('.tab-favicon');
  if (tab.favicon) {
    favicon.src = tab.favicon;
    favicon.style.display = 'block';
  } else {
    favicon.style.display = 'none';
  }
}

function switchTab(id) {
  activeTabId = id;

  tabs.forEach((tab) => {
    const isActive = tab.id === id;
    tab.webview.style.display = isActive ? 'flex' : 'none';
    document.querySelector(`.tab[data-tab-id="${tab.id}"]`)?.classList.toggle('active', isActive);
  });

  syncActiveTabUi(id);
  persistSession();
}

function syncActiveTabUi(id) {
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;

  if (!tab.url || tab.url === 'about:blank') {
    showNewTabPage();
    urlBar.value = '';
    securityIcon.textContent = 'Site';
    securityIcon.style.color = '';
  } else {
    hideNewTabPage();
    updateURLBar(tab.url);
  }

  syncNavigationState();
  updateBookmarkState();
  updateReloadButton();
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const [tab] = tabs.splice(index, 1);
  if (tab.url) {
    closedTabs.unshift({ url: tab.url, title: tab.title });
    closedTabs = closedTabs.slice(0, 10);
  }

  tab.webview.remove();
  document.querySelector(`.tab[data-tab-id="${id}"]`)?.remove();

  if (!tabs.length) {
    createTab();
    return;
  }

  if (activeTabId === id) {
    const nextTab = tabs[Math.min(index, tabs.length - 1)];
    if (nextTab) {
      switchTab(nextTab.id);
    }
  }

  persistSession();
}

function reopenClosedTab() {
  const previous = closedTabs.shift();
  if (previous) {
    createTab(previous.url || '');
  }
}

function showNewTabPage() {
  newtabEl.classList.add('active');
  setTimeout(() => newtabSearch.focus(), 60);
}

function hideNewTabPage() {
  newtabEl.classList.remove('active');
}

function updateURLBar(url) {
  urlBar.value = url;
  if (url.startsWith('https://')) {
    securityIcon.textContent = 'Secure';
    securityIcon.style.color = 'var(--secure)';
  } else if (url.startsWith('http://')) {
    securityIcon.textContent = 'Warning';
    securityIcon.style.color = 'var(--warn)';
  } else {
    securityIcon.textContent = 'Site';
    securityIcon.style.color = '';
  }
}

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function activeWV() {
  return activeTab()?.webview || null;
}

function navigate(rawUrl) {
  const url = parseInput(rawUrl || urlBar.value);
  const tab = activeTab();
  if (!tab) return;

  if (url === 'about:blank') {
    tab.url = '';
    tab.title = 'New Tab';
    tab.favicon = '';
    tab.webview.src = 'about:blank';
    updateTabEl(tab.id);
    showNewTabPage();
    urlBar.value = '';
  } else {
    hideNewTabPage();
    tab.url = url;
    tab.webview.src = url;
    updateURLBar(url);
  }

  persistSession();
  updateBookmarkState();
  urlBar.blur();
}

function goHome() {
  navigate('');
}

function syncNavigationState() {
  const webview = activeWV();
  if (!webview) {
    navBackBtn.disabled = true;
    navForwardBtn.disabled = true;
    return;
  }

  try {
    navBackBtn.disabled = !webview.canGoBack();
    navForwardBtn.disabled = !webview.canGoForward();
  } catch (_error) {
    navBackBtn.disabled = true;
    navForwardBtn.disabled = true;
  }
}

function updateReloadButton() {
  const tab = activeTab();
  navReloadBtn.innerHTML = tab?.loading ? '&#10005;' : '&#8635;';
}

function recordHistory(tab) {
  if (!tab.url || !/^https?:\/\//i.test(tab.url)) return;

  historyState = historyState.filter((item) => item.url !== tab.url);
  historyState.unshift({
    url: tab.url,
    title: tab.title || tab.url,
    visitedAt: Date.now(),
  });
  historyState = historyState.slice(0, MAX_HISTORY_ITEMS);
  saveStoredValue(STORAGE_KEYS.history, historyState);
  renderHistoryPanel();
}

function renderShortcutTiles() {
  const bookmarkTiles = bookmarksState
    .slice(0, MAX_BOOKMARK_TILES)
    .map((item) => ({
      title: item.title || shortTitleFromUrl(item.url),
      icon: '&#9733;',
      url: item.url,
      bookmarked: true,
    }));

  const tiles = bookmarkTiles.length ? bookmarkTiles : DEFAULT_SHORTCUTS;

  shortcutGrid.innerHTML = '';
  tiles.forEach((item) => {
    const tile = document.createElement('button');
    tile.className = 'shortcut-tile';
    tile.type = 'button';
    tile.dataset.url = item.url;
    tile.innerHTML = `
      <span class="shortcut-icon">${item.icon}</span>
      <span class="shortcut-label">${item.title}</span>
    `;
    tile.addEventListener('click', () => navigate(item.url));
    shortcutGrid.appendChild(tile);
  });

  if (bookmarkBadge) bookmarkBadge.textContent = `${bookmarksState.length}`;
}

function shortTitleFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_error) {
    return 'Saved page';
  }
}

function toggleBookmark() {
  const tab = activeTab();
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) return;

  const existingIndex = bookmarksState.findIndex((item) => item.url === tab.url);
  if (existingIndex >= 0) {
    bookmarksState.splice(existingIndex, 1);
  } else {
    bookmarksState.unshift({
      url: tab.url,
      title: tab.title || shortTitleFromUrl(tab.url),
      addedAt: Date.now(),
    });
  }

  saveStoredValue(STORAGE_KEYS.bookmarks, bookmarksState);
  renderShortcutTiles();
  updateBookmarkState();
}

function updateBookmarkState() {
  const tab = activeTab();
  const bookmarked = !!tab?.url && bookmarksState.some((item) => item.url === tab.url);
  bookmarkBtn.classList.toggle('active', bookmarked);
  bookmarkBtn.textContent = bookmarked ? 'Saved' : 'Save';
  bookmarkBtn.disabled = !tab?.url || !/^https?:\/\//i.test(tab.url);
}

function renderHistoryPanel() {
  historyList.innerHTML = '';
  historyEmpty.hidden = historyState.length > 0;

  historyState.forEach((item) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'panel-item';
    row.innerHTML = `
      <span class="panel-item-title">${item.title || shortTitleFromUrl(item.url)}</span>
      <span class="panel-item-meta">${shortTitleFromUrl(item.url)} - ${formatRelativeTime(item.visitedAt)}</span>
    `;
    row.addEventListener('click', () => {
      navigate(item.url);
      togglePanel(null);
    });
    historyList.appendChild(row);
  });
}

function upsertDownload(download) {
  const existingIndex = downloadsState.findIndex((item) => item.id === download.id);
  const nextItem = {
    ...downloadsState[existingIndex],
    ...download,
    updatedAt: Date.now(),
  };

  if (existingIndex >= 0) {
    downloadsState.splice(existingIndex, 1, nextItem);
  } else {
    downloadsState.unshift(nextItem);
  }

  downloadsState = downloadsState
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, MAX_DOWNLOAD_ITEMS);

  saveStoredValue(STORAGE_KEYS.downloads, downloadsState);
  renderDownloadsPanel();
}

function renderDownloadsPanel() {
  downloadsList.innerHTML = '';
  downloadsEmpty.hidden = downloadsState.length > 0;

  downloadsState.forEach((item) => {
    const progress = item.totalBytes > 0 ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100)) : 0;
    const row = document.createElement('div');
    row.className = 'download-card';
    row.innerHTML = `
      <div class="download-header">
        <span class="download-title">${item.fileName || 'Download'}</span>
        <span class="download-state">${item.state || 'pending'}</span>
      </div>
      <div class="download-progress-track">
        <div class="download-progress-fill" style="width:${progress}%"></div>
      </div>
      <div class="download-meta">${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}</div>
      <div class="download-actions">
        <button type="button" class="download-action open-file">Open</button>
        <button type="button" class="download-action show-folder">Folder</button>
      </div>
    `;

    row.querySelector('.open-file').addEventListener('click', () => {
      window.electronAPI.openDownload(item.filePath);
    });
    row.querySelector('.show-folder').addEventListener('click', () => {
      window.electronAPI.showDownloadInFolder(item.filePath);
    });

    downloadsList.appendChild(row);
  });
}

function hookDownloadEvents() {
  window.electronAPI.onDownloadEvent((payload) => {
    upsertDownload(payload);
  });
}

function togglePanel(name) {
  openPanel = openPanel === name ? null : name;
  historyPanel.classList.toggle('active', openPanel === 'history');
  downloadsPanel.classList.toggle('active', openPanel === 'downloads');
  sidePanelHost.classList.toggle('active', !!openPanel);
  historyBtn.classList.toggle('active', openPanel === 'history');
  downloadsBtn.classList.toggle('active', openPanel === 'downloads');
}

function clearHistory() {
  historyState = [];
  saveStoredValue(STORAGE_KEYS.history, historyState);
  renderHistoryPanel();
}

function clearDownloads() {
  downloadsState = [];
  saveStoredValue(STORAGE_KEYS.downloads, downloadsState);
  renderDownloadsPanel();
}

function formatRelativeTime(timestamp) {
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

navBackBtn.addEventListener('click', () => activeWV()?.goBack());
navForwardBtn.addEventListener('click', () => activeWV()?.goForward());
document.getElementById('btn-home').addEventListener('click', goHome);
navReloadBtn.addEventListener('click', () => {
  const webview = activeWV();
  if (!webview) return;
  if (activeTab()?.loading) webview.stop();
  else webview.reload();
});

bookmarkBtn.addEventListener('click', toggleBookmark);
historyBtn.addEventListener('click', () => togglePanel('history'));
downloadsBtn.addEventListener('click', () => togglePanel('downloads'));
clearHistoryBtn.addEventListener('click', clearHistory);
clearDownloadsBtn.addEventListener('click', clearDownloads);

urlBar.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') navigate();
});
urlBar.addEventListener('focus', () => urlBar.select());

newtabSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    navigate(newtabSearch.value);
    newtabSearch.value = '';
  }
});

newTabBtn.addEventListener('click', () => createTab());

document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());
document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());

document.addEventListener('keydown', (event) => {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.key.toLowerCase() === 't') {
    event.preventDefault();
    createTab();
  }
  if (ctrl && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    closeTab(activeTabId);
  }
  if (ctrl && event.shiftKey && event.key.toLowerCase() === 't') {
    event.preventDefault();
    reopenClosedTab();
  }
  if (ctrl && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    urlBar.focus();
    urlBar.select();
  }
  if (ctrl && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    activeWV()?.reload();
  }
  if (ctrl && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    toggleBookmark();
  }
  if (ctrl && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    togglePanel('history');
  }
  if (ctrl && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    togglePanel('downloads');
  }
  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault();
    activeWV()?.goBack();
  }
  if (event.altKey && event.key === 'ArrowRight') {
    event.preventDefault();
    activeWV()?.goForward();
  }
  if (event.key === 'Escape') {
    if (document.activeElement === urlBar) urlBar.blur();
    togglePanel(null);
  }
});

window.addEventListener('beforeunload', persistSession);

async function pollBlockedCount() {
  try {
    const count = await window.electronAPI.getBlockedCount();
    blockedEl.textContent = count.toLocaleString();
    if (newtabCount) newtabCount.textContent = count.toLocaleString();
    document.getElementById('shield-badge').classList.toggle('active', count > 0);
  } catch (_error) {
    // Ignore polling errors while the window is closing.
  }

  setTimeout(pollBlockedCount, 2000);
}
