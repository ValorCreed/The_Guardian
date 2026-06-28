import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  UserRound,
  Globe,
  StickyNote,
  CreditCard,
  FileText,
  Calendar,
  ShieldCheck,
  Hash,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';

type SharedItemType = 'PASSWORD' | 'CARD' | 'DOCUMENT';

type DisplayItem = {
  id: number | string;
  itemType: SharedItemType;

  title?: string;

  usernameValue?: string;
  encryptedPassword?: string;
  encryptedData?: string;
  website?: string;
  notes?: string;

  cardName?: string;
  encryptedCardNumber?: string;
  encryptedExpiryDate?: string;
  encryptedCvv?: string;
  encryptedCardholderName?: string;
  encryptedCardHolderName?: string;

  documentName?: string;
  documentType?: string;
  encryptedFileUrl?: string;
  encryptedNotes?: string;

  ownerId?: number;
  ownerName?: string;
  ownerEmail?: string;
};

const normalizeItemType = (type?: string | string[]): SharedItemType => {
  const value = Array.isArray(type) ? type[0] : type;

  if (value === 'CARD') return 'CARD';
  if (value === 'DOCUMENT') return 'DOCUMENT';

  return 'PASSWORD';
};

const cleanSharedValue = (value?: string | null) => {
  if (!value) return '';

  let cleaned = String(value);

  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep original value if it cannot be decoded.
  }

  cleaned = cleaned.trim();

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
};

