import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AddActivationSource = 'press' | 'longPress';

type ExpandingAddButtonProps = {
  color: string;
  iconColor?: string;
  size?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  onRequestOpen: (
    source: AddActivationSource
  ) => (() => void) | null | undefined;
};

const WINDOW = Dimensions.get('window');

export default function ExpandingAddButton({
  color,
  iconColor = '#FFFFFF',
  size = 48,
  borderRadius = 20,
  style,
  accessibilityLabel = 'Add item',
  onRequestOpen,
}: ExpandingAddButtonProps) {
  const buttonRef = useRef<any>(null);
  const transitioningRef = useRef(false);
  const longPressHandledRef = useRef(false);
  const pendingNavigationRef = useRef<null | (() => void)>(null);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [anchor, setAnchor] = useState({
    x: WINDOW.width - 20 - size,
    y: 72,
    width: size,
    height: size,
  });

  const pressScale = useRef(new Animated.Value(1)).current;
  const expansionScale = useRef(new Animated.Value(1)).current;
  const expansionOpacity = useRef(new Animated.Value(0)).current;
  const sourceIconOpacity = useRef(new Animated.Value(1)).current;

  const resetPressScale = useCallback(() => {
    if (transitioningRef.current) return;

    Animated.spring(pressScale, {
      toValue: 1,
      friction: 5,
      tension: 220,
      useNativeDriver: true,
    }).start();
  }, [pressScale]);

  const runExpansion = useCallback(
    (
      source: AddActivationSource,
      nextAction: () => void,
      measuredAnchor: {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    ) => {
      const windowWidth = Dimensions.get('window').width;
      const windowHeight = Dimensions.get('window').height;
      const centerX = measuredAnchor.x + measuredAnchor.width / 2;
      const centerY = measuredAnchor.y + measuredAnchor.height / 2;

      const farthestX = Math.max(centerX, windowWidth - centerX);
      const farthestY = Math.max(centerY, windowHeight - centerY);
      const farthestCornerDistance = Math.sqrt(
        farthestX * farthestX + farthestY * farthestY
      );

      const baseRadius = Math.max(
        1,
        Math.min(measuredAnchor.width, measuredAnchor.height) / 2
      );

      const targetScale = farthestCornerDistance / baseRadius + 1.2;
      const duration = source === 'longPress' ? 360 : 300;

      pendingNavigationRef.current = nextAction;
      setAnchor(measuredAnchor);
      setOverlayVisible(true);

      expansionScale.setValue(1);
      expansionOpacity.setValue(1);
      sourceIconOpacity.setValue(0);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(expansionScale, {
            toValue: targetScale,
            duration,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pressScale, {
            toValue: 1,
            duration: 90,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (!finished) {
            transitioningRef.current = false;
            setOverlayVisible(false);
            sourceIconOpacity.setValue(1);
            resetPressScale();
            return;
          }

          const navigate = pendingNavigationRef.current;
          pendingNavigationRef.current = null;

          navigate?.();

          /*
           * Keep the screen-colored expansion in place while Expo Router commits
           * the destination. The previous 90 ms timeout could reveal a partially
           * faded destination frame, which looked like a blink.
           */
          setTimeout(() => {
            setOverlayVisible(false);
            transitioningRef.current = false;
            pressScale.setValue(1);
            expansionScale.setValue(1);
            expansionOpacity.setValue(0);
            sourceIconOpacity.setValue(1);
          }, 220);
        });
      });
    },
    [
      expansionOpacity,
      expansionScale,
      pressScale,
      sourceIconOpacity,
      resetPressScale,
    ]
  );

  const startTransition = useCallback(
    (source: AddActivationSource) => {
      if (transitioningRef.current) return;

      const nextAction = onRequestOpen(source);

      if (!nextAction) {
        resetPressScale();
        return;
      }

      transitioningRef.current = true;

      const fallbackAnchor = {
        x: Dimensions.get('window').width - 20 - size,
        y: 72,
        width: size,
        height: size,
      };

      const begin = (
        x: number,
        y: number,
        measuredWidth: number,
        measuredHeight: number
      ) => {
        runExpansion(source, nextAction, {
          x: Number.isFinite(x) ? x : fallbackAnchor.x,
          y: Number.isFinite(y) ? y : fallbackAnchor.y,
          width:
            Number.isFinite(measuredWidth) && measuredWidth > 0
              ? measuredWidth
              : fallbackAnchor.width,
          height:
            Number.isFinite(measuredHeight) && measuredHeight > 0
              ? measuredHeight
              : fallbackAnchor.height,
        });
      };

      const node = buttonRef.current;

      if (node?.measureInWindow) {
        node.measureInWindow(begin);
      } else {
        begin(
          fallbackAnchor.x,
          fallbackAnchor.y,
          fallbackAnchor.width,
          fallbackAnchor.height
        );
      }
    },
    [onRequestOpen, resetPressScale, runExpansion, size]
  );

  const handlePress = useCallback(() => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }

    startTransition('press');
  }, [startTransition]);

  const handleLongPress = useCallback(() => {
    longPressHandledRef.current = true;
    startTransition('longPress');
  }, [startTransition]);
  return (
    <>
      <Animated.View style={{ transform: [{ scale: pressScale }] }}>
        <TouchableOpacity
          ref={buttonRef}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          activeOpacity={1}
          delayLongPress={380}
          onPressIn={() => {
            if (transitioningRef.current) return;

            Animated.timing(pressScale, {
              toValue: 0.92,
              duration: 75,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={resetPressScale}
          onPress={handlePress}
          onLongPress={handleLongPress}
          style={style}
        >
          <Animated.View style={{ opacity: sourceIconOpacity }}>
            <Ionicons name="add" size={28} color={iconColor} />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={overlayVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          // The transition is intentionally non-dismissible for a few ms.
        }}
      >
        <View pointerEvents="none" style={styles.overlay}>
          <Animated.View
            style={[
              styles.expandingShape,
              {
                left: anchor.x,
                top: anchor.y,
                width: anchor.width,
                height: anchor.height,
                borderRadius,
                backgroundColor: color,
                opacity: expansionOpacity,
                transform: [{ scale: expansionScale }],
              },
            ]}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },

  expandingShape: {
    position: 'absolute',
    overflow: 'hidden',
  },
});