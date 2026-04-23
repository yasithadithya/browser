import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type BookmarkEntry, type HistoryEntry, STORAGE_KEYS, shortTitleFromUrl } from '@/constants/browser';

/**
 * Parse a stored JSON string and return it as an array.
 *
 * @param value - The stored string value (JSON) or `null`.
 * @returns The parsed array when `value` contains a JSON array, otherwise an empty array.
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
 * Format a past timestamp as a concise, human-readable relative time string.
 *
 * @param timestamp - Time in milliseconds since the Unix epoch to compare against the current time
 * @returns `'just now'` if less than 1 minute has passed, `'{N}m ago'` if less than 60 minutes, `'{N}h ago'` if less than 24 hours, or `'{N}d ago'` otherwise
 */
function formatRelativeTime(timestamp: number): string {
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
 * Render the Library screen showing saved bookmarks and recent browsing history.
 *
 * On screen focus it loads persisted bookmarks and history; tapping an entry opens it in the main browser route, and each section's "Clear" button clears the visible list and persists an empty array.
 *
 * @returns A JSX element representing the Library screen UI
 */
export default function LibraryScreen() {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const loadData = useCallback(async () => {
    const pairs = await AsyncStorage.multiGet([STORAGE_KEYS.bookmarks, STORAGE_KEYS.history]);
    const values = Object.fromEntries(pairs);
    setBookmarks(parseStoredArray<BookmarkEntry>(values[STORAGE_KEYS.bookmarks]));
    setHistory(parseStoredArray<HistoryEntry>(values[STORAGE_KEYS.history]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  function openInBrowser(url: string) {
    router.push({
      pathname: '/',
      params: {
        open: url,
        t: String(Date.now()),
      },
    });
  }

  async function clearHistory() {
    setHistory([]);
    await AsyncStorage.setItem(STORAGE_KEYS.history, JSON.stringify([]));
  }

  async function clearBookmarks() {
    setBookmarks([]);
    await AsyncStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify([]));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Library</Text>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Saved Pages</Text>
          <Pressable onPress={clearBookmarks} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>

        {!bookmarks.length && <Text style={styles.emptyText}>No bookmarks saved yet.</Text>}

        {bookmarks.map((item) => (
          <Pressable key={item.url} style={styles.row} onPress={() => openInBrowser(item.url)}>
            <MaterialIcons name="star" size={16} color="#ffcc66" />
            <View style={styles.rowTextWrap}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {item.title || shortTitleFromUrl(item.url)}
              </Text>
              <Text numberOfLines={1} style={styles.rowMeta}>
                {item.url}
              </Text>
            </View>
            <MaterialIcons name="north-east" size={16} color="#9eb2ca" />
          </Pressable>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent History</Text>
          <Pressable onPress={clearHistory} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>

        {!history.length && <Text style={styles.emptyText}>No history yet.</Text>}

        {history.map((item) => (
          <Pressable
            key={`${item.url}-${item.visitedAt}`}
            style={styles.row}
            onPress={() => openInBrowser(item.url)}>
            <MaterialIcons name="history" size={16} color="#9dccff" />
            <View style={styles.rowTextWrap}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {item.title || shortTitleFromUrl(item.url)}
              </Text>
              <Text numberOfLines={1} style={styles.rowMeta}>
                {shortTitleFromUrl(item.url)} - {formatRelativeTime(item.visitedAt)}
              </Text>
            </View>
            <MaterialIcons name="north-east" size={16} color="#9eb2ca" />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 12,
  },
  title: {
    color: '#eaf2ff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionHeader: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#d7e6ff',
    fontSize: 18,
    fontWeight: '700',
  },
  clearBtn: {
    marginLeft: 'auto',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1b2a3f',
  },
  clearBtnText: {
    color: '#aac7eb',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: '#8ea3bf',
    fontSize: 14,
    marginBottom: 4,
  },
  row: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#111b2b',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowTextWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: '#dce9ff',
    fontWeight: '700',
    fontSize: 14,
  },
  rowMeta: {
    color: '#93a8c4',
    fontSize: 12,
  },
});
