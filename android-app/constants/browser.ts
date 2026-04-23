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

export function parseInput(raw: string): string {
  const value = raw.trim();
  if (!value) return 'about:blank';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function shortTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'Page';
  } catch {
    return 'Page';
  }
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isSecureUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

export function normalizeUrl(url: string): string {
  return url === 'about:blank' ? '' : url;
}
