import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Provides the application's root layout with theme selection and navigation stack.
 *
 * Wraps the app in a ThemeProvider that uses the current color scheme to choose between DarkTheme and DefaultTheme, mounts a Stack navigator with the `(tabs)` screen (header hidden) and a `modal` screen presented as a modal, and renders a StatusBar.
 *
 * @returns The root React element containing the themed navigation stack and status bar.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
