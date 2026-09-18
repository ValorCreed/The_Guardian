import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import AddScreenEntrance from '../components/AddScreenEntrance';
import { api, isDuressSession } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { encryptPassword } from '../utils/vaultcrypto';
import { hapticSelection, hapticToggleOff, hapticToggleOn, hapticWarning } from '../utils/haptics';
import { syncGuardianAutofillCache } from '../services/autofillSync';
import { useScreenAlert } from '../hooks/useScreenAlert';
import FloatingLabelInput from '../components/FloatingLabelInput';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}';
const FREE_PASSWORD_LIMIT = 10;
type Plan = 'FREE' | 'PREMIUM' | 'FAMILY' | string;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 32;
const WEBSITE_CHECK_DEBOUNCE_MS = 650;
const WEBSITE_CHECK_TIMEOUT_MS = 6500;

type PasswordLengthBoundary = 'min' | 'max' | null;

type WebsiteCheckState = {
  status: 'idle' | 'app' | 'checking' | 'reachable' | 'warning' | 'unreachable' | 'invalid';
  title: string;
  detail: string;
  normalizedUrl?: string;
};

const IDLE_WEBSITE_CHECK: WebsiteCheckState = {
  status: 'idle',
  title: '',
  detail: '',
};

const looksLikeWebsiteCandidate = (value: string) => {
  const input = value.trim();
  if (!input || /\s/.test(input)) return false;

  return (
    /^https?:\/\//i.test(input) ||
    /^www\./i.test(input) ||
    /^[^/@]+\.[A-Za-z]{2,}(?:[/:?#]|$)/.test(input)
  );
};

const inspectWebsiteCandidate = (
  value: string
):
  | { kind: 'app' }
  | { kind: 'invalid'; title: string; detail: string }
  | { kind: 'warning'; title: string; detail: string }
  | { kind: 'website'; url: string; hostname: string } => {
  const input = value.trim();

  if (!looksLikeWebsiteCandidate(input)) {
    return { kind: 'app' };
  }

  try {
    const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const parsed = new URL(withScheme);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

    if (!hostname || !hostname.includes('.')) {
      return {
        kind: 'invalid',
        title: 'Website address looks incomplete',
        detail: 'Enter a complete domain such as example.com.',
      };
    }

    if (parsed.username || parsed.password) {
      return {
        kind: 'warning',
        title: 'Website needs review',
        detail: 'Addresses containing embedded usernames or passwords can be misleading. Check the domain carefully.',
      };
    }

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname.includes(':')
    ) {
      return {
        kind: 'warning',
        title: 'Website needs review',
        detail: 'Local hosts and direct IP addresses cannot be treated as a verified public website.',
      };
    }

    if (hostname.split('.').some((label) => !/^[a-z0-9-]+$/i.test(label) || label.startsWith('-') || label.endsWith('-'))) {
      return {
        kind: 'invalid',
        title: 'Website address is not valid',
        detail: 'Check the spelling and domain format.',
      };
    }

    if (hostname.includes('xn--')) {
      return {
        kind: 'warning',
        title: 'Lookalike-domain warning',
        detail: 'This domain uses internationalized/punycode characters. Confirm the spelling before saving credentials.',
      };
    }

    if (parsed.protocol !== 'https:') {
      return {
        kind: 'warning',
        title: 'HTTPS required',
        detail: 'Use the secure HTTPS version of this website before trusting it with credentials.',
      };
    }

    parsed.hash = '';

    return {
      kind: 'website',
      url: parsed.toString(),
      hostname,
    };
  } catch {
    return {
      kind: 'invalid',
      title: 'Website address is not valid',
      detail: 'Check the spelling and enter a valid domain such as example.com.',
    };
  }
};

const generatePassword = (length: number, useNumbers: boolean, useSymbols: boolean) => {
  let chars = LOWER + UPPER;
  const required = [LOWER[Math.floor(Math.random() * LOWER.length)], UPPER[Math.floor(Math.random() * UPPER.length)]];

  if (useNumbers) {
    chars += NUMBERS;
    required.push(NUMBERS[Math.floor(Math.random() * NUMBERS.length)]);
  }

  if (useSymbols) {
    chars += SYMBOLS;
    required.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  }

  while (required.length < length) {
    required.push(chars.charAt(Math.floor(Math.random() * chars.length)));
  }

  return required.sort(() => Math.random() - 0.5).join('');
};

const getStrengthScore = (value: string) => {
  let score = 0;
  if (value.length >= 8) score += 15;
  if (value.length >= 12) score += 20;
  if (value.length >= 16) score += 15;
  if (/[a-z]/.test(value)) score += 10;
  if (/[A-Z]/.test(value)) score += 15;
  if (/[0-9]/.test(value)) score += 10;
  if (/[^A-Za-z0-9]/.test(value)) score += 15;
  return Math.max(0, Math.min(100, score));
};

const AddPasswordScreen = () => {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const router = useRouter();
  const params = useLocalSearchParams<{ generatedPassword?: string }>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [website, setWebsite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [passLength, setPassLength] = useState(16);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [passwordCount, setPasswordCount] = useState(0);
  const [checkingLimits, setCheckingLimits] = useState(true);
  const [lengthBoundaryNotice, setLengthBoundaryNotice] =
    useState<PasswordLengthBoundary>(null);
  const [websiteCheck, setWebsiteCheck] =
    useState<WebsiteCheckState>(IDLE_WEBSITE_CHECK);

  useEffect(() => {
    if (params.generatedPassword) {
      setPassword(String(params.generatedPassword));
    } else if (!password) {
      setPassword(generatePassword(passLength, includeNumbers, includeSymbols));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.generatedPassword]);

  useEffect(() => {
    const trimmedWebsite = website.trim();

    if (!trimmedWebsite) {
      setWebsiteCheck(IDLE_WEBSITE_CHECK);
      return;
    }

    const inspected = inspectWebsiteCandidate(trimmedWebsite);

    if (inspected.kind === 'app') {
      setWebsiteCheck({
        status: 'app',
        title: 'App name',
        detail: 'Website safety checking applies when you enter a web domain.',
      });
      return;
    }

    if (inspected.kind === 'invalid' || inspected.kind === 'warning') {
      setWebsiteCheck({
        status: inspected.kind,
        title: inspected.title,
        detail: inspected.detail,
      });
      return;
    }

    setWebsiteCheck({
      status: 'checking',
      title: 'Checking website',
      detail: `Testing secure reachability for ${inspected.hostname}…`,
      normalizedUrl: inspected.url,
    });

    const controller = new AbortController();
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;

    const debounce = setTimeout(async () => {
      requestTimeout = setTimeout(() => {
        controller.abort();
      }, WEBSITE_CHECK_TIMEOUT_MS);

      try {
        await fetch(inspected.url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: controller.signal,
        });

        setWebsiteCheck({
          status: 'reachable',
          title: 'HTTPS site reachable',
          detail: `${inspected.hostname} responded over HTTPS. This confirms encrypted reachability, not ownership or phishing reputation.`,
          normalizedUrl: inspected.url,
        });
      } catch (error: any) {
        if (controller.signal.aborted) {
          setWebsiteCheck({
            status: 'unreachable',
            title: 'Website could not be checked',
            detail: 'The HTTPS check timed out. Recheck the address before saving credentials.',
            normalizedUrl: inspected.url,
          });
        } else {
          setWebsiteCheck({
            status: 'unreachable',
            title: 'Website could not be reached',
            detail: 'The secure address did not respond to this check. Confirm the spelling before saving credentials.',
            normalizedUrl: inspected.url,
          });
        }
      } finally {
        if (requestTimeout) clearTimeout(requestTimeout);
      }
    }, WEBSITE_CHECK_DEBOUNCE_MS);

    return () => {
      clearTimeout(debounce);
      if (requestTimeout) clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [website]);

  useEffect(() => {
    const loadPlanLimits = async () => {
      try {
        setCheckingLimits(true);
        const duress = await isDuressSession();
        const vaultItems = await requestApi.getVaultItems().catch(() => []);

        if (duress) {
          // A valid duress session is already revalidated as Premium/Family by
          // Auth Service. Never call Subscription Service from the decoy vault.
          setPlan('PREMIUM');
        } else {
          const subscription = await requestApi
            .getSubscription()
            .catch(() => ({ plan: 'FREE' }));
          setPlan(subscription?.plan || 'FREE');
        }
        setPasswordCount(Array.isArray(vaultItems) ? vaultItems.length : 0);
      } finally {
        setCheckingLimits(false);
      }
    };

    loadPlanLimits();
  }, []);

  const score = useMemo(() => getStrengthScore(password), [password]);
  const scoreColor = score >= 75 ? C.success : score >= 45 ? C.warning : C.danger;
  const scoreLabel = score >= 75 ? 'Strong' : score >= 45 ? 'Moderate' : 'Weak';
  const isPaidPlan = String(plan).toUpperCase() === 'PREMIUM' || String(plan).toUpperCase() === 'FAMILY';
  const freePasswordLimitReached = !isPaidPlan && passwordCount >= FREE_PASSWORD_LIMIT;

  const regenerate = (length = passLength, numbers = includeNumbers, symbols = includeSymbols) => {
    setPassword(generatePassword(length, numbers, symbols));
  };

  const adjustPasswordLength = (direction: -1 | 1) => {
    if (direction < 0 && passLength <= MIN_PASSWORD_LENGTH) {
      if (lengthBoundaryNotice !== 'min') {
        hapticWarning();
        screenAlert(
          'Minimum length reached',
          `${MIN_PASSWORD_LENGTH} characters is the minimum quick-generator length. Increase the length before trying to reduce it again.`
        );
      }
      setLengthBoundaryNotice('min');
      return;
    }

    if (direction > 0 && passLength >= MAX_PASSWORD_LENGTH) {
      if (lengthBoundaryNotice !== 'max') {
        hapticWarning();
        screenAlert(
          'Maximum length reached',
          `${MAX_PASSWORD_LENGTH} characters is the maximum quick-generator length. Reduce the length before trying to increase it again.`
        );
      }
      setLengthBoundaryNotice('max');
      return;
    }

    const newLength = passLength + direction;
    setLengthBoundaryNotice(null);
    hapticSelection();
    setPassLength(newLength);
    regenerate(newLength, includeNumbers, includeSymbols);
  };

  const showPasswordLimitAlert = (message?: string) => {
    screenAlert(
      'Password limit reached',
      message || `Your Free plan can save up to ${FREE_PASSWORD_LIMIT} passwords. Upgrade to Premium or Family for unlimited password storage.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription?from=addpassword') },
      ]
    );
  };

  const handleSave = async () => {
    if (saving) return;

    if (freePasswordLimitReached) {
      showPasswordLimitAlert();
      return;
    }

    if (!website.trim()) {
      screenAlert('Missing website', 'Please enter the website or app name.');
      return;
    }

    if (!username.trim()) {
      screenAlert('Missing username', 'Please enter the username or email.');
      return;
    }

    if (!password) {
      screenAlert('Missing password', 'Please enter or generate a password.');
      return;
    }

    try {
      setSaving(true);

      await requestApi.createVaultItem({
        itemType: 'PASSWORD',
        title: website.trim(),
        website: website.trim(),
        usernameValue: username.trim(),
        encryptedPassword: encryptPassword(password),
        notes: notes.trim(),
      });

      void syncGuardianAutofillCache().catch(() => undefined);

      screenAlert('Saved', 'Password saved securely to your vault.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      const code = String(error?.code || '').toUpperCase();
      const message = String(error?.message || '');
      const lowerMessage = message.toLowerCase();

      if (
        code === 'PLAN_LIMIT_REACHED' ||
        lowerMessage.includes('free plan') ||
        lowerMessage.includes('password limit') ||
        lowerMessage.includes('vault limit')
      ) {
        showPasswordLimitAlert(message);
        return;
      }

      screenAlert('Save failed', message || 'Could not save password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AddScreenEntrance
      style={styles.container}
      backgroundColor={C.background}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add password</Text>
            {/* <Text>
              
            </Text> */}
          </View>

          <TouchableOpacity
            style={styles.advancedGeneratorCard}
            activeOpacity={0.86}
            onPress={() => {
              hapticSelection();
              router.push('/passwordgenerator');
            }}
            accessibilityRole="button"
            accessibilityLabel="Open advanced password generator"
          >
            <View style={styles.advancedGeneratorIcon}>
              <Ionicons name="sparkles" size={25} color="#FFFFFF" />
            </View>

            <View style={styles.advancedGeneratorCopy}>
              <Text style={styles.advancedGeneratorEyebrow}>PASSWORD TOOL</Text>
              <Text style={styles.advancedGeneratorTitle}>Advanced generator</Text>
              <Text style={styles.advancedGeneratorText}>
                Build a custom password with more controls.
              </Text>
            </View>

            <View style={styles.advancedGeneratorArrow}>
              <Ionicons name="arrow-forward" size={19} color={C.primary} />
            </View>
          </TouchableOpacity>

          {freePasswordLimitReached && (
            <View style={styles.limitBox}>
              <View style={styles.limitIcon}>
                <Ionicons name="alert-circle-outline" size={21} color={C.warning} />
              </View>
              <Text style={styles.limitText}>
                Free plan limit reached. Upgrade to save more passwords.
              </Text>
            </View>
          )}

          <View style={styles.formCard}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="key-outline" size={20} color={C.primary} />
              </View>
              <View style={styles.sectionHeadingCopy}>
                <Text style={styles.sectionTitle}>Login details</Text>
                {/* <Text style={styles.sectionSubtitle}>
                  Enter the app or website and account information.
                </Text> */}
              </View>
            </View>

            <FloatingLabelInput
              style={styles.input}
              label="Website or app"
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            {websiteCheck.status !== 'idle' && websiteCheck.status !== 'app' && (
              <View
                style={[
                  styles.websiteCheckCard,
                  websiteCheck.status === 'reachable' && styles.websiteCheckCardSuccess,
                  (websiteCheck.status === 'warning' ||
                    websiteCheck.status === 'unreachable') &&
                    styles.websiteCheckCardWarning,
                  websiteCheck.status === 'invalid' && styles.websiteCheckCardDanger,
                ]}
                accessibilityLiveRegion="polite"
              >
                <View
                  style={[
                    styles.websiteCheckIcon,
                    websiteCheck.status === 'reachable' && {
                      backgroundColor: `${C.success}18`,
                    },
                    (websiteCheck.status === 'warning' ||
                      websiteCheck.status === 'unreachable') && {
                      backgroundColor: `${C.warning}18`,
                    },
                    websiteCheck.status === 'invalid' && {
                      backgroundColor: `${C.danger}18`,
                    },
                  ]}
                >
                  {websiteCheck.status === 'checking' ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Ionicons
                      name={
                        websiteCheck.status === 'reachable'
                          ? 'shield-checkmark-outline'
                          : websiteCheck.status === 'invalid'
                            ? 'close-circle-outline'
                            : 'warning-outline'
                      }
                      size={19}
                      color={
                        websiteCheck.status === 'reachable'
                          ? C.success
                          : websiteCheck.status === 'invalid'
                            ? C.danger
                            : C.warning
                      }
                    />
                  )}
                </View>

                <View style={styles.websiteCheckCopy}>
                  <Text
                    style={[
                      styles.websiteCheckTitle,
                      websiteCheck.status === 'reachable' && { color: C.success },
                      (websiteCheck.status === 'warning' ||
                        websiteCheck.status === 'unreachable') && {
                        color: C.warning,
                      },
                      websiteCheck.status === 'invalid' && { color: C.danger },
                    ]}
                  >
                    {websiteCheck.title}
                  </Text>
                  <Text style={styles.websiteCheckDetail}>{websiteCheck.detail}</Text>
                </View>
              </View>
            )}

            <FloatingLabelInput
              style={styles.input}
              label="Username or email"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
            />

            <View style={styles.passwordRow}>
              <FloatingLabelInput
                label="Password"
                style={styles.passwordField}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <TouchableOpacity
                onPress={() => regenerate()}
                style={styles.iconButton}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Generate another password"
              >
                <Ionicons name="refresh-outline" size={21} color={C.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.scorePanel}>
              <View style={styles.scoreHeading}>
                <Text style={styles.scoreTitle}>Password strength</Text>
                <Text style={[styles.scoreLabel, { color: scoreColor }]}>
                  {scoreLabel}
                </Text>
              </View>
              <View style={styles.scoreTrack}>
                <View
                  style={[
                    styles.scoreFill,
                    {
                      width: `${score}%`,
                      backgroundColor: scoreColor,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.generatorCard}>
            <View style={styles.generatorHeader}>
              <View style={styles.generatorIcon}>
                <Ionicons name="flash" size={20} color={C.primary} />
              </View>
              <View style={styles.generatorHeadingCopy}>
                <Text style={styles.generatorTitle}>Quick generator</Text>
                <Text style={styles.generatorSub}>
                  Adjust the essentials without leaving this page.
                </Text>
              </View>
            </View>

            <View style={styles.generatorControlCard}>
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>Length</Text>
                <View style={styles.sliderControls}>
                  <TouchableOpacity
                    style={styles.sliderBtn}
                    activeOpacity={0.8}
                    onPress={() => adjustPasswordLength(-1)}
                  >
                    <Ionicons name="remove" size={19} color={C.primary} />
                  </TouchableOpacity>

                  <View style={styles.sliderValuePill}>
                    <Text style={styles.sliderValue}>{passLength}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.sliderBtn}
                    activeOpacity={0.8}
                    onPress={() => adjustPasswordLength(1)}
                  >
                    <Ionicons name="add" size={19} color={C.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.toggleDivider} />

              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleLabel}>Include numbers</Text>
                  <Text style={styles.toggleDescription}>Adds digits from 0 to 9.</Text>
                </View>
                <Switch
                  value={includeNumbers}
                  onValueChange={(val) => {
                    val ? hapticToggleOn() : hapticToggleOff();
                    setIncludeNumbers(val);
                    regenerate(passLength, val, includeSymbols);
                  }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={C.border}
                />
              </View>

              <View style={styles.toggleDivider} />

              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleLabel}>Include symbols</Text>
                  <Text style={styles.toggleDescription}>Adds special characters.</Text>
                </View>
                <Switch
                  value={includeSymbols}
                  onValueChange={(val) => {
                    val ? hapticToggleOn() : hapticToggleOff();
                    setIncludeSymbols(val);
                    regenerate(passLength, includeNumbers, val);
                  }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={C.border}
                />
              </View>
            </View>
          </View>

          <View style={styles.notesCard}>
            <View style={styles.notesHeader}>
              <View style={styles.notesIcon}>
                <Ionicons name="document-text-outline" size={19} color={C.primary} />
              </View>
              <Text style={styles.notesTitle}>Notes</Text>
            </View>

            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              placeholder=""
              placeholderTextColor="transparent"
              accessibilityLabel="Notes"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (saving || freePasswordLimitReached || checkingLimits) &&
                styles.disabledBtn,
            ]}
            onPress={handleSave}
            disabled={saving || checkingLimits}
            activeOpacity={0.87}
          >
            {saving || checkingLimits ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={
                  freePasswordLimitReached
                    ? 'lock-closed-outline'
                    : 'checkmark-circle'
                }
                size={21}
                color="#fff"
              />
            )}
            <Text style={styles.saveBtnText}>
              {checkingLimits
                ? 'Checking plan...'
                : saving
                  ? 'Saving...'
                  : freePasswordLimitReached
                    ? 'Upgrade to Save More'
                    : 'Save Password'}
            </Text>
          </TouchableOpacity>

          <View style={styles.bottomSpace} />
        </ScrollView>
      </KeyboardAvoidingView>
    </AddScreenEntrance>
  );
};

export default AddPasswordScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 92,
      paddingBottom: 28,
    },
    header: {
      marginBottom: 18,
    },
    headerTitle: {
      color: C.text,
      fontSize: 31,
      fontWeight: '900',
      letterSpacing: -0.7,
      textAlign: 'center',
    },
    headerSubtitle: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      marginTop: 6,
    },
    advancedGeneratorCard: {
      minHeight: 112,
      borderRadius: 38,
      padding: 16,
      marginBottom: 18,
      backgroundColor: C.primary,
      borderWidth: 1,
      borderColor: `${C.primary}DD`,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      shadowColor: '#000000',
      shadowOpacity: 0.24,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 13 },
      elevation: 11,
    },
    advancedGeneratorIcon: {
      width: 54,
      height: 54,
      borderRadius: 49,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    advancedGeneratorCopy: {
      flex: 1,
      minWidth: 0,
    },
    advancedGeneratorEyebrow: {
      color: 'rgba(255,255,255,0.70)',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    advancedGeneratorTitle: {
      color: '#FFFFFF',
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '900',
      marginTop: 3,
    },
    advancedGeneratorText: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 3,
    },
    advancedGeneratorArrow: {
      width: 38,
      height: 38,
      borderRadius: 54,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    limitBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderWidth: 1,
      borderColor: `${C.warning}70`,
      backgroundColor: C.actionCard,
      borderRadius: 21,
      padding: 14,
      marginBottom: 18,
      shadowColor: '#000000',
      shadowOpacity: 0.10,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    limitIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: `${C.warning}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    limitText: {
      flex: 1,
      color: C.text,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    formCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 40,
      borderWidth: 1,
      borderColor: C.border,
      padding: 17,
      marginBottom: 18,
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 13 },
      elevation: 10,
    },
    sectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    sectionIcon: {
      width: 44,
      height: 44,
      borderRadius: 48,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.09,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    sectionHeadingCopy: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
    },
    sectionSubtitle: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 2,
    },
    label: {
      color: C.text,
      fontSize: 13,
      fontWeight: '900',
      marginBottom: 8,
    },
    input: {
      minHeight: 55,
      backgroundColor: C.background,
      borderRadius: 49,
      paddingHorizontal: 16,
      fontSize: 15,
      color: C.text,
      marginBottom: 17,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.075,
      shadowRadius: 11,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    websiteCheckCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      marginTop: -7,
      marginBottom: 17,
      padding: 13,
      borderRadius: 28,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.07,
      shadowRadius: 11,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    websiteCheckCardSuccess: {
      borderColor: `${C.success}55`,
    },
    websiteCheckCardWarning: {
      borderColor: `${C.warning}55`,
    },
    websiteCheckCardDanger: {
      borderColor: `${C.danger}55`,
    },
    websiteCheckIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    websiteCheckCopy: {
      flex: 1,
      minWidth: 0,
    },
    websiteCheckTitle: {
      color: C.text,
      fontSize: 13,
      fontWeight: '900',
    },
    websiteCheckDetail: {
      color: C.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
      marginTop: 3,
    },
    passwordRow: {
      minHeight: 60,
      backgroundColor: C.background,
      borderRadius: 52,
      paddingLeft: 16,
      paddingRight: 9,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.09,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 7 },
      elevation: 5,
    },
    passwordField: {
      flex: 1,
      minHeight: 48,
      fontSize: 15,
      color: C.text,
      paddingRight: 10,
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 45,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    scorePanel: {
      marginTop: 13,
      padding: 13,
      borderRadius: 40,
      backgroundColor: C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    scoreHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 9,
    },
    scoreTitle: {
      color: C.text,
      fontSize: 12,
      fontWeight: '800',
    },
    scoreLabel: {
      fontSize: 12,
      fontWeight: '900',
    },
    scoreTrack: {
      height: 9,
      backgroundColor: C.border,
      borderRadius: 999,
      overflow: 'hidden',
    },
    scoreFill: {
      height: 9,
      borderRadius: 999,
    },
    generatorCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 30,
      padding: 17,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 13 },
      elevation: 10,
    },
    generatorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    generatorIcon: {
      width: 44,
      height: 44,
      borderRadius: 18,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.10,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    generatorHeadingCopy: {
      flex: 1,
      minWidth: 0,
    },
    generatorTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
    },
    generatorSub: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 2,
    },
    generatorControlCard: {
      borderRadius: 21,
      paddingHorizontal: 14,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 7 },
      elevation: 5,
    },
    sliderRow: {
      minHeight: 68,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    sliderLabel: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },
    sliderControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    sliderBtn: {
      width: 36,
      height: 36,
      backgroundColor: C.actionCard,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: C.border,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.10,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    sliderValuePill: {
      minWidth: 46,
      height: 36,
      borderRadius: 13,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.primary,
      shadowOpacity: 0.20,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    sliderValue: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
      textAlign: 'center',
    },
    toggleDivider: {
      height: 1,
      backgroundColor: C.border,
    },
    toggleRow: {
      minHeight: 70,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    toggleCopy: {
      flex: 1,
      minWidth: 0,
    },
    toggleLabel: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },
    toggleDescription: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      marginTop: 2,
    },
    notesCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 19,
      shadowColor: '#000000',
      shadowOpacity: 0.13,
      shadowRadius: 19,
      shadowOffset: { width: 0, height: 11 },
      elevation: 8,
    },
    notesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    notesIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    notesTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },
    notesInput: {
      minHeight: 112,
      backgroundColor: C.background,
      borderRadius: 28,
      paddingHorizontal: 17,
      paddingVertical: 15,
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.07,
      shadowRadius: 11,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    saveBtn: {
      minHeight: 60,
      backgroundColor: C.backgroundbutton,
      borderRadius: 54,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: `${C.primary}90`,
      shadowColor: '#000000',
      shadowOpacity: 0.24,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 13 },
      elevation: 11,
    },
    disabledBtn: {
      opacity: 0.65,
      shadowOpacity: 0.08,
      elevation: 4,
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
    },
    bottomSpace: {
      height: 92,
    },
  });
