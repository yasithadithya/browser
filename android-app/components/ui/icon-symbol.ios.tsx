import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

/**
 * Renders an `expo-symbols` SymbolView configured with the given symbol name, size, color, and weight.
 *
 * @param name - The symbol identifier to render (matches `SymbolViewProps['name']`).
 * @param size - Width and height in pixels for the symbol; defaults to `24`.
 * @param color - Color applied to the symbol's `tintColor`.
 * @param style - Optional additional view style merged with the component's sizing.
 * @param weight - Symbol weight variant; defaults to `'regular'`.
 * @returns A JSX element containing the configured `SymbolView`.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
