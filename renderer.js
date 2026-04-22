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

/**
 * Load a JSON array stored at the given localStorage key, returning an empty array if the value is missing, not an array, or JSON parsing fails.
 * @param {string} key - The localStorage key to read.
 * @returns {Array} The parsed array, or an empty array on error.
 */
function loadStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

/**
 * Load and parse a JSON value from localStorage for the given key, returning `fallback` when the stored value is missing, null, or cannot be parsed.
 * @param {string} key - LocalStorage key to read.
 * @param {*} fallback - Value to return when no valid stored value exists.
 * @returns {*} The parsed stored value, or `fallback` if the key is absent, the stored value is `null`, or JSON parsing fails.
 */
function loadStoredObject(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
  } catch (_error) {
    return fallback;
  }
}

/**
 * Persist a value to localStorage under the given key by storing its JSON serialization.
 * @param {string} key - The storage key to write to.
 * @param {*} value - The value to serialize and save.
 */
function saveStoredValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Generate a unique tab identifier.
 * @returns {string} A unique tab id string in the format `tab-<timestamp>-<sequence>`.
 */
function nextTabId() {
  tabSequence += 1;
  return `tab-${Date.now()}-${tabSequence}`;
}

/**
 * Normalize address-bar input into a navigable URL.
 *
 * - Returns `about:blank` for empty or whitespace input.
 * - Returns the input unchanged if it already starts with `http://` or `https://`.
 * - If the input looks like a domain (contains a dot and no whitespace), prepends `https://`.
 * - Otherwise, returns a Google search URL for the input.
 *
 * @param {string} raw - Raw text entered in the address bar.
 * @returns {string} The normalized URL to navigate to.
 */
function parseInput(raw) {
  const value = (raw || '').trim();
  if (!value) return 'about:blank';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

/**
 * Determines whether a URL's hostname matches the configured ad-hosts pattern.
 * @param {string} url - The URL to check.
 * @returns {boolean} `true` if the URL's hostname matches the ad-hosts regex, `false` otherwise.
 */
function isAdUrl(url) {
  try {
    return AD_HOSTS_RE.test(new URL(url).hostname);
  } catch (_error) {
    return false;
  }
}

/**
 * Normalize a URL for display/storage by treating empty values and `about:blank` as an empty string.
 * @param {string} url - The URL to normalize.
 * @returns {string} An empty string when `url` is falsy or `about:blank`, otherwise the original `url`.
 */
function normalizeDisplayUrl(url) {
  if (!url || url === 'about:blank') return '';
  return url;
}

/**
 * Restore the previous browsing session by recreating tabs and selecting the active tab.
 *
 * Reads saved session data (tab URLs and active tab index) and creates a tab for each URL
 * (falling back to a single `https://google.com` if no saved tabs exist). After creating tabs,
 * selects the saved active tab index or the first tab when the saved index is invalid.
 */
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

/**
 * Persist the current browser session to storage.
 *
 * Saves an object containing `tabs` (array of normalized display URLs) and
 * `activeTabIndex` (the index of the active tab, clamped to zero if not found)
 * under the session storage key.
 */
function persistSession() {
  saveStoredValue(STORAGE_KEYS.session, {
    tabs: tabs.map((tab) => normalizeDisplayUrl(tab.url)),
    activeTabIndex: Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId)),
  });
}

/**
 * Create a new browser tab containing a webview, wire its events and UI, and persist the session.
 * @param {string} [url] - Initial URL or address-bar input; an empty string results in `about:blank`.
 * @param {Object} [options] - Options for tab creation.
 * @param {boolean} [options.switchTo=true] - When true (default), switch focus to the new tab; set to false to keep the current tab active.
 * @returns {string} The newly created tab's id.
 */
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

/**
 * Attach event handlers to a tab's webview to keep the tab state, UI, and persisted session in sync.
 *
 * Registers listeners that update loading state and progress UI, record history, synchronize navigation state and URL/title/favicon, update bookmark and tab elements, block or open external/ad URLs, and persist session changes.
 * @param {{id: string, webview: Element, title?: string, url?: string, favicon?: string, loading?: boolean}} tab - Tab object containing at minimum an `id` and its `webview` element.
 */
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

/**
 * Create a tab DOM element for a tab object, wire its click and close handlers, and insert it into the tab bar.
 *
 * The created element contains a favicon img, a title span, and a close button. Clicking the tab (except the close button)
 * activates the tab; clicking the close button closes it. The element is inserted into `tabBar` before `newTabBtn`.
 *
 * @param {{id: string}} tab - Tab object whose `id` is used as the element's `data-tab-id` and for event handlers.
 */
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

/**
 * Update the tab bar entry’s title and favicon for the tab with the given id.
 *
 * Updates the DOM .tab element's title text using the tab's title or, if missing,
 * the normalized display URL or "New Tab". Sets the favicon image src when available
 * and hides the favicon element when not. If the tab or its DOM element is not found,
 * the function is a no-op.
 * @param {string} id - Identifier of the tab to refresh in the tab bar.
 */
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

