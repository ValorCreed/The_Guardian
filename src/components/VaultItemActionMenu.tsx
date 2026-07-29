import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import CardBrandLogo from './CardBrandLogo';
import type { CardBrand } from '../utils/cardBrand';

export type VaultActionMenuAnchor = {
  x: number;
  y: number;
};

export type VaultActionMenuFocusRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
};

export type VaultActionMenuPreview =
  | {
      kind: 'password';
      title: string;
      subtitle: string;
      leadingText: string;
      leadingColor: string;
      meta?: string;
    }
  | {
      kind: 'note';
      title: string;
      subtitle: string;
      leadingColor: string;
      pinned?: boolean;
    }
  | {
      kind: 'document';
      title: string;
      category: string;
      size: string;
      isImage?: boolean;
    }
  | {
      kind: 'card';
      title: string;
      cardholder: string;
      last4: string;
      backgroundColor: string;
      brand: CardBrand;
    };

type VaultItemActionMenuProps = {
  visible: boolean;
  anchor: VaultActionMenuAnchor | null;
  focusRect?: VaultActionMenuFocusRect | null;
  preview?: VaultActionMenuPreview | null;
  title: string;
  deleting?: boolean;
  showEdit?: boolean;
  onClose: () => void;
  onDismissed?: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const MENU_WIDTH = 228;
const MENU_ESTIMATED_HEIGHT = 166;
const SCREEN_EDGE_GAP = 14;
const MENU_TO_FOCUS_GAP = 12;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function VaultItemActionMenu({
  visible,
  anchor,
  focusRect,
  preview,
  title,
  deleting = false,
  showEdit = true,
  onClose,
  onDismissed,
  onEdit,
  onDelete,
}: VaultItemActionMenuProps) {
  const { width, height } = useWindowDimensions();
  const { isDark, isOled, colors: C } = useAppTheme();
  const blurTarget = useBlurTarget();

  const [mounted, setMounted] = useState(visible);
  const overlayOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const focusOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const focusScale = useRef(new Animated.Value(visible ? 1 : 0.985)).current;
  const focusTranslateY = useRef(new Animated.Value(visible ? 0 : 2)).current;
  const menuOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const menuScale = useRef(new Animated.Value(visible ? 1 : 0.99)).current;
  const menuTranslateY = useRef(new Animated.Value(visible ? 0 : 4)).current;
  const transitionRunRef = useRef(0);
  const dismissFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissedRef = useRef(onDismissed);

  const styles = useMemo(
    () => makeStyles(C, isDark, isOled),
    [C, isDark, isOled]
  );

  useEffect(() => {
    onDismissedRef.current = onDismissed;
  }, [onDismissed]);

  useEffect(() => {
    const transitionRun = transitionRunRef.current + 1;
    transitionRunRef.current = transitionRun;

    if (dismissFallbackRef.current) {
      clearTimeout(dismissFallbackRef.current);
      dismissFallbackRef.current = null;
    }
    overlayOpacity.stopAnimation();
    focusOpacity.stopAnimation();
    focusScale.stopAnimation();
    focusTranslateY.stopAnimation();
    menuOpacity.stopAnimation();
    menuScale.stopAnimation();
    menuTranslateY.stopAnimation();

    if (visible) {
      setMounted(true);

      overlayOpacity.setValue(0);
      focusOpacity.setValue(0);
      focusScale.setValue(0.985);
      focusTranslateY.setValue(2);
      menuOpacity.setValue(0);
      menuScale.setValue(0.99);
      menuTranslateY.setValue(4);

      requestAnimationFrame(() => {
        if (transitionRunRef.current !== transitionRun) return;

        Animated.parallel([
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(focusOpacity, {
            toValue: 1,
            duration: 135,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(focusScale, {
            toValue: 1,
            speed: 30,
            bounciness: 2,
            useNativeDriver: true,
          }),
          Animated.timing(focusTranslateY, {
            toValue: 0,
            duration: 135,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(menuOpacity, {
            toValue: 1,
            duration: 125,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(menuScale, {
            toValue: 1,
            speed: 30,
            bounciness: 1,
            useNativeDriver: true,
          }),
          Animated.timing(menuTranslateY, {
            toValue: 0,
            duration: 135,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });

      return;
    }

    if (!mounted) return;

    const finishDismiss = () => {
      if (transitionRunRef.current !== transitionRun) return;

      if (dismissFallbackRef.current) {
        clearTimeout(dismissFallbackRef.current);
        dismissFallbackRef.current = null;
      }

      setMounted(false);
      onDismissedRef.current?.();
    };

    /*
     * Animated.parallel can occasionally report an interrupted completion on
     * Android when the deleting state and modal visibility change in the same
     * render. The fallback makes dismissal idempotent and prevents a transparent
     * Modal from remaining mounted over the Vault.
     */
    dismissFallbackRef.current = setTimeout(finishDismiss, 190);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 105,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(focusOpacity, {
        toValue: 0,
        duration: 105,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(focusScale, {
        toValue: 0.985,
        duration: 105,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(focusTranslateY, {
        toValue: 2,
        duration: 105,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 95,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(menuScale, {
        toValue: 0.99,
        duration: 105,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(menuTranslateY, {
        toValue: 3,
        duration: 105,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(finishDismiss);

    return () => {
      if (dismissFallbackRef.current) {
        clearTimeout(dismissFallbackRef.current);
        dismissFallbackRef.current = null;
      }
    };
  }, [visible]);

  const normalizedFocusRect = useMemo(() => {
    if (!focusRect) return null;

    const left = clamp(focusRect.x, 8, Math.max(8, width - 8));
    const top = clamp(focusRect.y, 8, Math.max(8, height - 8));
    const right = clamp(
      focusRect.x + focusRect.width,
      left,
      Math.max(left, width - 8)
    );
    const bottom = clamp(
      focusRect.y + focusRect.height,
      top,
      Math.max(top, height - 8)
    );

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      borderRadius: focusRect.borderRadius ?? 22,
    };
  }, [focusRect, height, width]);

  const menuPosition = useMemo(() => {
    const estimatedHeight = showEdit ? MENU_ESTIMATED_HEIGHT : 112;
    const maxLeft = Math.max(
      SCREEN_EDGE_GAP,
      width - MENU_WIDTH - SCREEN_EDGE_GAP
    );

    if (normalizedFocusRect) {
      const focusCenterX =
        normalizedFocusRect.x + normalizedFocusRect.width / 2;
      const focusBottom =
        normalizedFocusRect.y + normalizedFocusRect.height;
      const roomBelow = height - focusBottom - SCREEN_EDGE_GAP;
      const placeBelow = roomBelow >= estimatedHeight + MENU_TO_FOCUS_GAP;

      const proposedTop = placeBelow
        ? focusBottom + MENU_TO_FOCUS_GAP
        : normalizedFocusRect.y - estimatedHeight - MENU_TO_FOCUS_GAP;

      return {
        left: clamp(
          focusCenterX - MENU_WIDTH / 2,
          SCREEN_EDGE_GAP,
          maxLeft
        ),
        top: clamp(
          proposedTop,
          SCREEN_EDGE_GAP + 28,
          Math.max(
            SCREEN_EDGE_GAP + 28,
            height - estimatedHeight - SCREEN_EDGE_GAP
          )
        ),
      };
    }

    const anchorX = anchor?.x ?? width / 2;
    const anchorY = anchor?.y ?? height / 2;
    const roomBelow = height - anchorY;
    const placeAbove = roomBelow < estimatedHeight + 90;
    const proposedTop = placeAbove
      ? anchorY - estimatedHeight - MENU_TO_FOCUS_GAP
      : anchorY + MENU_TO_FOCUS_GAP;

    return {
      left: clamp(
        anchorX - MENU_WIDTH / 2,
        SCREEN_EDGE_GAP,
        maxLeft
      ),
      top: clamp(
        proposedTop,
        SCREEN_EDGE_GAP + 28,
        Math.max(
          SCREEN_EDGE_GAP + 28,
          height - estimatedHeight - SCREEN_EDGE_GAP
        )
      ),
    };
  }, [anchor?.x, anchor?.y, height, normalizedFocusRect, showEdit, width]);

  const closeAndRun = useCallback(
    (action: () => void) => {
      onClose();
      setTimeout(action, 150);
    },
    [onClose]
  );

  const renderPreview = () => {
    if (!preview) return null;

    if (preview.kind === 'password') {
      return (
        <View style={styles.previewListCard}>
          <View
            style={[
              styles.previewAvatar,
              { backgroundColor: preview.leadingColor },
            ]}
          >
            <Text style={styles.previewAvatarText}>
              {preview.leadingText}
            </Text>
          </View>

          <View style={styles.previewTextBlock}>
            <Text style={styles.previewTitle}>
              {preview.title}
            </Text>
            <Text style={styles.previewSubtitle}>
              {preview.subtitle}
            </Text>
          </View>

          <View style={styles.previewTrailing}>
            {!!preview.meta && (
              <Text style={styles.previewMeta}>{preview.meta}</Text>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={C.tabInactive || C.textSecondary}
            />
          </View>
        </View>
      );
    }

    if (preview.kind === 'note') {
      return (
        <View style={styles.previewListCard}>
          <View
            style={[
              styles.previewAvatar,
              { backgroundColor: preview.leadingColor },
            ]}
          >
            <Ionicons
              name={preview.pinned ? 'pin' : 'reader-outline'}
              size={19}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.previewTextBlock}>
            <Text style={styles.previewTitle}>
              {preview.title}
            </Text>
            <Text style={styles.previewSubtitle}>
              {preview.subtitle}
            </Text>
          </View>

          <View style={styles.previewTrailing}>
            {preview.pinned && (
              <View style={styles.previewPinnedPill}>
                <Text style={styles.previewPinnedText}>PINNED</Text>
              </View>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={C.tabInactive || C.textSecondary}
            />
          </View>
        </View>
      );
    }

    if (preview.kind === 'document') {
      return (
        <View style={styles.previewDocumentCard}>
          <View style={styles.previewDocumentTop}>
            <View style={styles.previewDocumentIcon}>
              <Ionicons
                name={preview.isImage ? 'image-outline' : 'document-text-outline'}
                size={23}
                color={C.primary}
              />
            </View>
            <Ionicons
              name="lock-closed-outline"
              size={15}
              color={C.tabInactive || C.textSecondary}
            />
          </View>

          <Text style={styles.previewDocumentTitle}>
            {preview.title}
          </Text>
          <Text style={styles.previewDocumentCategory}>
            {preview.category}
          </Text>
          <Text style={styles.previewDocumentSize}>
            {preview.size}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.previewCreditCard,
          { backgroundColor: preview.backgroundColor },
        ]}
      >
        <View style={styles.previewCreditCardTop}>
          <View style={styles.previewCardTitleArea}>
            <CardBrandLogo brand={preview.brand} compact />
            <Text style={styles.previewCreditCardLabel}>SECURE CARD</Text>
            <Text style={styles.previewCreditCardName}>
              {preview.title}
            </Text>
          </View>
          <Ionicons name="card-outline" size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.previewCreditCardNumber}>
          ••••  ••••  ••••  {preview.last4}
        </Text>

        <View style={styles.previewCreditCardBottom}>
          <Text style={styles.previewCardholder}>
            {preview.cardholder}
          </Text>
          <View style={styles.previewEncryptedPill}>
            <Ionicons name="lock-closed" size={10} color="#FFFFFF" />
            <Text style={styles.previewEncryptedText}>Encrypted</Text>
          </View>
        </View>
      </View>
    );
  };

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (!deleting) onClose();
      }}
    >
      <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
        >
          {blurTarget?.targetRef ? (
            <BlurView
              blurTarget={blurTarget.targetRef}
              blurMethod={
                Platform.OS === 'android'
                  ? ('dimezisBlurViewSdk31Plus' as any)
                  : undefined
              }
              blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
              intensity={Platform.OS === 'android' ? 18 : 28}
              tint={isDark ? 'dark' : 'light'}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View pointerEvents="none" style={styles.fallbackBlur} />
          )}

          {normalizedFocusRect ? (
            <View
              pointerEvents="none"
              style={[
                styles.sourceMask,
                {
                  left: normalizedFocusRect.x,
                  top: normalizedFocusRect.y,
                  width: normalizedFocusRect.width,
                  height: normalizedFocusRect.height,
                  borderRadius: normalizedFocusRect.borderRadius,
                },
              ]}
            />
          ) : null}

          <View pointerEvents="none" style={styles.backdrop} />
        </Animated.View>

        <Pressable
          accessibilityLabel="Close vault item actions"
          style={StyleSheet.absoluteFill}
          onPress={deleting ? undefined : onClose}
          disabled={deleting}
        />

        {normalizedFocusRect && preview ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.focusFrame,
              {
                left: normalizedFocusRect.x,
                top: normalizedFocusRect.y,
                width: normalizedFocusRect.width,
                height: normalizedFocusRect.height,
                borderRadius: normalizedFocusRect.borderRadius,
                opacity: focusOpacity,
                transform: [
                  { scale: focusScale },
                  { translateY: focusTranslateY },
                ],
              },
            ]}
          >
            {renderPreview()}
          </Animated.View>
        ) : null}

        <Animated.View
          style={[
            styles.menuCard,
            menuPosition,
            {
              opacity: menuOpacity,
              transform: [
                { scale: menuScale },
                { translateY: menuTranslateY },
              ],
            },
          ]}
        >
          <View style={styles.menuHeader}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>

          <View style={styles.divider} />

          {deleting ? (
            <View style={styles.deletingState}>
              <ActivityIndicator size="small" color={C.danger} />
              <Text style={styles.deletingText}>Deleting...</Text>
            </View>
          ) : (
            <>
              {showEdit && (
                <>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.actionRow,
                      pressed && styles.pressedRow,
                    ]}
                    onPress={() => closeAndRun(onEdit)}
                  >
                    <View style={styles.actionIcon}>
                      <Ionicons
                        name="create-outline"
                        size={19}
                        color={C.primary}
                      />
                    </View>
                    <Text style={styles.actionTitle}>Edit</Text>
                  </Pressable>

                  <View style={styles.rowDivider} />
                </>
              )}

              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actionRow,
                  pressed && styles.pressedRow,
                ]}
                onPress={onDelete}
              >
                <View style={[styles.actionIcon, styles.deleteIcon]}>
                  <Ionicons
                    name="trash-outline"
                    size={19}
                    color={C.danger}
                  />
                </View>
                <Text style={[styles.actionTitle, { color: C.danger }]}>Delete</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: any, isDark: boolean, isOled: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
    },

    fallbackBlur: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.84)'
        : isDark
          ? 'rgba(2,6,23,0.74)'
          : 'rgba(15,23,42,0.24)',
    },

    sourceMask: {
      position: 'absolute',
      backgroundColor: C.background,
    },

    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.40)'
        : isDark
          ? 'rgba(0,0,0,0.29)'
          : 'rgba(0,0,0,0.14)',
    },

    focusFrame: {
      position: 'absolute',
      shadowColor: '#000',
      shadowOpacity: isOled ? 0.34 : 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },

    previewListCard: {
      flex: 1,
      width: '100%',
      padding: 14,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderRadius: 22,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    previewAvatar: {
      width: 46,
      height: 46,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

    previewAvatarText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '900',
    },

    previewTextBlock: {
      flex: 1,
      minWidth: 0,
    },

    previewTitle: {
      color: C.text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '900',
    },

    previewSubtitle: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
      marginTop: 3,
    },

    previewTrailing: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 5,
      flexShrink: 0,
    },

    previewMeta: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: '800',
    },

    previewPinnedPill: {
      backgroundColor: C.alertWarningBg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },

    previewPinnedText: {
      color: C.warning,
      fontSize: 9,
      fontWeight: '900',
    },

    previewDocumentCard: {
      flex: 1,
      width: '100%',
      padding: 16,
      borderRadius: 24,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    previewDocumentTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },

    previewDocumentIcon: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: C.actionCard || C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
    },

    previewDocumentTitle: {
      color: C.text,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '900',
    },

    previewDocumentCategory: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 7,
    },

    previewDocumentSize: {
      color: C.tabInactive || C.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },

    previewCreditCard: {
      flex: 1,
      width: '100%',
      padding: 22,
      borderRadius: 28,
      justifyContent: 'space-between',
      overflow: 'hidden',
      gap: 18,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    previewCreditCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },

    previewCardTitleArea: {
      flex: 1,
      minWidth: 0,
    },

    previewCreditCardLabel: {
      color: 'rgba(255,255,255,0.62)',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
      marginTop: 8,
      marginBottom: 4,
    },

    previewCreditCardName: {
      color: '#FFFFFF',
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '900',
    },

    previewCreditCardNumber: {
      color: '#FFFFFF',
      fontSize: 19,
      lineHeight: 28,
      letterSpacing: 2,
      fontWeight: '800',
    },

    previewCreditCardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 12,
    },

    previewCardholder: {
      flex: 1,
      color: 'rgba(255,255,255,0.88)',
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '800',
    },

    previewEncryptedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: 'rgba(255,255,255,0.18)',
    },

    previewEncryptedText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
    },

    menuCard: {
      position: 'absolute',
      width: MENU_WIDTH,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.97)'
        : isDark
          ? 'rgba(15,23,42,0.97)'
          : 'rgba(255,255,255,0.97)',
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: isOled ? 0.58 : 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
      elevation: 28,
    },

    menuHeader: {
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingVertical: 13,
    },

    title: {
      width: '100%',
      color: C.text,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '900',
      textAlign: 'center',
    },

    divider: {
      height: 1,
      backgroundColor: C.border,
    },

    actionRow: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },

    pressedRow: {
      backgroundColor: C.backgroundSelected,
    },

    actionIcon: {
      width: 34,
      height: 34,
      borderRadius: 13,
      backgroundColor: C.actionCard || C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
    },

    deleteIcon: {
      backgroundColor: C.alertDangerBg,
    },

    actionTitle: {
      flex: 1,
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },

    rowDivider: {
      height: 1,
      marginLeft: 59,
      backgroundColor: C.border,
    },

    deletingState: {
      minHeight: 108,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 18,
    },

    deletingText: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },
  });