export default function SharedVaultDetailsScreen() {
  const { id, type } = useLocalSearchParams<{
    id: string;
    type?: string;
  }>();

  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [item, setItem] = useState<DisplayItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);

  const loadItem = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      const itemType = normalizeItemType(type);

      if (itemType === 'CARD') {
        const data: any = await api.getSharedCardItem(id);

        setItem({
          id: data.id,
          itemType: 'CARD',
          title: cleanSharedValue(data.cardName) || 'Shared card',
          cardName: cleanSharedValue(data.cardName),
          encryptedCardholderName: cleanSharedValue(
            data.encryptedCardholderName || data.encryptedCardHolderName
          ),
          encryptedCardHolderName: cleanSharedValue(
            data.encryptedCardHolderName || data.encryptedCardholderName
          ),
          encryptedCardNumber: cleanSharedValue(data.encryptedCardNumber),
          encryptedExpiryDate: cleanSharedValue(data.encryptedExpiryDate),
          encryptedCvv: cleanSharedValue(data.encryptedCvv),
          ownerId: data.ownerId,
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
        });

        return;
      }

      if (itemType === 'DOCUMENT') {
        const data: any = await api.getSharedDocumentItem(id);

        setItem({
          id: data.id,
          itemType: 'DOCUMENT',
          title: cleanSharedValue(data.documentName) || 'Shared document',
          documentName: cleanSharedValue(data.documentName),
          documentType: cleanSharedValue(data.documentType),
          encryptedFileUrl: cleanSharedValue(data.encryptedFileUrl),
          encryptedNotes: cleanSharedValue(data.encryptedNotes),
          ownerId: data.ownerId,
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
        });

        return;
      }

      const data: any = await api.getSharedPasswordItem(id);

      setItem({
        id: data.id,
        itemType: 'PASSWORD',
        title: cleanSharedValue(data.title) || 'Shared password',
        usernameValue: cleanSharedValue(data.usernameValue),
        encryptedPassword: cleanSharedValue(data.encryptedPassword),
        encryptedData: cleanSharedValue(data.encryptedData),
        website: cleanSharedValue(data.website),
        notes: cleanSharedValue(data.notes),
        ownerId: data.ownerId,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
      });
    } catch (error: any) {
      Alert.alert(
        'Could not open item',
        error.message || 'This shared item could not be loaded.'
      );
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, type]);

  useFocusEffect(
    useCallback(() => {
      loadItem();
    }, [loadItem])
  );

  const copyValue = async (label: string, value?: string) => {
    const cleaned = cleanSharedValue(value);

    if (!cleaned) {
      Alert.alert('Nothing to copy', `${label} is empty.`);
      return;
    }

    await Clipboard.setStringAsync(cleaned);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const hideValue = (value?: string) => {
    const cleaned = cleanSharedValue(value);

    if (!cleaned) return 'Nothing saved';

    return '•'.repeat(Math.min(cleaned.length, 18));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.centered}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Opening shared item...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) return null;

  const itemType: SharedItemType = item.itemType;

  const title =
    itemType === 'CARD'
      ? cleanSharedValue(item.cardName || item.title) || 'Shared card'
      : itemType === 'DOCUMENT'
      ? cleanSharedValue(item.documentName || item.title) || 'Shared document'
      : cleanSharedValue(item.title) || 'Shared password';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.headerIcon}>
          {itemType === 'CARD' ? (
            <CreditCard size={30} color="#fff" />
          ) : itemType === 'DOCUMENT' ? (
            <FileText size={30} color="#fff" />
          ) : (
            <KeyRound size={30} color="#fff" />
          )}
        </View>

        <Text style={styles.title}>{title}</Text>

        <Text style={styles.subtitle}>
          Shared by {item.ownerName || item.ownerEmail || 'Family admin'}
        </Text>

        {itemType === 'CARD' && (
          <SharedCardDetails
            item={item}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
            copyValue={copyValue}
            hideValue={hideValue}
            styles={styles}
            C={C}
          />
        )}

        {itemType === 'DOCUMENT' && (
          <SharedDocumentDetails
            item={item}
            copyValue={copyValue}
            styles={styles}
            C={C}
          />
        )}

        {itemType === 'PASSWORD' && (
          <SharedPasswordDetails
            item={item}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
            copyValue={copyValue}
            hideValue={hideValue}
            styles={styles}
            C={C}
          />
        )}

        <View style={styles.readOnlyBox}>
          <Text style={styles.readOnlyTitle}>Read-only shared item</Text>
          <Text style={styles.readOnlyText}>
            You can view and copy this item, but only the vault owner can edit or
            delete it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SharedPasswordDetails({
  item,
  showSecret,
  setShowSecret,
  copyValue,
  hideValue,
  styles,
  C,
}: {
  item: DisplayItem;
  showSecret: boolean;
  setShowSecret: React.Dispatch<React.SetStateAction<boolean>>;
  copyValue: (label: string, value?: string) => Promise<void>;
  hideValue: (value?: string) => string;
  styles: any;
  C: any;
}) {
  const passwordValue = cleanSharedValue(
    item.encryptedPassword || item.encryptedData || ''
  );

  return (
    <View style={styles.card}>
      <InfoRow
        icon={<UserRound size={19} color={C.primary} />}
        label="Username / Email"
        value={cleanSharedValue(item.usernameValue) || 'No username saved'}
        onCopy={() => copyValue('Username', item.usernameValue)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <SecretRow
        icon={<KeyRound size={19} color={C.primary} />}
        label="Password"
        value={passwordValue}
        hiddenValue={hideValue(passwordValue)}
        showSecret={showSecret}
        setShowSecret={setShowSecret}
        onCopy={() => copyValue('Password', passwordValue)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<Globe size={19} color={C.primary} />}
        label="Website"
        value={cleanSharedValue(item.website) || 'No website saved'}
        onCopy={() => copyValue('Website', item.website)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<StickyNote size={19} color={C.primary} />}
        label="Notes"
        value={cleanSharedValue(item.notes) || 'No notes saved'}
        onCopy={() => copyValue('Notes', item.notes)}
        styles={styles}
        C={C}
        multiline
      />
    </View>
  );
}

function SharedCardDetails({
  item,
  showSecret,
  setShowSecret,
  copyValue,
  hideValue,
  styles,
  C,
}: {
  item: DisplayItem;
  showSecret: boolean;
  setShowSecret: React.Dispatch<React.SetStateAction<boolean>>;
  copyValue: (label: string, value?: string) => Promise<void>;
  hideValue: (value?: string) => string;
  styles: any;
  C: any;
}) {
  const cardholder =
    cleanSharedValue(item.encryptedCardholderName || item.encryptedCardHolderName) ||
    'No cardholder name';

  const cardNumber = cleanSharedValue(item.encryptedCardNumber);
  const expiryDate = cleanSharedValue(item.encryptedExpiryDate);
  const cvv = cleanSharedValue(item.encryptedCvv);

  return (
    <View style={styles.card}>
      <InfoRow
        icon={<UserRound size={19} color={C.primary} />}
        label="Cardholder name"
        value={cardholder}
        onCopy={() => copyValue('Cardholder name', cardholder)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <SecretRow
        icon={<CreditCard size={19} color={C.primary} />}
        label="Card number"
        value={cardNumber || 'No card number saved'}
        hiddenValue={hideValue(cardNumber)}
        showSecret={showSecret}
        setShowSecret={setShowSecret}
        onCopy={() => copyValue('Card number', cardNumber)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<Calendar size={19} color={C.primary} />}
        label="Expiry date"
        value={expiryDate || 'No expiry date saved'}
        onCopy={() => copyValue('Expiry date', expiryDate)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <SecretRow
        icon={<ShieldCheck size={19} color={C.primary} />}
        label="CVV"
        value={cvv || 'No CVV saved'}
        hiddenValue={hideValue(cvv)}
        showSecret={showSecret}
        setShowSecret={setShowSecret}
        onCopy={() => copyValue('CVV', cvv)}
        styles={styles}
        C={C}
      />
    </View>
  );
}

function SharedDocumentDetails({
  item,
  copyValue,
  styles,
  C,
}: {
  item: DisplayItem;
  copyValue: (label: string, value?: string) => Promise<void>;
  styles: any;
  C: any;
}) {
  const documentType = cleanSharedValue(item.documentType);
  const fileValue = cleanSharedValue(item.encryptedFileUrl);
  const notes = cleanSharedValue(item.encryptedNotes || item.notes);

  return (
    <View style={styles.card}>
      <InfoRow
        icon={<FileText size={19} color={C.primary} />}
        label="Document type"
        value={documentType || 'No document type saved'}
        onCopy={() => copyValue('Document type', documentType)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<Hash size={19} color={C.primary} />}
        label="File / document value"
        value={fileValue || 'No file value saved'}
        onCopy={() => copyValue('File / document value', fileValue)}
        styles={styles}
        C={C}
        multiline
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<StickyNote size={19} color={C.primary} />}
        label="Notes"
        value={notes || 'No notes saved'}
        onCopy={() => copyValue('Notes', notes)}
        styles={styles}
        C={C}
        multiline
      />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onCopy,
  styles,
  C,
  multiline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onCopy: () => void;
  styles: any;
  C: any;
  multiline?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>

      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, multiline && styles.multilineValue]}>
          {value}
        </Text>
      </View>

      <TouchableOpacity style={styles.iconButton} onPress={onCopy}>
        <Copy size={18} color={C.text} />
      </TouchableOpacity>
    </View>
  );
}