/**
 * Make the tab with the given id the active tab in the UI.
 *
 * Updates which webview is visible and which tab element is marked active, synchronizes the active-tab UI state, and persists the session.
 * @param {string} id - Identifier of the tab to activate.
 */
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

/**
 * Update the UI to reflect the specified tab's state.
 *
 * If the tab has no URL or is `about:blank`, shows the new tab page and clears the URL/security UI;
 * otherwise hides the new tab page and updates the URL/security UI for the tab's URL.
 * Also synchronizes navigation controls, bookmark button state, and the reload button.
 *
 * @param {string} id - The id of the tab whose UI should be synchronized.
 */
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

/**
 * Close and remove the tab with the given id, update closed-tab history, and adjust the active tab/session accordingly.
 * @param {string} id - The id of the tab to close; if no matching tab exists the function is a no-op.
 */
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

/**
 * Reopens the most recently closed tab by creating a new tab using its stored URL.
 *
 * If the stored entry has no URL, a blank tab is created. If there are no closed tabs saved, the function does nothing.
 */
function reopenClosedTab() {
  const previous = closedTabs.shift();
  if (previous) {
    createTab(previous.url || '');
  }
}

/**
 * Displays the new tab page and focuses its search input.
 *
 * Focus is applied shortly after the page is shown to ensure the input is ready.
 */
function showNewTabPage() {
  newtabEl.classList.add('active');
  setTimeout(() => newtabSearch.focus(), 60);
}

/**
 * Hides the new tab page.
 */
function hideNewTabPage() {
  newtabEl.classList.remove('active');
}

/**
 * Update the address bar value and set the security indicator text and color based on the URL scheme.
 * 
 * Sets the URL input's value to the provided string. If the URL starts with "https://", the security
 * indicator is set to "Secure" and colored with `var(--secure)`. If it starts with "http://", the
 * indicator is set to "Warning" and colored with `var(--warn)`. For any other value the indicator
 * is set to "Site" and its color is cleared.
 * @param {string} url - The display URL to show in the address bar.
 */
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

/**
 * Retrieve the currently active tab object.
 * @returns {{id: string, webview: HTMLElement, title: string, url: string, favicon?: string, loading: boolean}|null} The active tab object, or `null` if no tab is active.
 */
function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

/**
 * Retrieve the webview element belonging to the currently active tab.
 * @returns {HTMLElement|null} The active tab's webview element, or `null` if no active tab exists.
 */
function activeWV() {
  return activeTab()?.webview || null;
}

/**
 * Navigate the active tab to a parsed address-bar input or show the new-tab page.
 *
 * Parses the provided input (or the URL bar value when omitted) and navigates the currently active tab:
 * - If the parsed URL is `about:blank`, resets the tab to a new-tab state and shows the new-tab page.
 * - Otherwise, hides the new-tab page, sets the tab's URL and webview src, and updates the URL/security UI.
 * The function also persists the session, updates bookmark UI state, and blurs the URL bar.
 *
 * @param {string} [rawUrl] - Optional raw address-bar input; when omitted the current URL bar value is used.
 */
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

/**
 * Open the browser home page in the active tab.
 */
function goHome() {
  navigate('');
}

/**
 * Update the enabled/disabled state of the back and forward navigation buttons to reflect
 * whether the currently active webview can navigate backward or forward.
 *
 * If there is no active webview or querying its navigation state throws, both buttons are disabled.
 */
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

/**
 * Update the navigation reload button to reflect the active tab's loading state.
 *
 * Sets the button icon to a stop symbol (`✕`) when the active tab is loading, and to a reload symbol (`↻`) otherwise.
 */
function updateReloadButton() {
  const tab = activeTab();
  navReloadBtn.innerHTML = tab?.loading ? '&#10005;' : '&#8635;';
}

/**
 * Add the given tab's current page to the in-memory and persisted history list.
 *
 * If the tab's URL is an HTTP(S) address, the function removes any existing entry
 * with the same URL, prepends a new history entry containing `url`, `title`, and
 * `visitedAt` (current timestamp), truncates the list to `MAX_HISTORY_ITEMS`,
 * saves it to storage, and re-renders the history panel.
 *
 * @param {{url?: string, title?: string}} tab - Tab object whose `url` and optional `title` will be recorded.
 */
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

/**
 * Render the homepage shortcut tiles from saved bookmarks or default shortcuts.
 *
 * Builds and inserts a button tile for each bookmark (up to the configured maximum);
 * if there are no bookmarks, renders the predefined default shortcut set. Each tile
 * receives a click handler that navigates to its URL. Also updates the visible
 * bookmark count badge to reflect the total number of saved bookmarks.
 */
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

  bookmarkBadge.textContent = `${bookmarksState.length}`;
}

/**
 * Derives a short, display-friendly title from a URL's hostname.
 * @param {string} url - The input URL string.
 * @returns {string} The hostname with a leading `www.` removed (e.g., "example.com"), or `"Saved page"` if the input cannot be parsed as a URL.
 */
function shortTitleFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_error) {
    return 'Saved page';
  }
}

