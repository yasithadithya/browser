import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

/**
 * Render a bottom-tab pressable that applies a light iOS haptic on press-in and forwards all tab button props.
 *
 * @param props - Bottom tab bar button props forwarded to the underlying PlatformPressable. The component intercepts `onPressIn` to trigger iOS haptic feedback before invoking the original handler.
 * @returns A React element rendering a PlatformPressable configured for tab bar use.
 */
export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