function SecretRow({
  icon,
  label,
  value,
  hiddenValue,
  showSecret,
  setShowSecret,
  onCopy,
  styles,
  C,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hiddenValue: string;
  showSecret: boolean;
  setShowSecret: React.Dispatch<React.SetStateAction<boolean>>;
  onCopy: () => void;
  styles: any;
  C: any;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>

      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>
          {showSecret ? value || 'Nothing saved' : hiddenValue}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setShowSecret((current) => !current)}
      >
        {showSecret ? (
          <EyeOff size={18} color={C.text} />
        ) : (
          <Eye size={18} color={C.text} />
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.iconButton} onPress={onCopy}>
        <Copy size={18} color={C.text} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 140,
    },

    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    loadingText: {
      marginTop: 10,
      color: C.textSecondary,
      fontSize: 14,
    },

    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 26,
    },

    backText: {
      color: C.text,
      fontSize: 18,
      fontWeight: '600',
    },

    headerIcon: {
      width: 74,
      height: 74,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },

    title: {
      fontSize: 30,
      fontWeight: '800',
      color: C.text,
      marginBottom: 6,
    },

    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      marginBottom: 24,
    },

    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 16,
    },

    infoIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      marginRight: 12,
    },

    infoLabel: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 3,
    },

    infoValue: {
      color: C.text,
      fontSize: 16,
      fontWeight: '600',
    },

    multilineValue: {
      lineHeight: 22,
    },

    divider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 64,
    },

    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      marginLeft: 8,
    },

    readOnlyBox: {
      marginTop: 18,
      backgroundColor: C.backgroundSelected,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
    },

    readOnlyTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 4,
    },

    readOnlyText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
  });