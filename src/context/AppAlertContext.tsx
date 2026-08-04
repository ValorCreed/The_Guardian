import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  AlertButton,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect, usePathname } from 'expo-router';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react-native';

import { useAppTheme } from './ThemeContext';
import { useBlurTarget } from './BlurTargetContext';
import { hapticForAlert, hapticLight } from '../utils/haptics';

type AlertType = 'success' | 'error' | 'warning' | 'info';

type AppAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type ShowAlertOptions = {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AppAlertButton[];
  cancelable?: boolean;
};

type AppAlertContextValue = {
  showAlert: (options: ShowAlertOptions) => void;
  hideAlert: () => void;
};

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

let nativeAlert: typeof Alert.alert | null = null;

const friendlyMessage = (title?: string, message?: string) => {
  const raw = `${title || ''} ${message || ''}`.toLowerCase();

  const isLoginAlert =
    raw.includes('login failed') ||
    raw.includes('sign in failed') ||
    raw.includes('could not sign you in');
  const looksLikeCredentialPermissionFailure =
    raw.includes('not allowed to do this') ||
    raw.includes('access denied') ||
    raw.includes('forbidden') ||
    raw.includes('bad credentials') ||
    raw.includes('invalid credentials');

  if (isLoginAlert && looksLikeCredentialPermissionFailure) {
    return 'The email or password is incorrect. Please check your details and try again.';
  }

  if (
    raw.includes('request timed out') ||
    raw.includes('taking too long') ||
    raw.includes('timeout') ||
    raw.includes('aborted') ||
    raw.includes('aborterror')
  ) {
    return 'The server is taking too long to respond. Please check your internet connection and try again.';
  }

  if (raw.includes('network request failed') || raw.includes('failed to fetch')) {
    return 'Cannot connect to our servers. Check your internet connection and try again.';
  }

  if (
    raw.includes('status 401') ||
    raw.includes('unauthorized') ||
    raw.includes('jwt') ||
    raw.includes('token')
  ) {
    if (raw.includes('login') || raw.includes('sign in') || raw.includes('password')) {
      return 'The email or password is incorrect. Please check your details and try again.';
    }

    return 'Your session has expired. Please sign in again.';
  }

  if (
    raw.includes('/vault/family/members') &&
    (raw.includes('status 403') || raw.includes('forbidden'))
  ) {
    return 'Only Family plan users can add members. Upgrade to Family or refresh your subscription status if you already upgraded.';
  }

  if (raw.includes('status 403') || raw.includes('forbidden')) {
    if (raw.includes('document') || raw.includes('upload')) {
      return 'Document upload is only available on the Premium and Family plans.';
    }

    if (raw.includes('family')) {
      return 'This feature is only available on the Family plan.';
    }

    if (raw.includes('premium')) {
      return 'This feature is only available on Premium and Family plans.';
    }

    return 'You do not have permission to do this.';
  }

  if (
    raw.includes('not on the guardian') ||
    raw.includes('no guardian account') ||
    raw.includes('no account found')
  ) {
    return 'That email is not registered on The Guardian. Ask the person to create an account first, then add them again.';
  }

  if (raw.includes('status 404') || raw.includes('not found')) {
    return 'We could not find what you are looking for.';
  }

  if (raw.includes('status 500') || raw.includes('internal server')) {
    return 'Something went wrong on our server. Please try again shortly.';
  }

  if (message?.includes('Request failed with status')) {
    return 'Something went wrong. Please try again.';
  }

  return message || 'Something went wrong. Please try again.';
};

const getAlertType = (title?: string, message?: string): AlertType => {
  const raw = `${title || ''} ${message || ''}`.toLowerCase();

  if (
    raw.includes('success') ||
    raw.includes('saved') ||
    raw.includes('created') ||
    raw.includes('copied') ||
    raw.includes('sent')
  ) {
    return 'success';
  }

  if (
    raw.includes('warning') ||
    raw.includes('premium') ||
    raw.includes('family plan') ||
    raw.includes('permission') ||
    raw.includes('expired')
  ) {
    return 'warning';
  }

  if (
    raw.includes('failed') ||
    raw.includes('error') ||
    raw.includes('wrong') ||
    raw.includes('unauthorized') ||
    raw.includes('forbidden') ||
    raw.includes('not found') ||
    raw.includes('cannot')
  ) {
    return 'error';
  }

  return 'info';
};

