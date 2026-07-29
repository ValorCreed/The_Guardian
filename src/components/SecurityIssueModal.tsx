import React, { memo, useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import type { SecurityIssue } from '../hooks/useSecurityScore';
import { hapticLight } from '../utils/haptics';

type SecurityIssueModalProps = {
  visible: boolean;
  title: string;
  issues: SecurityIssue[];
  emptyTitle?: string;
  emptyText?: string;
  lockedMessage?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onClose: () => void;
  onIssuePress: (issue: SecurityIssue) => void;
};

function issueIcon(type: SecurityIssue['type']) {
  const value = String(type);

  if (value === 'RECOVERY_KIT_MISSING') return 'alert-circle-outline';
  if (
    value === 'WEAK' ||
    value === 'SHARED_WEAK' ||
    value === 'FAMILY_MEMBER_WEAK'
  ) {
    return 'warning-outline';
  }

  if (
    value === 'MEDIUM' ||
    value === 'SHARED_MEDIUM' ||
    value === 'FAMILY_MEMBER_MEDIUM'
  ) {
    return 'alert-circle-outline';
  }

  if (
    value === 'BREACHED_PASSWORD' ||
    value === 'SHARED_BREACHED_PASSWORD'
  ) {
    return 'skull-outline';
  }

  if (
    value === 'REUSED' ||
    value === 'SHARED_REUSED' ||
    value === 'FAMILY_MEMBER_REUSED'
  ) {
    return 'copy-outline';
  }

  if (
    value === 'OLD' ||
    value === 'SHARED_OLD' ||
    value === 'FAMILY_MEMBER_OLD'
  ) {
    return 'time-outline';
  }

  if (value === 'MISSING_USERNAME' || value === 'MISSING_WEBSITE') {
    return 'create-outline';
  }

  if (value === 'TWO_FACTOR_OFF') return 'keypad-outline';
  if (value === 'EMAIL_UNVERIFIED') return 'mail-unread-outline';
  if (value === 'BACKUP_NEEDED') return 'cloud-upload-outline';

  return 'shield-outline';
}

function severityColor(issue: SecurityIssue, C: any) {
  if (issue.severity === 'danger') return C.danger;
  if (issue.severity === 'warning') return C.warning;
  return C.info || C.primary;
}

function issueDisplayTitle(issue: SecurityIssue) {
  const type = String(issue.type);
  const itemName = String(issue.title || 'This password').trim();

  // Keep backend-provided explanatory sentences unchanged.
  if (
    /\b(is weak|is moderately weak|is reused|is old|data breach|missing a username|missing a website)\b/i.test(
      itemName
    )
  ) {
    return itemName;
  }

  const passwordName = /\bpassword$/i.test(itemName)
    ? itemName
    : `${itemName} password`;

  if (
    type === 'WEAK' ||
    type === 'SHARED_WEAK' ||
    type === 'FAMILY_MEMBER_WEAK'
  ) {
    return `${passwordName} is weak`;
  }

  if (
    type === 'MEDIUM' ||
    type === 'SHARED_MEDIUM' ||
    type === 'FAMILY_MEMBER_MEDIUM'
  ) {
    return `${passwordName} is moderately weak`;
  }

  if (
    type === 'REUSED' ||
    type === 'SHARED_REUSED' ||
    type === 'FAMILY_MEMBER_REUSED'
  ) {
    return `${passwordName} is reused`;
  }

  if (
    type === 'OLD' ||
    type === 'SHARED_OLD' ||
    type === 'FAMILY_MEMBER_OLD'
  ) {
    return `${passwordName} is old and should be updated`;
  }

  if (
    type === 'BREACHED_PASSWORD' ||
    type === 'SHARED_BREACHED_PASSWORD'
  ) {
    return `${passwordName} was found in a data breach`;
  }

  if (type === 'MISSING_USERNAME') {
    return `${itemName} is missing a username`;
  }

  if (type === 'MISSING_WEBSITE') {
    return `${itemName} is missing a website`;
  }

  return itemName;
}

function SecurityIssueModal({
  visible,
  title,
  issues,
  emptyTitle = 'No issues found',
  emptyText = 'There is nothing to fix in this category.',
  lockedMessage,
  primaryActionLabel,
  onPrimaryAction,
  onClose,
  onIssuePress,
}: SecurityIssueModalProps) {
  const { isDark, isOled, colors: C } = useAppTheme();
  const blurTarget = useBlurTarget();
  const styles = makeStyles(C, isDark, isOled);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;

    closingRef.current = false;
    opacity.setValue(0);
    scale.setValue(0.96);
    translateY.setValue(14);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 27,
        bounciness: 4,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale, translateY, visible]);

  const closeModal = useCallback(
    (afterClose?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 110,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.975,
          duration: 110,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 8,
          duration: 110,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        onClose();
        closingRef.current = false;
        afterClose?.();
      });
    },
    [onClose, opacity, scale, translateY]
  );

  const handleIssuePress = (issue: SecurityIssue) => {
    hapticLight();
    closeModal(() => onIssuePress(issue));
  };

  const handlePrimaryAction = () => {
    hapticLight();
    closeModal(onPrimaryAction);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => closeModal()}
    >
      <View style={styles.overlay}>
        {blurTarget?.targetRef ? (
          <BlurView
            blurTarget={blurTarget.targetRef}
            blurMethod={
              Platform.OS === 'android'
                ? ('dimezisBlurViewSdk31Plus' as any)
                : undefined
            }
            blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
            intensity={Platform.OS === 'android' ? 22 : 32}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.fallbackBlur} />
        )}

        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity }]}
        />

        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => closeModal()}
        />

        <Animated.View
          style={[
            styles.modalCard,
            {
              opacity,
              transform: [{ scale }, { translateY }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {!lockedMessage && (
                <Text style={styles.countText}>
                  {issues.length} {issues.length === 1 ? 'fix' : 'fixes'}
                </Text>
              )}
            </View>

            <Pressable
              style={styles.closeButton}
              onPress={() => closeModal()}
              hitSlop={10}
            >
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </Pressable>
          </View>

          {lockedMessage ? (
            <View style={styles.lockedState}>
              <View style={styles.lockedIcon}>
                <Ionicons
                  name="lock-closed-outline"
                  size={25}
                  color={C.warning}
                />
              </View>

              <Text style={styles.lockedMessage}>{lockedMessage}</Text>

              {!!primaryActionLabel && !!onPrimaryAction && (
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={handlePrimaryAction}
                >
                  <Text style={styles.primaryButtonText}>
                    {primaryActionLabel}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : issues.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="shield-checkmark-outline"
                size={36}
                color={C.success}
              />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.issueList}
            >
              {issues.map((issue, index) => {
                const color = severityColor(issue, C);

                return (
                  <Pressable
                    key={String(issue.id)}
                    style={({ pressed }) => [
                      styles.issueRow,
                      index !== issues.length - 1 && styles.divider,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => handleIssuePress(issue)}
                  >
                    <View
                      style={[
                        styles.issueIcon,
                        { backgroundColor: `${color}1F` },
                      ]}
                    >
                      <Ionicons
                        name={issueIcon(issue.type) as any}
                        size={20}
                        color={color}
                      />
                    </View>

                    <Text style={styles.issueTitle} numberOfLines={2}>
                      {issueDisplayTitle(issue)}
                    </Text>

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={C.tabInactive || C.textSecondary}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

export default memo(SecurityIssueModal);

const color = (C: any, key: string, fallback: string) =>
  C?.[key] || fallback;

const makeStyles = (C: any, isDark: boolean, isOled: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 34,
    },

    fallbackBlur: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.84)'
        : isDark
          ? 'rgba(2,6,23,0.74)'
          : 'rgba(15,23,42,0.25)',
    },

    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.50)'
        : isDark
          ? 'rgba(0,0,0,0.36)'
          : 'rgba(0,0,0,0.18)',
    },

    modalCard: {
      width: '100%',
      maxWidth: 410,
      maxHeight: '78%',
      borderRadius: 28,
      overflow: 'hidden',
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.97)'
        : isDark
          ? 'rgba(15,23,42,0.97)'
          : 'rgba(255,255,255,0.97)',
      borderWidth: 1,
      borderColor: color(
        C,
        'border',
        isOled ? '#18231F' : isDark ? '#243044' : '#E2E8F0'
      ),
      shadowColor: '#000',
      shadowOpacity: isOled ? 0.56 : 0.24,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 18 },
      elevation: 24,
    },

    header: {
      minHeight: 78,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    headerText: {
      flex: 1,
      minWidth: 0,
      paddingRight: 12,
    },

    title: {
      color: C.text,
      fontSize: 21,
      fontWeight: '900',
      letterSpacing: -0.3,
    },

    countText: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 3,
    },

    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color(
        C,
        'backgroundSelected',
        isOled ? '#050A08' : isDark ? '#1E293B' : '#F1F5F9'
      ),
    },

    issueList: {
      paddingHorizontal: 14,
      paddingVertical: 6,
    },

    issueRow: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 4,
      paddingVertical: 10,
    },

    divider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    issueIcon: {
      width: 42,
      height: 42,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

    issueTitle: {
      flex: 1,
      minWidth: 0,
      color: C.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '900',
    },

    emptyState: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 34,
    },

    emptyTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
      marginTop: 10,
      textAlign: 'center',
    },

    emptyText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
      marginTop: 5,
      textAlign: 'center',
    },

    lockedState: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 30,
    },

    lockedIcon: {
      width: 54,
      height: 54,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.securityScoreBg || C.backgroundSelected,
    },

    lockedMessage: {
      color: C.text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 14,
    },

    primaryButton: {
      minHeight: 50,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: C.primary,
      marginTop: 20,
      paddingHorizontal: 18,
    },

    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },

    pressed: {
      opacity: 0.78,
      transform: [{ scale: 0.985 }],
    },
  });