import Animated from 'react-native-reanimated';

/**
 * Renders an animated waving hand emoji.
 *
 * @returns An `Animated.Text` element displaying the 👋 emoji with a brief rotate animation (25° at the 50% keyframe) that runs 4 iterations over 300ms.
 */
export function HelloWave() {
  return (
    <Animated.Text
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      👋
    </Animated.Text>
  );
}
