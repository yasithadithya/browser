/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Selects a theme-aware color, preferring an explicit override for the current theme.
 *
 * @param props - Optional overrides with `light` and/or `dark` color values.
 * @param colorName - Key identifying the color in the theme palettes (`Colors.light` and `Colors.dark`).
 * @returns The resolved color string: the override for the active theme if present, otherwise the color from the theme palettes.
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