const convertButtons = (buttons?: AlertButton[]): AppAlertButton[] => {
  if (!buttons || buttons.length === 0) {
    return [{ text: 'OK', style: 'default' }];
  }

  return buttons.map((button) => ({
    text: button.text || 'OK',
    onPress: button.onPress,
    style: button.style || 'default',
  }));
};

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const { isDark, isOled, colors: C } = useAppTheme();
  const pathname = usePathname();
  const blurTarget = useBlurTarget();

  const [visible, setVisible] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<ShowAlertOptions | null>(null);

  const mountedRef = useRef(false);
  const closingRef = useRef(false);
  const pathnameRef = useRef(pathname);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;
  const translateYAnim = useRef(new Animated.Value(12)).current;

  const styles = makeStyles(C, isDark, isOled);

  const iconColor =
    currentAlert?.type === 'success'
      ? '#22C55E'
      : currentAlert?.type === 'warning'
      ? '#F59E0B'
      : currentAlert?.type === 'error'
      ? '#EF4444'
      : C.primary;

  const showAnimation = useCallback(() => {
    fadeAnim.stopAnimation();
    scaleAnim.stopAnimation();
    translateYAnim.stopAnimation();

    fadeAnim.setValue(0);
    scaleAnim.setValue(0.96);
    translateYAnim.setValue(12);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        speed: 28,
        bounciness: 5,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, translateYAnim]);

  const hideAlert = useCallback(() => {
    if (!mountedRef.current || closingRef.current) return;

    closingRef.current = true;

    fadeAnim.stopAnimation();
    scaleAnim.stopAnimation();
    translateYAnim.stopAnimation();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 100,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: 100,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 8,
        duration: 100,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!mountedRef.current) return;

      setVisible(false);
      setCurrentAlert(null);
      closingRef.current = false;
    });
  }, [fadeAnim, scaleAnim, translateYAnim]);

const showAlert = useCallback(
  (options: ShowAlertOptions) => {
    const cleanedMessage = friendlyMessage(options.title, options.message);
    const type = options.type || getAlertType(options.title, cleanedMessage);

    hapticForAlert(type);

    if (Platform.OS === 'ios') {
      Alert.alert(
        options.title,
        cleanedMessage,
        options.buttons?.map((button) => ({
          text: button.text,
          style: button.style,
          onPress: button.onPress,
        })),
        { cancelable: options.cancelable }
      );
      return;
    }

    closingRef.current = false;

    setCurrentAlert({
      ...options,
      message: cleanedMessage,
      type,
      buttons:
        options.buttons && options.buttons.length > 0
          ? options.buttons
          : [{ text: 'OK', style: 'default' }],
    });

    setVisible(true);

    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      showAnimation();
    });
  },
  [showAnimation]
);

