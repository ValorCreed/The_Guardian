import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import type { ThemePalette } from '../constants/theme';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import AddScreenEntrance from '../components/AddScreenEntrance';
import { hapticMedium, hapticWarning } from '../utils/haptics';
import { api, isDuressSession } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { encryptJson } from '../utils/vaultcrypto';
import CardBrandLogo from '../components/CardBrandLogo';
import {
  formatCardNumber,
  getCardBrandDetails,
} from '../utils/cardBrand';
import { formatExpiryInput, validateCardForm } from '../utils/cardValidation';
import { syncGuardianAutofillCache } from '../services/autofillSync';
import { useScreenAlert } from '../hooks/useScreenAlert';

type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

const FREE_CARD_LIMIT = 3;

const AddCardScreen = () => {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const router = useRouter();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const scrollRef = useRef<ScrollView | null>(null);
  const cardNumberRef = useRef<TextInput | null>(null);
  const expiryRef = useRef<TextInput | null>(null);
  const cvvRef = useRef<TextInput | null>(null);
  const notesRef = useRef<TextInput | null>(null);

  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [cardCount, setCardCount] = useState(0);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const rawCardNumber = cardNumber.replace(/\D/g, '');
  const cardDetails = useMemo(
    () => getCardBrandDetails(rawCardNumber),
    [rawCardNumber]
  );

  const isPaid = plan === 'PREMIUM' || plan === 'FAMILY';
  const freeLimitReached = !isPaid && cardCount >= FREE_CARD_LIMIT;
  const detectedName =
    rawCardNumber.length === 0
      ? 'Card network'
      : cardDetails.brand === 'unknown'
        ? 'Other card'
        : cardDetails.displayName;

  useEffect(() => {
    let mounted = true;

    const loadAccess = async () => {
      try {
        setCheckingAccess(true);

        const duress = await isDuressSession();
        const savedCards = await requestApi.getCards().catch(() => []);
        const subscription = duress
          ? ({ plan: 'PREMIUM' as const })
          : await api
              .getSubscriptionFresh()
              .catch(() =>
                requestApi.getSubscription().catch(() => ({ plan: 'FREE' as const }))
              );

        if (!mounted) return;

        setPlan((subscription?.plan || 'FREE') as Plan);
        setCardCount(savedCards?.length || 0);
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    };

    loadAccess();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (cvv.length > cardDetails.securityCodeLength) {
      setCvv((current) => current.slice(0, cardDetails.securityCodeLength));
    }
  }, [cardDetails.securityCodeLength, cvv.length]);

  const handleCardNumberChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 19);
    setCardNumber(formatCardNumber(digits));
  };

  const showUpgradeAlert = () => {
    hapticWarning();
    screenAlert(
      'Card limit reached',
      `Free accounts can save up to ${FREE_CARD_LIMIT} cards. Upgrade to Premium or Family for unlimited card storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade',
          onPress: () => router.push('/subscription?from=addcard'),
        },
      ]
    );
  };

  const getDetectionStatus = () => {
    if (!rawCardNumber) return 'Detected automatically from the number';

    if (cardDetails.brand === 'unknown') {
      return rawCardNumber.length < 6
        ? 'Keep typing to identify the network'
        : cardDetails.isValid
          ? 'Valid card format; network not found'
          : 'Network not recognized yet';
    }

    if (cardDetails.isValid) return 'Detected · number format is valid';
    if (cardDetails.isComplete) return 'Detected · check the card number';
    return 'Detected';
  };

  const handleSave = async () => {
    if (saving) return;

    if (freeLimitReached) {
      showUpgradeAlert();
      return;
    }

    const validation = validateCardForm({
      cardholderName,
      cardNumber: rawCardNumber,
      expiry,
      cvv,
    });

    if (!validation.valid) {
      screenAlert(
        validation.errorTitle || 'Invalid card details',
        validation.errorMessage || 'Check the card details and try again.'
      );
      return;
    }

    try {
      setSaving(true);
      const last4 = rawCardNumber.slice(-4);
      const savedCardName =
        cardDetails.brand === 'unknown'
          ? `Card ending ${last4}`
          : cardDetails.displayName;

      await requestApi.createCard({
        cardName: savedCardName,
        encryptedCardNumber: encryptJson(validation.cardNumber),
        encryptedExpiryDate: encryptJson(validation.expiry),
        encryptedCvv: encryptJson(validation.cvv),
        encryptedCardholderName: encryptJson(cardholderName.trim()),
        encryptedNotes: encryptJson(notes.trim()),
      });

      void syncGuardianAutofillCache().catch(() => undefined);

      screenAlert('Saved', `${savedCardName} saved securely to your vault.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      const message = String(error?.message || 'Could not save card.');

      if (
        message.toUpperCase().includes('PLAN_LIMIT_REACHED') ||
        message.toLowerCase().includes('limit')
      ) {
        screenAlert(
          'Card limit reached',
          `Free accounts can save up to ${FREE_CARD_LIMIT} cards. Upgrade to Premium or Family for unlimited card storage.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Upgrade',
              onPress: () => router.push('/subscription?from=addcard'),
            },
          ]
        );
        return;
      }

      screenAlert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const displayNumber = rawCardNumber
    ? formatCardNumber(rawCardNumber)
    : '••••  ••••  ••••  ••••';
  const displayName = cardholderName || 'Cardholder Name';

  if (checkingAccess) {
    return (
      <AddScreenEntrance style={styles.container} backgroundColor={C.background}>
        <View style={styles.centered}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Checking card access...</Text>
        </View>
      </AddScreenEntrance>
    );
  }

  if (freeLimitReached) {
    return (
      <AddScreenEntrance style={styles.container} backgroundColor={C.background}>
        <View style={styles.lockedContent}>
          <View style={styles.cardIconLarge}>
            <Ionicons name="card-outline" size={42} color="#FFFFFF" />
          </View>

          <Text style={styles.lockedTitle}>Free card limit reached</Text>
          <Text style={styles.lockedSubtitle}>
            You have used {cardCount}/{FREE_CARD_LIMIT} saved cards on the Free
            plan. Upgrade to Premium or Family for unlimited encrypted card
            storage.
          </Text>

          <TouchableOpacity
            style={styles.lockedUpgradeBtn}
            onPress={() => {
              hapticMedium();
              router.push('/subscription?from=addcard');
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles-outline" size={20} color="#FFFFFF" />
            <Text style={styles.lockedUpgradeText}>Upgrade plan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.notNowBtn} onPress={() => router.back()}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </AddScreenEntrance>
    );
  }

  return (
    <AddScreenEntrance style={styles.container} backgroundColor={C.background}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add card</Text>
            {/* <Text style={styles.headerSubTitle}>
              The network and symbol update as you type.
            </Text> */}
          </View>

          <View style={styles.cardPreview}>
            <View style={styles.previewGlow} />
            <View style={styles.previewTop}>
              <CardBrandLogo brand={cardDetails.brand} />
              <Text style={styles.bankPreview}>{detectedName}</Text>
            </View>

            <Text style={styles.cardNumberPreview}>{displayNumber}</Text>

            <View style={styles.previewBottom}>
              <View style={styles.previewField}>
                <Text style={styles.previewLabel}>CARD HOLDER</Text>
                <Text style={styles.cardNamePreview} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>

              <View>
                <Text style={styles.previewLabel}>EXPIRES</Text>
                <Text style={styles.cardNamePreview}>{expiry || 'MM/YY'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Cardholder name</Text>
            <TextInput
              style={styles.input}
              placeholder="Alex Morgan"
              placeholderTextColor={C.tabInactive}
              value={cardholderName}
              onChangeText={setCardholderName}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="cc-name"
              textContentType="name"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => cardNumberRef.current?.focus()}
            />

            <Text style={styles.label}>Card number</Text>
            <TextInput
              ref={cardNumberRef}
              style={styles.input}
              placeholder="0000 0000 0000 0000"
              placeholderTextColor={C.tabInactive}
              value={cardNumber}
              onChangeText={handleCardNumberChange}
              keyboardType="number-pad"
              maxLength={23}
              autoComplete="cc-number"
              textContentType="creditCardNumber"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => expiryRef.current?.focus()}
            />

            <Text style={styles.label}>Detected card network</Text>
            <View
              style={[
                styles.detectedCard,
                cardDetails.isComplete && !cardDetails.passesLuhn
                  ? styles.detectedCardError
                  : null,
              ]}
              accessibilityRole="text"
              accessibilityLabel={`Detected card network: ${detectedName}`}
            >
              <View style={styles.detectedLogoBox}>
                <CardBrandLogo brand={cardDetails.brand} compact />
              </View>

              <View style={styles.detectedCopy}>
                <Text style={styles.detectedName}>{detectedName}</Text>
                <Text
                  style={[
                    styles.detectedStatus,
                    cardDetails.isComplete && !cardDetails.passesLuhn
                      ? styles.detectedStatusError
                      : null,
                  ]}
                >
                  {getDetectionStatus()}
                </Text>
              </View>

              <View style={styles.readOnlyPill}>
                <Ionicons name="lock-closed" size={11} color={C.textSecondary} />
                <Text style={styles.readOnlyText}>AUTO</Text>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Expiry</Text>
                <TextInput
                  ref={expiryRef}
                  style={styles.input}
                  placeholder="MM/YY"
                  placeholderTextColor={C.tabInactive}
                  value={expiry}
                  onChangeText={(value) => setExpiry(formatExpiryInput(value))}
                  keyboardType="number-pad"
                  maxLength={5}
                  autoComplete="cc-exp"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => cvvRef.current?.focus()}
                />
              </View>

              <View style={styles.halfField}>
                <View style={styles.securityCodeLabelRow}>
                  <Text style={styles.label}>CVV</Text>
                  <Text style={styles.securityCodeHint}>
                    {cardDetails.securityCodeLength} digits
                  </Text>
                </View>
                <TextInput
                  ref={cvvRef}
                  style={styles.input}
                  placeholder={
                    cardDetails.securityCodeLength === 4 ? '••••' : '•••'
                  }
                  placeholderTextColor={C.tabInactive}
                  value={cvv}
                  onChangeText={(value) =>
                    setCvv(
                      value
                        .replace(/\D/g, '')
                        .slice(0, cardDetails.securityCodeLength)
                    )
                  }
                  keyboardType="number-pad"
                  maxLength={cardDetails.securityCodeLength}
                  secureTextEntry
                  autoComplete="cc-csc"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => notesRef.current?.focus()}
                />
              </View>
            </View>

            <Text style={styles.label}>Notes</Text>
            <TextInput
              ref={notesRef}
              style={styles.notesInput}
              placeholder="Add optional notes..."
              placeholderTextColor={C.tabInactive}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              returnKeyType="default"
              onFocus={() => {
                setTimeout(() => {
                  scrollRef.current?.scrollToEnd({ animated: true });
                }, 180);
              }}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabledBtn]}
            onPress={() => {
              hapticMedium();
              handleSave();
            }}
            disabled={saving}
            activeOpacity={0.86}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#FFFFFF"
              />
            )}
            <Text style={styles.saveBtnText}>
              {saving ? 'Saving...' : `Save ${detectedName}`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </AddScreenEntrance>
  );
};

export default AddCardScreen;

const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    keyboardView: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 48,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: {
      color: C.textSecondary,
      marginTop: 10,
      fontSize: 14,
      fontWeight: '700',
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 94,
      paddingBottom: 18,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '900',
      color: C.text,
      letterSpacing: -0.4,
    },
    headerSubTitle: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 5,
      fontWeight: '700',
    },
    cardPreview: {
      backgroundColor: C.primary,
      borderRadius: 28,
      marginHorizontal: 20,
      marginBottom: 28,
      padding: 24,
      minHeight: 198,
      justifyContent: 'space-between',
      overflow: 'hidden',
      shadowColor: C.primary,
      shadowOpacity: 0.16,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 5,
    },
    previewGlow: {
      position: 'absolute',
      right: -50,
      top: -70,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: 'rgba(255,255,255,0.09)',
    },
    previewTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    bankPreview: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
      textAlign: 'right',
    },
    cardNumberPreview: {
      color: '#FFFFFF',
      fontSize: 19,
      letterSpacing: 1.7,
      fontWeight: '800',
      marginVertical: 22,
    },
    previewBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 16,
    },
    previewField: { flex: 1, minWidth: 0 },
    previewLabel: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 9,
      marginBottom: 5,
      letterSpacing: 1.1,
      fontWeight: '900',
    },
    cardNamePreview: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    form: { paddingHorizontal: 20 },
    label: {
      fontSize: 14,
      color: C.text,
      fontWeight: '900',
      marginBottom: 8,
      marginLeft: 2,
    },
    input: {
      backgroundColor: C.backgroundElement,
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 15,
      color: C.text,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: C.border,
      fontWeight: '700',
      shadowColor: '#000000',
      shadowOpacity: 0.035,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    detectedCard: {
      minHeight: 72,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 18,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.035,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    detectedCardError: {
      borderColor: C.danger,
      backgroundColor: C.alertDangerBg,
    },
    detectedLogoBox: {
      width: 66,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.primary,
    },
    detectedCopy: { flex: 1, minWidth: 0 },
    detectedName: { color: C.text, fontSize: 15, fontWeight: '900' },
    detectedStatus: {
      color: C.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
      fontWeight: '700',
    },
    detectedStatusError: { color: C.danger },
    readOnlyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
    },
    readOnlyText: {
      color: C.textSecondary,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.6,
    },
    row: { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },
    securityCodeLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    securityCodeHint: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: '800',
      marginBottom: 8,
    },
    notesInput: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 15,
      color: C.text,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
      minHeight: 110,
      textAlignVertical: 'top',
      fontWeight: '700',
      shadowColor: '#000000',
      shadowOpacity: 0.035,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    saveBtn: {
      marginHorizontal: 20,
      marginTop: 4,
      marginBottom: 20,
      minHeight: 58,
      backgroundColor: C.backgroundbutton,
      borderRadius: 50,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      shadowColor: C.primary,
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    disabledBtn: { opacity: 0.72 },
    lockedContent: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    cardIconLarge: {
      width: 86,
      height: 86,
      borderRadius: 30,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
      shadowColor: '#000000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    lockedTitle: {
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      marginBottom: 10,
    },
    lockedSubtitle: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 23,
      marginBottom: 24,
    },
    lockedUpgradeBtn: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 999,
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      shadowColor: '#000000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    lockedUpgradeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    notNowBtn: { paddingVertical: 14, alignItems: 'center' },
    notNowText: { color: C.textSecondary, fontSize: 15, fontWeight: '800' },
  });
