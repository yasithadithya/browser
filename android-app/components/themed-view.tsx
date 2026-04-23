import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

/**
 * Render a View whose background color is chosen based on the active theme.
 *
 * @param style - Additional styles merged with the computed background color; provided style may override other style keys.
 * @param lightColor - Optional color string to use for the light theme instead of the default token.
 * @param darkColor - Optional color string to use for the dark theme instead of the default token.
 * @returns A React Native `View` element with the theme-aware background color applied and all other props forwarded.
 */
export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