useEffect(() => {
    mountedRef.current = true;

    if (!nativeAlert) {
      nativeAlert = Alert.alert;
    }

    if (Platform.OS === 'android') {
      Alert.alert = (
        title: string,
        message?: string,
        buttons?: AlertButton[],
        options?: { cancelable?: boolean }
      ) => {
        showAlert({
          title,
          message,
          buttons: convertButtons(buttons),
          cancelable: options?.cancelable,
        });
      };
    }

    return () => {
      mountedRef.current = false;

      fadeAnim.stopAnimation();
      scaleAnim.stopAnimation();
      translateYAnim.stopAnimation();

      if (nativeAlert) {
        Alert.alert = nativeAlert;
      }
    };
  }, [fadeAnim, scaleAnim, translateYAnim, showAlert]);


  useEffect(() => {
    if (pathnameRef.current === pathname) return;

    pathnameRef.current = pathname;
    closingRef.current = false;

    fadeAnim.stopAnimation();
    scaleAnim.stopAnimation();
    translateYAnim.stopAnimation();

    setVisible(false);
    setCurrentAlert(null);
  }, [fadeAnim, pathname, scaleAnim, translateYAnim]);

  const handleButtonPress = (button: AppAlertButton) => {
    hapticLight();
    hideAlert();

    setTimeout(() => {
      button.onPress?.();
    }, 120);
  };

  const renderIcon = () => {
    if (currentAlert?.type === 'success') {
      return <CheckCircle2 size={28} color={iconColor} />;
    }

    if (currentAlert?.type === 'warning') {
      return <AlertTriangle size={28} color={iconColor} />;
    }

    if (currentAlert?.type === 'error') {
      return <XCircle size={28} color={iconColor} />;
    }

    return <Info size={28} color={iconColor} />;
  };

  return (
    <AppAlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          if (currentAlert?.cancelable !== false) {
            hideAlert();
          }
        }}
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
            style={[
              styles.backdrop,
              {
                opacity: fadeAnim,
              },
            ]}
          />

          <Animated.View
            style={[
              styles.alertCard,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
              },
            ]}
          >
            <View style={styles.topRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor:
                      currentAlert?.type === 'success'
                        ? 'rgba(34,197,94,0.14)'
                        : currentAlert?.type === 'warning'
                        ? 'rgba(245,158,11,0.14)'
                        : currentAlert?.type === 'error'
                        ? 'rgba(239,68,68,0.14)'
                        : 'rgba(59,130,246,0.14)',
                  },
                ]}
              >
                {renderIcon()}
              </View>

              <Pressable
                style={styles.closeButton}
                onPress={hideAlert}
                hitSlop={10}
              >
                <X size={20} color={C.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.title}>{currentAlert?.title || 'Notice'}</Text>

            {!!currentAlert?.message && (
              <Text style={styles.message}>{currentAlert.message}</Text>
            )}

            <View
              style={[
                styles.buttonsWrap,
                (currentAlert?.buttons?.length || 0) > 1 && styles.buttonsRow,
              ]}
            >
              {(currentAlert?.buttons || [{ text: 'OK' }]).map((button, index) => {
                const isDestructive = button.style === 'destructive';
                const isCancel = button.style === 'cancel';

                return (
                  <Pressable
                    key={`${button.text}-${index}`}
                    style={({ pressed }) => [
                      styles.actionButton,
                      (currentAlert?.buttons?.length || 0) > 1 && styles.actionButtonRow,
                      isCancel && styles.cancelButton,
                      isDestructive && styles.destructiveButton,
                      pressed && styles.pressedButton,
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        isCancel && styles.cancelButtonText,
                        isDestructive && styles.destructiveButtonText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </AppAlertContext.Provider>
  );
}

export function useAppAlert() {
  const context = useContext(AppAlertContext);
  const activeRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;

      return () => {
        activeRef.current = false;
        context?.hideAlert();
      };
    }, [context?.hideAlert])
  );

  const showAlert = useCallback(
    (options: ShowAlertOptions) => {
      if (!activeRef.current || !context) return;

      context.showAlert({
        ...options,
        buttons: options.buttons?.map((button) => ({
          ...button,
          onPress: button.onPress
            ? () => {
                if (activeRef.current) {
                  button.onPress?.();
                }
              }
            : undefined,
        })),
      });
    },
    [context?.showAlert]
  );

  if (!context) {
    throw new Error('useAppAlert must be used inside AppAlertProvider');
  }

  return {
    showAlert,
    hideAlert: context.hideAlert,
  };
}

const color = (C: any, key: string, fallback: string) => C?.[key] || fallback;

const makeStyles = (C: any, isDark: boolean, isOled: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22,
    },

    fallbackBlur: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled ? 'rgba(0,0,0,0.82)' : isDark ? 'rgba(2,6,23,0.72)' : 'rgba(15,23,42,0.24)',
    },

    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled ? 'rgba(0,0,0,0.48)' : isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)',
    },

    alertCard: {
      width: '100%',
      maxWidth: 390,
      borderRadius: 28,
      padding: 20,
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.96)'
        : isDark
        ? 'rgba(15,23,42,0.96)'
        : 'rgba(255,255,255,0.96)',
      borderWidth: 1,
      borderColor: color(C, 'border', isOled ? '#18231F' : isDark ? '#243044' : '#E2E8F0'),
      shadowColor: '#000',
      shadowOpacity: isOled ? 0.55 : 0.22,
      shadowRadius: 26,
      shadowOffset: {
        width: 0,
        height: 18,
      },
      elevation: 22,
    },

    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },

    iconCircle: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
    },

    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color(
        C,
        'backgroundSelected',
        isOled ? '#050A08' : isDark ? '#1E293B' : '#F1F5F9'
      ),
    },

    title: {
      color: color(C, 'text', isDark ? '#F8FAFC' : '#0F172A'),
      fontSize: 22,
      fontWeight: '900',
      marginBottom: 8,
    },

    message: {
      color: color(C, 'textSecondary', isDark ? '#CBD5E1' : '#64748B'),
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 20,
    },

    buttonsWrap: {
      gap: 10,
    },

    buttonsRow: {
      flexDirection: 'row',
    },

    actionButton: {
      minHeight: 50,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      backgroundColor: color(C, 'backgroundbutton', color(C, 'primary', '#16A34A')),
    },

    actionButtonRow: {
      flex: 1,
    },

    actionButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },

    cancelButton: {
      backgroundColor: color(
        C,
        'backgroundSelected',
        isOled ? '#050A08' : isDark ? '#1E293B' : '#F1F5F9'
      ),
    },

    cancelButtonText: {
      color: color(C, 'text', isDark ? '#F8FAFC' : '#0F172A'),
    },

    destructiveButton: {
      backgroundColor: color(C, 'danger', '#EF4444'),
    },

    destructiveButtonText: {
      color: '#FFFFFF',
    },

    pressedButton: {
      opacity: 0.82,
      transform: [{ scale: 0.98 }],
    },
  });