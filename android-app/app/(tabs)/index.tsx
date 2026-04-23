import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import {
  AD_HOSTS_RE,
  DEFAULT_SHORTCUTS,
  type BookmarkEntry,
  type BrowserSession,
  type BrowserTab,
  type HistoryEntry,
  MAX_HISTORY_ITEMS,
  STORAGE_KEYS,
  isHttpUrl,
  isSecureUrl,
  normalizeUrl,
  parseInput,
  shortTitleFromUrl,
} from '@/constants/browser';

const MAX_TABS = 8;

type StartLoadRequest = Parameters<
  NonNullable<ComponentProps<typeof WebView>['onShouldStartLoadWithRequest']>
>[0];

type ShortcutTile = {
  title: string;
  url: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
};

/**
 * Parse a JSON string and return it only if it is an array; otherwise return an empty array.
 *
 * @param value - The stored JSON string (or `null`) to parse
 * @returns The parsed array of `T` if parsing succeeds and the value is an array; otherwise an empty array
 */
function parseStoredArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Parse a stored session JSON string and return a validated BrowserSession.
 *
 * @param value - The raw JSON string retrieved from storage, or `null`
 * @returns The parsed `BrowserSession` if `value` contains valid JSON with a `tabs` array, `null` otherwise
 */
function parseStoredSession(value: string | null): BrowserSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as BrowserSession;
    if (!Array.isArray(parsed?.tabs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Creates a BrowserTab initialized for a new or restored tab with a normalized URL and default navigation/loading state.
 *
 * @param id - Unique identifier for the tab.
 * @param url - Initial URL or raw input for the tab; may be empty to represent a new tab.
 * @returns The initialized BrowserTab with a normalized `url`, a derived `title` (falls back to `"New Tab"`), `canGoBack`/`canGoForward` set to `false`, `loading` set to `false`, and `progress` set to `0`.
 */
function makeTab(id: string, url: string): BrowserTab {
  const normalized = normalizeUrl(url);
  return {
    id,
    url: normalized,
    title: normalized ? shortTitleFromUrl(normalized) : 'New Tab',
    canGoBack: false,
    canGoForward: false,
    loading: false,
    progress: 0,
  };
}

/**
 * Renders the in-app tabbed browser screen, including the address bar, tab strip, navigation controls,
 * layered WebViews, new-tab page with shortcuts, and bookmark/history management.
 *
 * @returns The React element representing the browser screen UI.
 */
export default function BrowserScreen() {
  const params = useLocalSearchParams<{ open?: string | string[]; t?: string | string[] }>();

  const webViewRefs = useRef<Record<string, WebView | null>>({});
  const tabCounterRef = useRef(0);
  const hydratedRef = useRef(false);
  const paramHandledRef = useRef<string>('');

  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [addressBar, setAddressBar] = useState('');
  const [isAddressFocused, setIsAddressFocused] = useState(false);
  const [newTabSearch, setNewTabSearch] = useState('');

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const secureState = useMemo(() => {
    if (!activeTab?.url) return { label: 'Site', color: '#8b9eb7' };
    if (isSecureUrl(activeTab.url)) return { label: 'Secure', color: '#34c759' };
    if (isHttpUrl(activeTab.url)) return { label: 'Warning', color: '#ffcc00' };
    return { label: 'Site', color: '#8b9eb7' };
  }, [activeTab?.url]);

  const activeIsBookmarked = useMemo(() => {
    if (!activeTab?.url || !isHttpUrl(activeTab.url)) return false;
    return bookmarks.some((item) => item.url === activeTab.url);
  }, [bookmarks, activeTab?.url]);

  const quickTiles = useMemo<ShortcutTile[]>(() => {
    if (!bookmarks.length) {
      return DEFAULT_SHORTCUTS.map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
      }));
    }

    return bookmarks.slice(0, 8).map((item) => ({
      title: item.title || shortTitleFromUrl(item.url),
      url: item.url,
      icon: 'star',
    }));
  }, [bookmarks]);

  useEffect(() => {
    const bootstrap = async () => {
      const result = await AsyncStorage.multiGet([
        STORAGE_KEYS.session,
        STORAGE_KEYS.bookmarks,
        STORAGE_KEYS.history,
      ]);

      const values = Object.fromEntries(result);
      const session = parseStoredSession(values[STORAGE_KEYS.session]);
      const nextBookmarks = parseStoredArray<BookmarkEntry>(values[STORAGE_KEYS.bookmarks]);
      const nextHistory = parseStoredArray<HistoryEntry>(values[STORAGE_KEYS.history]);

      let restoredTabs =
        session?.tabs
          ?.filter((item) => typeof item?.url === 'string')
          .map((item) => makeTab(nextTabId(tabCounterRef), item.url)) ?? [];

      if (!restoredTabs.length) {
        restoredTabs = [makeTab(nextTabId(tabCounterRef), 'https://google.com')];
      }

      const requestedIndex = Number.isInteger(session?.activeTabIndex)
        ? (session?.activeTabIndex as number)
        : 0;
      const clampedIndex = Math.min(Math.max(requestedIndex, 0), restoredTabs.length - 1);

      setTabs(restoredTabs);
      setActiveTabId(restoredTabs[clampedIndex].id);
      setAddressBar(restoredTabs[clampedIndex].url);
      setBookmarks(nextBookmarks);
      setHistory(nextHistory);
      hydratedRef.current = true;
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !tabs.length) return;

    const payload: BrowserSession = {
      tabs: tabs.map((tab) => ({ url: tab.url, title: tab.title })),
      activeTabIndex: Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId)),
    };

    void AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(payload));
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void AsyncStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void AsyncStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!activeTab || isAddressFocused) return;
    setAddressBar(activeTab.url);
  }, [activeTab, isAddressFocused]);

  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabId) return tab;
        return { ...tab, ...updates };
      })
    );
  }, []);

  function createTab(initialUrl = '') {
    if (tabs.length >= MAX_TABS) return;
    const tab = makeTab(nextTabId(tabCounterRef), initialUrl);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    setAddressBar(tab.url);
  }

  function closeTab(tabId: string) {
    if (tabs.length <= 1) {
      const resetTab = makeTab(nextTabId(tabCounterRef), 'about:blank');
      setTabs([resetTab]);
      setActiveTabId(resetTab.id);
      setAddressBar('');
      return;
    }

    setTabs((current) => {
      const index = current.findIndex((item) => item.id === tabId);
      if (index === -1) return current;
      const next = current.filter((item) => item.id !== tabId);

      if (activeTabId === tabId) {
        const fallbackIndex = Math.min(index, next.length - 1);
        setActiveTabId(next[fallbackIndex]?.id ?? next[0].id);
      }

      delete webViewRefs.current[tabId];
      return next;
    });
  }

  function setActiveTab(tabId: string) {
    setActiveTabId(tabId);
  }

  const navigateInActiveTab = useCallback((raw: string) => {
    if (!activeTabId) return;
    const nextUrl = parseInput(raw || addressBar);
    if (nextUrl === 'about:blank') {
      updateTab(activeTabId, {
        url: '',
        title: 'New Tab',
        loading: false,
        progress: 0,
        canGoBack: false,
        canGoForward: false,
      });
      setAddressBar('');
      return;
    }

    updateTab(activeTabId, { url: nextUrl, loading: true, progress: 0 });
    setAddressBar(nextUrl);
  }, [activeTabId, addressBar, updateTab]);

  useEffect(() => {
    if (!hydratedRef.current || !activeTabId) return;

    const openParam = getSingleParam(params.open);
    const token = getSingleParam(params.t) || '';
    if (!openParam) return;

    const signature = `${openParam}|${token}`;
    if (paramHandledRef.current === signature) return;

    paramHandledRef.current = signature;
    navigateInActiveTab(openParam);
  }, [params.open, params.t, activeTabId, navigateInActiveTab]);

  function onNavigationStateChange(tabId: string, navState: WebViewNavigation) {
    const normalizedUrl = normalizeUrl(navState.url || '');
    updateTab(tabId, {
      url: normalizedUrl,
      title: navState.title || shortTitleFromUrl(normalizedUrl),
      canGoBack: navState.canGoBack,
      canGoForward: navState.canGoForward,
      loading: navState.loading,
    });

    if (!navState.loading && isHttpUrl(normalizedUrl)) {
      recordHistory(normalizedUrl, navState.title || shortTitleFromUrl(normalizedUrl));
    }
  }

  function recordHistory(url: string, title: string) {
    setHistory((current) => {
      const withoutCurrent = current.filter((item) => item.url !== url);
      return [{ url, title, visitedAt: Date.now() }, ...withoutCurrent].slice(0, MAX_HISTORY_ITEMS);
    });
  }

  function toggleBookmark() {
    if (!activeTab?.url || !isHttpUrl(activeTab.url)) return;

    setBookmarks((current) => {
      const exists = current.some((item) => item.url === activeTab.url);
      if (exists) {
        return current.filter((item) => item.url !== activeTab.url);
      }
      return [
        {
          url: activeTab.url,
          title: activeTab.title || shortTitleFromUrl(activeTab.url),
          addedAt: Date.now(),
        },
        ...current,
      ];
    });
  }

  function goBack() {
    if (!activeTab?.canGoBack) return;
    webViewRefs.current[activeTab.id]?.goBack();
  }

  function goForward() {
    if (!activeTab?.canGoForward) return;
    webViewRefs.current[activeTab.id]?.goForward();
  }

  function reloadOrStop() {
    if (!activeTab) return;
    const ref = webViewRefs.current[activeTab.id];
    if (!ref) return;

    if (activeTab.loading) ref.stopLoading();
    else ref.reload();
  }

  function goHome() {
    navigateInActiveTab('');
  }

  function shouldStartLoad(request: StartLoadRequest): boolean {
    try {
      const host = new URL(request.url).hostname;
      if (AD_HOSTS_RE.test(host)) return false;
    } catch {
      return true;
    }
    return true;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View style={styles.addressRow}>
          <Text style={[styles.securityText, { color: secureState.color }]}>{secureState.label}</Text>
          <TextInput
            style={styles.addressInput}
            value={addressBar}
            onChangeText={setAddressBar}
            placeholder="Search or enter address"
            placeholderTextColor="#6f8199"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onFocus={() => setIsAddressFocused(true)}
            onBlur={() => setIsAddressFocused(false)}
            onSubmitEditing={() => navigateInActiveTab(addressBar)}
          />
          <Pressable style={styles.addressAction} onPress={() => navigateInActiveTab(addressBar)}>
            <MaterialIcons name="arrow-forward" size={18} color="#dbe8ff" />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabStripContent}
          style={styles.tabStrip}>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tabChip, active && styles.tabChipActive]}>
                <Text numberOfLines={1} style={[styles.tabChipTitle, active && styles.tabChipTitleActive]}>
                  {tab.title || 'New Tab'}
                </Text>
                <Pressable onPress={() => closeTab(tab.id)} hitSlop={8} style={styles.closeTabBtn}>
                  <MaterialIcons name="close" size={14} color={active ? '#eaf2ff' : '#9eb2ca'} />
                </Pressable>
              </Pressable>
            );
          })}
          <Pressable style={styles.newTabBtn} onPress={() => createTab('about:blank')}>
            <MaterialIcons name="add" size={20} color="#dbe8ff" />
          </Pressable>
        </ScrollView>

        <View style={styles.navRow}>
          <ActionButton icon="arrow-back" disabled={!activeTab?.canGoBack} onPress={goBack} />
          <ActionButton icon="arrow-forward" disabled={!activeTab?.canGoForward} onPress={goForward} />
          <ActionButton icon={activeTab?.loading ? 'close' : 'refresh'} onPress={reloadOrStop} />
          <ActionButton icon="home" onPress={goHome} />
          <ActionButton icon={activeIsBookmarked ? 'star' : 'star-border'} onPress={toggleBookmark} />
          <View style={styles.countPill}>
            <Text style={styles.countText}>{tabs.length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.webviewHost}>
        {!!activeTab?.loading && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(8, activeTab.progress * 100)}%` }]} />
          </View>
        )}

        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <View
              key={tab.id}
              style={[styles.webviewLayer, !active && styles.hiddenLayer]}
              pointerEvents={active ? 'auto' : 'none'}>
              {tab.url ? (
                <WebView
                  ref={(ref) => {
                    webViewRefs.current[tab.id] = ref;
                  }}
                  source={{ uri: tab.url }}
                  style={styles.webview}
                  onNavigationStateChange={(state) => onNavigationStateChange(tab.id, state)}
                  onLoadProgress={(event) => {
                    updateTab(tab.id, {
                      progress: event.nativeEvent.progress,
                    });
                  }}
                  onShouldStartLoadWithRequest={shouldStartLoad}
                  setSupportMultipleWindows={false}
                />
              ) : (
                <View style={styles.newTabPage}>
                  <Text style={styles.logoText}>MyBrowser</Text>
                  <View style={styles.newTabSearchWrap}>
                    <MaterialIcons name="search" size={20} color="#9eb2ca" />
                    <TextInput
                      style={styles.newTabSearchInput}
                      value={newTabSearch}
                      onChangeText={setNewTabSearch}
                      placeholder="Search the web"
                      placeholderTextColor="#6f8199"
                      returnKeyType="search"
                      onSubmitEditing={() => {
                        navigateInActiveTab(newTabSearch);
                        setNewTabSearch('');
                      }}
                    />
                  </View>

                  <View style={styles.shortcutGrid}>
                    {quickTiles.map((tile) => (
                      <Pressable
                        key={tile.url}
                        style={styles.shortcutTile}
                        onPress={() => navigateInActiveTab(tile.url)}>
                        <MaterialIcons name={tile.icon} size={18} color="#9dccff" />
                        <Text numberOfLines={1} style={styles.shortcutText}>
                          {tile.title}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

/**
 * Renders a touchable icon button used for navigation controls.
 *
 * @param icon - The MaterialIcons glyph name to display.
 * @param onPress - Callback invoked when the button is pressed.
 * @param disabled - If `true`, applies disabled styling and prevents presses.
 * @returns The pressable icon button element.
 */
function ActionButton({
  icon,
  onPress,
  disabled,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.navBtn, disabled && styles.navBtnDisabled]}
      onPress={onPress}
      disabled={disabled}>
      <MaterialIcons name={icon} size={18} color={disabled ? '#647388' : '#dbe8ff'} />
    </Pressable>
  );
}

/**
 * Create a unique tab identifier and increment the provided counter.
 *
 * @param counterRef - Mutable object with a `current` number that will be incremented to help ensure uniqueness
 * @returns The generated identifier string in the form `tab-<timestamp>-<counter>`
 */
function nextTabId(counterRef: { current: number }): string {
  counterRef.current += 1;
  return `tab-${Date.now()}-${counterRef.current}`;
}

/**
 * Extracts a single string parameter from a possibly multi-valued input.
 *
 * @param value - A string, an array of strings, or undefined.
 * @returns The first string if `value` is an array, `value` itself if it's a string, or `''` when `value` is undefined or empty.
 */
function getSingleParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] || '' : value;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  topBar: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#121a2a',
  },
  addressRow: {
    height: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  securityText: {
    fontSize: 12,
    fontWeight: '700',
    width: 56,
    textAlign: 'center',
  },
  addressInput: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    color: '#eaf2ff',
    backgroundColor: '#0d1524',
    fontSize: 14,
  },
  addressAction: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#244a7e',
  },
  tabStrip: {
    maxHeight: 44,
  },
  tabStripContent: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 6,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#1a2639',
    minWidth: 110,
    maxWidth: 180,
  },
  tabChipActive: {
    backgroundColor: '#2a3a54',
    borderColor: '#66aaff',
  },
  tabChipTitle: {
    flex: 1,
    color: '#9eb2ca',
    fontSize: 12,
    fontWeight: '600',
  },
  tabChipTitleActive: {
    color: '#eaf2ff',
  },
  closeTabBtn: {
    height: 20,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  newTabBtn: {
    height: 30,
    width: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#244a7e',
  },
  navRow: {
    height: 44,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    height: 32,
    width: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c2a3f',
  },
  navBtnDisabled: {
    backgroundColor: '#141e2c',
  },
  countPill: {
    marginLeft: 'auto',
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c2a3f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  countText: {
    color: '#dbe8ff',
    fontSize: 12,
    fontWeight: '700',
  },
  webviewHost: {
    flex: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(10, 20, 36, 0.15)',
    zIndex: 5,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2f8fff',
  },
  webviewLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  hiddenLayer: {
    opacity: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  newTabPage: {
    flex: 1,
    backgroundColor: '#0b0f19',
    paddingHorizontal: 20,
    paddingTop: 44,
    alignItems: 'center',
    gap: 22,
  },
  logoText: {
    color: '#eaf2ff',
    fontSize: 28,
    fontWeight: '800',
  },
  newTabSearchWrap: {
    width: '100%',
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#101a2a',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newTabSearchInput: {
    flex: 1,
    color: '#eaf2ff',
    fontSize: 15,
  },
  shortcutGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  shortcutTile: {
    width: '48%',
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#111b2b',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shortcutText: {
    flex: 1,
    color: '#c8d7ec',
    fontWeight: '600',
    fontSize: 13,
  },
});
