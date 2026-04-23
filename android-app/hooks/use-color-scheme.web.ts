import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Provide a color scheme value that defaults to `'light'` during static rendering and switches to the system color scheme after client hydration.
 *
 * @returns The active color scheme. Returns `'light'` before client hydration; after hydration returns the system color scheme (for example `'light'` or `'dark'`) or `null` if unavailable.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
