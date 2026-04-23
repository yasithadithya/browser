export const STORAGE_KEYS = {
  bookmarks: 'mybrowser.bookmarks',
  history: 'mybrowser.history',
  session: 'mybrowser.session',
} as const;

export const MAX_HISTORY_ITEMS = 75;

export const AD_HOSTS_RE =
  /doubleclick|googlesyndication|adnxs|taboola|outbrain|popads|popcash|propellerads|exoclick|trafficjunky|juicyads/i;

export type BrowserTab = {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  progress: number;
};

export type BookmarkEntry = {
  url: string;
  title: string;
  addedAt: number;
};

export type HistoryEntry = {
  url: string;
  title: string;
  visitedAt: number;
};

export type BrowserSession = {
  tabs: Array<Pick<BrowserTab, 'url' | 'title'>>;
  activeTabIndex: number;
};

export const DEFAULT_SHORTCUTS = [
  { title: 'Google', url: 'https://google.com', icon: 'search' },
  { title: 'YouTube', url: 'https://youtube.com', icon: 'smart-display' },
  { title: 'GitHub', url: 'https://github.com', icon: 'code' },
  { title: 'Reddit', url: 'https://reddit.com', icon: 'forum' },
  { title: 'Wikipedia', url: 'https://wikipedia.org', icon: 'menu-book' },
] as const;

/**
 * Convert raw user input into a navigable URL or a Google search URL.
 *
 * Trims the input and maps it to a proper URL:
 * - empty input -> `about:blank`
 * - input starting with `http://` or `https://` -> returned unchanged
 * - bare domain-like input (contains a dot, no spaces) -> prefixed with `https://`
 * - otherwise -> converted to a Google search URL with the input URL-encoded
 *
 * @param raw - The raw input string provided by the user
 * @returns A string containing the resulting URL (`about:blank`, a full URL, or a Google search URL)
 */
export function parseInput(raw: string): string {
  const value = raw.trim();
  if (!value) return 'about:blank';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

/**
 * Derives a short, user-facing title from a URL's hostname.
 *
 * Strips a leading `www.` from the hostname and returns it; if the input cannot be parsed
 * as a URL or the hostname is empty, returns `'Page'`.
 *
 * @param url - The URL string to extract a short title from
 * @returns The hostname without a leading `www.`, or `'Page'` when no valid hostname is available
 */
export function shortTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'Page';
  } catch {
    return 'Page';
  }
}

/**
 * Determines whether a string is an HTTP or HTTPS URL.
 *
 * @returns `true` if the string starts with `http://` or `https://` (case-insensitive), `false` otherwise.
 */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Checks whether a URL uses the HTTPS scheme.
 *
 * @returns `true` if the URL starts with `https://`, `false` otherwise.
 */
export function isSecureUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/**
 * Convert the special `about:blank` page identifier to an empty string.
 *
 * @returns The empty string if `url` equals `'about:blank'`, otherwise the original `url`.
 */
export function normalizeUrl(url: string): string {
  return url === 'about:blank' ? '' : url;
}