/**
 * Toggle the bookmark state for the currently active tab's page.
 *
 * If the active tab's URL uses the `http` or `https` scheme, this will remove
 * the bookmark if it already exists or add a new bookmark with `url`, `title`,
 * and `addedAt` timestamp. The bookmarks are persisted to storage and the
 * bookmark UI (shortcut tiles and bookmark button state) is updated.
 */
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

/**
 * Update the bookmark button UI to reflect whether the active tab's URL is saved.
 *
 * Sets the button's active state and label to "Saved" or "Save" based on whether
 * the active tab's URL exists in bookmarksState, and disables the button when
 * there is no valid http(s) URL for the active tab.
 */
function updateBookmarkState() {
  const tab = activeTab();
  const bookmarked = !!tab?.url && bookmarksState.some((item) => item.url === tab.url);
  bookmarkBtn.classList.toggle('active', bookmarked);
  bookmarkBtn.textContent = bookmarked ? 'Saved' : 'Save';
  bookmarkBtn.disabled = !tab?.url || !/^https?:\/\//i.test(tab.url);
}

/**
 * Populate the history side panel with clickable entries from the stored history.
 *
 * Creates a button for each entry showing the page title (or a short hostname) and a relative
 * visit time; clicking an entry navigates to that URL and closes the side panel.
 */
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

/**
 * Insert or update a download record in the downloads state, persist it, and refresh the downloads UI.
 *
 * The provided `download` is merged with any existing record with the same `id`; the merged record's
 * `updatedAt` is set to the current time. The downloads list is then sorted by newest `updatedAt`,
 * truncated to the configured maximum, saved to storage, and the downloads panel is re-rendered.
 *
 * @param {{id: string, [filePath]: string, [state]: string, [receivedBytes]: number, [totalBytes]: number, [name]: string, [updatedAt]?: number}} download - Download payload to upsert; must include `id`.
 */
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

/**
 * Rebuilds the downloads panel UI from the current downloads state.
 *
 * Clears the downloads list, shows or hides the empty placeholder based on whether there are downloads, and for each download creates a card that shows the file name, download state, a visual progress bar, and human-readable received/total byte counts. Each card's "Open" and "Folder" buttons invoke the corresponding window.electronAPI methods with the item's file path.
 */
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

/**
 * Subscribes to download events emitted by the renderer preload API.
 *
 * When a download event is received, the registered handler updates the persisted downloads list and its UI representation.
 */
function hookDownloadEvents() {
  window.electronAPI.onDownloadEvent((payload) => {
    upsertDownload(payload);
  });
}

/**
 * Toggle the side panel UI between closed, the history panel, or the downloads panel.
 *
 * Updates which panel is visible and sets the corresponding sidebar button active; requesting the currently open panel closes it.
 * @param {'history'|'downloads'|null} name - Panel to open; use `null` to close all panels.
 */
function togglePanel(name) {
  openPanel = openPanel === name ? null : name;
  historyPanel.classList.toggle('active', openPanel === 'history');
  downloadsPanel.classList.toggle('active', openPanel === 'downloads');
  sidePanelHost.classList.toggle('active', !!openPanel);
  historyBtn.classList.toggle('active', openPanel === 'history');
  downloadsBtn.classList.toggle('active', openPanel === 'downloads');
}

/**
 * Clears all recorded browsing history, persists the empty history to storage, and refreshes the history panel UI.
 */
function clearHistory() {
  historyState = [];
  saveStoredValue(STORAGE_KEYS.history, historyState);
  renderHistoryPanel();
}

/**
 * Remove all recorded downloads and update persistent storage.
 *
 * Clears the in-memory downloads list, saves the empty list to localStorage under the downloads key, and re-renders the downloads panel UI.
 */
function clearDownloads() {
  downloadsState = [];
  saveStoredValue(STORAGE_KEYS.downloads, downloadsState);
  renderDownloadsPanel();
}

/**
 * Format a past timestamp as a short relative time string.
 * @param {number} timestamp - Milliseconds since the Unix epoch representing the past time.
 * @returns {string} Relative time: `just now`, `Xm ago` (minutes), `Xh ago` (hours), or `Xd ago` (days).
 */
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

/**
 * Convert a byte count into a human-readable string using 1024-based units.
 * @param {number} bytes - Number of bytes to format.
 * @returns {string} Human-readable representation using `B`, `KB`, `MB`, or `GB` (e.g. `0 B`, `512 B`, `1.2 KB`, `150 MB`).
 */
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

/**
 * Periodically retrieves the number of blocked requests and updates the UI badge and counters.
 *
 * Fetches the blocked count from window.electronAPI.getBlockedCount(), updates `blockedEl` and
 * `newtabCount` with a localized number, and toggles the `#shield-badge` `.active` class when the
 * count is greater than zero. Any errors from the fetch are ignored. The function reschedules
 * itself to run again after 2000 milliseconds.
 */
async function pollBlockedCount() {
  try {
    const count = await window.electronAPI.getBlockedCount();
    blockedEl.textContent = count.toLocaleString();
    newtabCount.textContent = count.toLocaleString();
    document.getElementById('shield-badge').classList.toggle('active', count > 0);
  } catch (_error) {
    // Ignore polling errors while the window is closing.
  }

  setTimeout(pollBlockedCount, 2000);
}
