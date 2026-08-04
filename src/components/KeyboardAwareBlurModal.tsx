import React, { memo, useEffect, useRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type KeyboardAwareBlurModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  blurTarget?: any;
  isDark: boolean;
  header?: React.ReactNode;
  children: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  cardStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraBottomSpace?: number;
  testID?: string;
};

const ModalBackdrop = memo(function ModalBackdrop({
  blurTarget,
  isDark,
}: {
  blurTarget?: any;
  isDark: boolean;
}) {
  return (
    <>
      {blurTarget?.targetRef ? (
        <BlurView
          blurTarget={blurTarget.targetRef}
          blurMethod={
            Platform.OS === 'android'
              ? ('dimezisBlurViewSdk31Plus' as any)
              : undefined
          }
          blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
          intensity={Platform.OS === 'android' ? 18 : 32}
          tint={isDark ? 'dark' : 'light'}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View pointerEvents="none" style={styles.fallbackBlur} />
      )}
      <View pointerEvents="none" style={styles.backdrop} />
    </>
  );
});

/**
 * A stable blur-backed modal for forms.
 *
 * Android is allowed to resize the modal window itself. Using
 * KeyboardAvoidingView's `height` behavior inside a centered percentage-height
 * card causes repeated layout jumps while secure fields update. This component
 * anchors the card to the bottom, uses only iOS padding avoidance, and gives the
 * form a large scroll tail so the active field can remain above the keyboard.
 */
export default function KeyboardAwareBlurModal({
  visible,
  onRequestClose,
  blurTarget,
  isDark,
  header,
  children,
  scrollRef,
  cardStyle,
  contentContainerStyle,
  extraBottomSpace = 220,
  testID,
}: KeyboardAwareBlurModalProps) {
  const internalScrollRef = useRef<ScrollView>(null);
  const effectiveScrollRef = scrollRef ?? internalScrollRef;
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const maximumCardHeight = Math.max(
    300,
    height - insets.top - Math.max(insets.bottom, 12) - 20,
  );

  useEffect(() => {
    if (!visible) return undefined;

    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(eventName, () => {
      setTimeout(() => {
        effectiveScrollRef.current?.scrollToEnd({ animated: true });
      }, Platform.OS === 'ios' ? 140 : 90);
    });

    return () => subscription.remove();
  }, [effectiveScrollRef, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
      onRequestClose={onRequestClose}
      testID={testID}
    >
      <View style={styles.root}>
        <ModalBackdrop blurTarget={blurTarget} isDark={isDark} />

        <KeyboardAvoidingView
          style={styles.keyboardLayer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View
            style={[
              styles.card,
              { maxHeight: maximumCardHeight },
              cardStyle,
            ]}
          >
            {header}
            <ScrollView
              ref={effectiveScrollRef}
              style={styles.scroll}
              contentContainerStyle={[
                styles.content,
                contentContainerStyle,
                { paddingBottom: extraBottomSpace },
              ]}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets={false}
              contentInsetAdjustmentBehavior="never"
              nestedScrollEnabled
              removeClippedSubviews={false}
              showsVerticalScrollIndicator={false}
              overScrollMode="always"
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fallbackBlur: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  keyboardLayer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  card: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 28,
    overflow: 'hidden',
  },
  scroll: {
    flexShrink: 1,
  },
  content: {
    flexGrow: 1,
    padding: 16,
  },
});